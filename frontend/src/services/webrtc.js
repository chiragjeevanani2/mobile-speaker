/**
 * WebRTC service for managing peer connections, media capture, audio synchronization, and low-latency streaming.
 */

/**
 * Create an RTCPeerConnection with low-latency configuration and ICE servers.
 */
export const DEFAULT_ICE_SERVERS = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302',
    ],
  },
  {
    urls: [
      'stun:stun.cloudflare.com:3478',
      'stun:global.stun.twilio.com:3478',
      'stun:stun.freeswitch.org:3478',
      'stun:stun.voiparound.com:3478',
    ],
  },
];

/**
 * Create an RTCPeerConnection with low-latency configuration and ICE servers.
 */
export function createPeerConnection(iceServers = []) {
  const configServers = iceServers && iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS;

  const defaultConfig = {
    iceServers: configServers,
    iceCandidatePoolSize: 1,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };

  return new RTCPeerConnection(defaultConfig);
}

/**
 * Mixes a media stream with a subtle continuous audio carrier.
 * This guarantees the browser continuously emits RTP audio packets even when
 * the source tab is silent/paused, preventing WebRTC DTLS/ICE stalls.
 */
export function createContinuousAudioStream(rawStream) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return { stream: rawStream, audioContext: null };
    }

    const audioCtx = new AudioContextClass({
      sampleRate: 48000,
      latencyHint: 'interactive',
    });

    const source = audioCtx.createMediaStreamSource(rawStream);
    const destination = audioCtx.createMediaStreamDestination();

    source.connect(destination);

    // Continuous keepalive node (imperceptible silence carrier to keep RTP clock active)
    if (audioCtx.createConstantSource) {
      const constantSource = audioCtx.createConstantSource();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.00001; // Inaudible
      constantSource.connect(gain);
      gain.connect(destination);
      constantSource.start();
    }

    // Ensure audio context is running
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    return {
      stream: destination.stream,
      audioContext: audioCtx,
    };
  } catch (err) {
    console.warn('[WebRTC] Continuous audio mixer fallback to raw stream:', err);
    return { stream: rawStream, audioContext: null };
  }
}

/**
 * Capture browser/tab audio using getDisplayMedia with continuous audio stream.
 */
export async function captureDisplayAudio() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // Required by browser spec to prompt tab/screen selection
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 2,
      },
    });

    const audioTracks = stream.getAudioTracks();

    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        'No audio track detected! Make sure you checked the "Share tab audio" or "Also share tab audio" checkbox in the browser popup.'
      );
    }

    // Disable video track so it consumes 0 CPU/GPU without terminating the stream
    stream.getVideoTracks().forEach((track) => {
      track.enabled = false;
    });

    const rawAudioStream = new MediaStream(audioTracks);
    const continuous = createContinuousAudioStream(rawAudioStream);

    return {
      stream: continuous.stream,
      rawAudioStream,
      screenStream: stream,
      audioContext: continuous.audioContext,
    };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Screen capture permission was cancelled. Please allow tab/audio sharing.');
    }
    if (err.name === 'NotFoundError') {
      throw new Error('No audio source found. Make sure you selected a tab with audio and enabled "Share audio".');
    }
    throw err;
  }
}

/**
 * Capture microphone audio with continuous audio stream.
 */
export async function captureMicrophoneAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 2,
      },
    });

    const continuous = createContinuousAudioStream(stream);
    return {
      stream: continuous.stream,
      rawAudioStream: stream,
      audioContext: continuous.audioContext,
    };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Microphone permission denied. Please allow microphone access.');
    }
    if (err.name === 'NotFoundError') {
      throw new Error('No microphone found on this device.');
    }
    throw err;
  }
}

/**
 * Add audio tracks from a MediaStream to a peer connection.
 */
export function addTracksToConnection(pc, stream) {
  const tracks = stream.getAudioTracks();
  tracks.forEach((track) => {
    try {
      if (pc.addTransceiver) {
        pc.addTransceiver(track, {
          direction: 'sendonly',
          streams: [stream],
        });
      } else {
        pc.addTrack(track, stream);
      }
    } catch {
      pc.addTrack(track, stream);
    }
  });
  return tracks;
}

/**
 * Optimizes SDP for ultra-low latency, constant bitrate, and multi-speaker synchronization.
 * Parses format parameters cleanly into a Map to ensure idempotency and prevent duplicate keys.
 */
export function optimizeAudioSdp(sdp) {
  if (!sdp || typeof sdp !== 'string') return sdp;

  // Split lines while preserving CRLF format
  const lines = sdp.split(/\r\n|\r|\n/);

  // Find Opus payload type from rtpmap
  let opusPayloadType = null;
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000\/2/i);
    if (match) {
      opusPayloadType = match[1];
      break;
    }
  }

  const modifiedLines = lines.map((line) => {
    let targetPayload = opusPayloadType;
    if (!targetPayload) {
      const fmtpMatch = line.match(/^a=fmtp:(\d+)\s+(.*)$/);
      if (fmtpMatch && (fmtpMatch[2].includes('minptime') || fmtpMatch[2].includes('useinbandfec') || fmtpMatch[2].includes('opus'))) {
        targetPayload = fmtpMatch[1];
      }
    }

    if (targetPayload && line.startsWith(`a=fmtp:${targetPayload} `)) {
      const existingParamsStr = line.substring(`a=fmtp:${targetPayload} `.length).trim();
      const paramMap = new Map();

      existingParamsStr.split(';').forEach((part) => {
        const [k, v] = part.trim().split('=');
        if (k) paramMap.set(k.trim(), v !== undefined ? v.trim() : '');
      });

      // Apply low latency, high fidelity stereo Opus parameters idempotently
      paramMap.set('minptime', '10');
      paramMap.set('useinbandfec', '1');
      paramMap.set('stereo', '1');
      paramMap.set('sprop-stereo', '1');
      paramMap.set('maxaveragebitrate', '128000');
      paramMap.set('cbr', '1');

      const newParams = Array.from(paramMap.entries())
        .map(([k, v]) => (v !== '' ? `${k}=${v}` : k))
        .join(';');

      return `a=fmtp:${targetPayload} ${newParams}`;
    }
    return line;
  });

  return modifiedLines.join('\r\n');
}

/**
 * Configures fixed low-latency playout delay hints on all audio receivers.
 * This ensures all connected phones sync their internal jitter buffers to ~40ms.
 */
export function configureLowLatencyPlayout(pc) {
  if (!pc || !pc.getReceivers) return;

  try {
    pc.getReceivers().forEach((receiver) => {
      if (receiver.track && receiver.track.kind === 'audio') {
        // Set fixed playout delay (40ms) across all devices
        if ('playoutDelayHint' in receiver) {
          receiver.playoutDelayHint = 0.04;
        }
        if ('jitterBufferTarget' in receiver) {
          receiver.jitterBufferTarget = 40;
        }
      }
    });
  } catch {
    // Optional receiver hints
  }
}

/**
 * Create an audio visualizer using Web Audio API.
 */
export function createAudioVisualizer(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();

  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.8;

  source.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  let animationId = null;

  function getLevel() {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    return sum / bufferLength / 255;
  }

  function getFrequencyData() {
    analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  function startLoop(callback) {
    function loop() {
      callback(getLevel(), getFrequencyData());
      animationId = requestAnimationFrame(loop);
    }
    loop();
  }

  function stop() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    try {
      source.disconnect();
      audioContext.close();
    } catch {}
  }

  return { getLevel, getFrequencyData, startLoop, stop };
}

/**
 * Get connection stats from an RTCPeerConnection.
 */
export async function getConnectionStats(pc) {
  try {
    const stats = await pc.getStats();
    let latency = null;

    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime) {
        latency = Math.round(report.currentRoundTripTime * 1000);
      }
    });

    return { latency };
  } catch {
    return { latency: null };
  }
}

/**
 * Clean up a peer connection.
 */
export function cleanupPeerConnection(pc) {
  if (pc) {
    try {
      pc.close();
    } catch {}
  }
}

/**
 * Clean up a media stream's tracks.
 */
export function cleanupStream(stream) {
  if (stream) {
    try {
      stream.getTracks().forEach((track) => track.stop());
    } catch {}
  }
}

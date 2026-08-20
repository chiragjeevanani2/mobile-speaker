/**
 * WebRTC service for managing peer connections, media capture, and audio streaming.
 */

/**
 * Create an RTCPeerConnection with the given ICE servers.
 */
export function createPeerConnection(iceServers = []) {
  const defaultConfig = {
    iceServers: iceServers.length > 0
      ? iceServers
      : [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
  };

  return new RTCPeerConnection(defaultConfig);
}

/**
 * Capture browser/tab audio using getDisplayMedia.
 * Returns the MediaStream with audio tracks.
 */
export async function captureDisplayAudio() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // Required by spec even though we only want audio
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
      },
    });

    // We only need the audio tracks
    const audioTracks = stream.getAudioTracks();

    if (audioTracks.length === 0) {
      // Stop all tracks (including video) if no audio
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        'No audio track available. Make sure to enable "Share audio" when prompted.'
      );
    }

    // Stop video tracks — we don't need video
    stream.getVideoTracks().forEach((track) => track.stop());

    // Create a new stream with only audio
    const audioStream = new MediaStream(audioTracks);
    return { stream: audioStream, screenStream: stream };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Screen capture permission denied. Please allow screen/audio sharing.');
    }
    if (err.name === 'NotFoundError') {
      throw new Error('No audio source found. Make sure you selected a tab with audio and enabled "Share audio".');
    }
    throw err;
  }
}

/**
 * Capture microphone audio for testing purposes.
 */
export async function captureMicrophoneAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
      },
    });
    return stream;
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
    pc.addTrack(track, stream);
  });
  return tracks;
}

/**
 * Set up audio playback from a remote stream.
 * Returns the audio element for volume control.
 */
export function setupAudioPlayback(stream, audioRef) {
  if (!audioRef.current) {
    audioRef.current = new Audio();
  }

  const audio = audioRef.current;
  audio.srcObject = stream;
  audio.autoplay = true;
  audio.playsInline = true;

  return audio;
}

/**
 * Create an audio visualizer using Web Audio API.
 * Returns controls for the animation frame and level data.
 */
export function createAudioVisualizer(stream) {
  const audioContext = new AudioContext();
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
    return sum / bufferLength / 255; // Normalized 0-1
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
    source.disconnect();
    audioContext.close();
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
 * Clean up a peer connection and its tracks.
 */
export function cleanupPeerConnection(pc) {
  if (pc) {
    pc.close();
  }
}

/**
 * Clean up a media stream's tracks.
 */
export function cleanupStream(stream) {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
}

/**
 * Check browser support for required APIs.
 */
export function checkBrowserSupport() {
  const issues = [];

  if (!window.RTCPeerConnection) {
    issues.push('WebRTC is not supported in this browser');
  }
  if (!navigator.mediaDevices) {
    issues.push('Media devices API is not available');
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    issues.push('Screen capture is not supported in this browser');
  }

  return {
    supported: issues.length === 0,
    issues,
  };
}

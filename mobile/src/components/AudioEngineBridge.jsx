import React, { useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getServerUrl } from '../services/socket';

/**
 * Headless WebRTC / Audio Engine Bridge using React Native WebView
 * This allows real-time WebRTC audio playback and microphone capture inside React Native / Expo.
 */
export default function AudioEngineBridge({
  role = 'receiver', // 'receiver' or 'sender'
  roomId,
  audioMode = 'display', // 'display' or 'mic'
  volume = 1.0,
  muted = false,
  onAudioLevel,
  onLatency,
  onStateChange,
  onError,
}) {
  const webViewRef = useRef(null);
  const serverUrl = getServerUrl();

  // Send volume / mute updates to bridge
  useEffect(() => {
    if (webViewRef.current) {
      const msg = JSON.stringify({
        type: 'SET_VOLUME',
        volume: muted ? 0 : volume,
      });
      webViewRef.current.postMessage(msg);
    }
  }, [volume, muted]);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'AUDIO_LEVEL':
          if (onAudioLevel) onAudioLevel(data.level);
          break;
        case 'LATENCY':
          if (onLatency) onLatency(data.latency);
          break;
        case 'STATE':
          if (onStateChange) onStateChange(data.state, data.details);
          break;
        case 'ERROR':
          if (onError) onError(data.error);
          break;
        default:
          break;
      }
    } catch {}
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
      </head>
      <body style="background: #000; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
        <div id="status">Audio Engine Ready</div>
        <audio id="audioPlayer" autoplay playsinline></audio>

        <script>
          const ROLE = "${role}";
          const ROOM_ID = "${roomId}";
          const AUDIO_MODE = "${audioMode}";
          const SERVER_URL = "${serverUrl}";

          const audioElem = document.getElementById('audioPlayer');
          const statusElem = document.getElementById('status');
          let socket = null;
          let pc = null;
          let pcmContext = null;
          let nextPcmTime = 0;
          let targetVolume = ${muted ? 0 : volume};

          function sendToRN(type, payload = {}) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
            }
          }

          window.addEventListener('message', (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'SET_VOLUME') {
                targetVolume = msg.volume;
                if (audioElem) audioElem.volume = targetVolume;
              }
            } catch(e) {}
          });

          document.addEventListener('message', (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'SET_VOLUME') {
                targetVolume = msg.volume;
                if (audioElem) audioElem.volume = targetVolume;
              }
            } catch(e) {}
          });

          async function init() {
            sendToRN('STATE', { state: 'connecting' });
            
            try {
              socket = io(SERVER_URL, {
                transports: ['websocket', 'polling'],
                reconnection: true
              });

              socket.on('connect', () => {
                sendToRN('STATE', { state: 'socket_connected' });
                
                if (ROLE === 'receiver') {
                  joinAsReceiver();
                } else {
                  startAsSender();
                }
              });

              socket.on('connect_error', (err) => {
                sendToRN('ERROR', { error: 'Server connection error: ' + err.message });
              });

            } catch (err) {
              sendToRN('ERROR', { error: err.message });
            }
          }

          async function joinAsReceiver() {
            socket.emit('join-room', { roomId: ROOM_ID }, async (response) => {
              if (!response || !response.success) {
                sendToRN('ERROR', { error: response ? response.error : 'Failed to join room' });
                return;
              }

              sendToRN('STATE', { state: 'room_joined' });
              setupReceiverWebRTC(response.senderSocketId);
            });

            // Listen for native Android PCM stream
            socket.on('audio-chunk', ({ chunk }) => {
              playPcmChunk(chunk);
            });
          }

          function setupReceiverWebRTC(senderId) {
            const config = {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
              ]
            };

            pc = new RTCPeerConnection(config);

            pc.ontrack = (event) => {
              const stream = event.streams[0] || new MediaStream([event.track]);
              audioElem.srcObject = stream;
              audioElem.volume = targetVolume;
              audioElem.play().catch(e => console.log('Autoplay play error:', e));

              sendToRN('STATE', { state: 'playing' });
              startVisualizer(stream);
            };

            pc.onicecandidate = (event) => {
              if (event.candidate && senderId) {
                socket.emit('ice-candidate', { to: senderId, candidate: event.candidate });
              }
            };

            socket.on('offer', async ({ from, offer }) => {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('answer', { to: from, answer: pc.localDescription });
              } catch (e) {
                sendToRN('ERROR', { error: 'WebRTC answer error: ' + e.message });
              }
            });

            socket.on('ice-candidate', async ({ candidate }) => {
              if (candidate && pc) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch(e) {}
              }
            });

            socket.on('peer-disconnected', () => {
              sendToRN('STATE', { state: 'disconnected' });
            });

            // Polling stats
            setInterval(async () => {
              if (pc) {
                try {
                  const stats = await pc.getStats();
                  stats.forEach(report => {
                    if (report.type === 'candidate-pair' && report.currentRoundTripTime) {
                      sendToRN('LATENCY', { latency: Math.round(report.currentRoundTripTime * 1000) });
                    }
                  });
                } catch(e) {}
              }
            }, 2500);
          }

          function playPcmChunk(chunk) {
            try {
              if (!pcmContext || pcmContext.state === 'closed') {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                pcmContext = new AudioCtx({ sampleRate: 48000 });
                nextPcmTime = pcmContext.currentTime;
              }

              if (pcmContext.state === 'suspended') {
                pcmContext.resume().catch(() => {});
              }

              let rawBytes;
              if (typeof chunk === 'string') {
                const binary = atob(chunk);
                rawBytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                  rawBytes[i] = binary.charCodeAt(i);
                }
              } else {
                rawBytes = new Uint8Array(chunk);
              }

              const int16Array = new Int16Array(rawBytes.buffer, rawBytes.byteOffset, Math.floor(rawBytes.byteLength / 2));
              const numFrames = Math.floor(int16Array.length / 2);
              if (numFrames <= 0) return;

              const audioBuffer = pcmContext.createBuffer(2, numFrames, 48000);
              const leftChannel = audioBuffer.getChannelData(0);
              const rightChannel = audioBuffer.getChannelData(1);

              let sum = 0;
              for (let i = 0; i < numFrames; i++) {
                const l = int16Array[i * 2] / 32768;
                const r = int16Array[i * 2 + 1] / 32768;
                leftChannel[i] = l;
                rightChannel[i] = r;
                sum += Math.abs(l) + Math.abs(r);
              }

              sendToRN('AUDIO_LEVEL', { level: Math.min(1, (sum / (numFrames * 2)) * 3) });
              sendToRN('STATE', { state: 'playing' });

              const source = pcmContext.createBufferSource();
              source.buffer = audioBuffer;
              const gainNode = pcmContext.createGain();
              gainNode.gain.value = targetVolume;
              source.connect(gainNode);
              gainNode.connect(pcmContext.destination);

              const currentTime = pcmContext.currentTime;
              const startTime = Math.max(currentTime, nextPcmTime);
              source.start(startTime);
              nextPcmTime = startTime + audioBuffer.duration;
            } catch (err) {
              console.log('PCM Chunk error:', err);
            }
          }

          function startVisualizer(stream) {
            try {
              const AudioCtx = window.AudioContext || window.webkitAudioContext;
              const ctx = new AudioCtx();
              const src = ctx.createMediaStreamSource(stream);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 64;
              src.connect(analyser);

              const bufferLength = analyser.frequencyBinCount;
              const dataArray = new Uint8Array(bufferLength);

              function loop() {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                const level = sum / bufferLength / 255;
                sendToRN('AUDIO_LEVEL', { level });
                requestAnimationFrame(loop);
              }
              loop();
            } catch(e) {}
          }

          async function startAsSender() {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 }
              });

              startVisualizer(stream);

              socket.emit('create-room', (response) => {
                if (response && response.success) {
                  sendToRN('STATE', { state: 'active', details: { roomId: response.roomId } });

                  socket.on('receiver-joined', async ({ receiverSocketId }) => {
                    const peer = new RTCPeerConnection({
                      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                    });

                    stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));

                    peer.onicecandidate = (event) => {
                      if (event.candidate) {
                        socket.emit('ice-candidate', { to: receiverSocketId, candidate: event.candidate });
                      }
                    };

                    socket.on('answer', async ({ from, answer }) => {
                      if (from === receiverSocketId) {
                        await peer.setRemoteDescription(new RTCSessionDescription(answer));
                      }
                    });

                    const offer = await peer.createOffer();
                    await peer.setLocalDescription(offer);
                    socket.emit('offer', { to: receiverSocketId, offer: peer.localDescription });
                  });
                }
              });
            } catch(err) {
              sendToRN('ERROR', { error: 'Microphone permission or capture error: ' + err.message });
            }
          }

          // Trigger start
          window.onload = () => {
            init();
          };
        </script>
      </body>
    </html>
  `;

  return (
    <View style={styles.container} pointerEvents="none">
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        onMessage={handleMessage}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
  webView: {
    width: 1,
    height: 1,
  },
});

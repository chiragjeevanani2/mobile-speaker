import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Keyboard,
  MonitorPlay,
  Mic,
  Volume2,
  Wifi,
  WifiOff,
  Smartphone,
  AlertTriangle,
  ArrowLeft,
  Users,
  QrCode,
  Radio,
  Speaker,
  Laptop,
  ArrowRight,
  Info,
  Sparkles,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import AudioVisualizer from '../components/AudioVisualizer.jsx';
import { connectSocket, disconnectSocket, fetchIceServers } from '../services/socket.js';
import {
  createPeerConnection,
  captureDisplayAudio,
  captureMicrophoneAudio,
  addTracksToConnection,
  createAudioVisualizer,
  getConnectionStats,
  cleanupPeerConnection,
  cleanupStream,
  optimizeAudioSdp,
  isDisplayMediaSupported,
} from '../services/webrtc.js';

const STATES = {
  IDLE: 'idle',
  CREATING: 'creating',
  ACTIVE: 'active', // Active broadcasting session (supports 0, 1, or N phones)
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  UNSUPPORTED: 'unsupported',
  PERMISSION_DENIED: 'permission_denied',
};

export default function SenderPage() {
  const navigate = useNavigate();
  const [state, setState] = useState(STATES.IDLE);
  const [roomId, setRoomId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showManualCode, setShowManualCode] = useState(false);
  const [audioMode, setAudioMode] = useState(null); // 'display' or 'mic'

  // Multi-phone state tracking
  const [connectedPhones, setConnectedPhones] = useState([]);
  const [avgLatency, setAvgLatency] = useState(null);

  const socketRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // receiverSocketId -> { pc, latency, joinedAt }
  const audioStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const visualizerRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const iceServersRef = useRef([]);

  // Check browser support on mount
  useEffect(() => {
    const hasWebRTC = !!window.RTCPeerConnection;
    const hasMediaDevices = !!navigator.mediaDevices;
    if (!hasWebRTC || !hasMediaDevices) {
      setState(STATES.UNSUPPORTED);
      setErrorMsg('Your browser does not support WebRTC. Please use Chrome, Edge, or Firefox.');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (visualizerRef.current) {
      visualizerRef.current.stop();
      visualizerRef.current = null;
    }

    cleanupStream(audioStreamRef.current);
    cleanupStream(screenStreamRef.current);
    audioStreamRef.current = null;
    screenStreamRef.current = null;

    // Close all peer connections
    for (const [id, entry] of peerConnectionsRef.current.entries()) {
      cleanupPeerConnection(entry.pc);
    }
    peerConnectionsRef.current.clear();
    setConnectedPhones([]);

    if (socketRef.current) {
      socketRef.current.off('receiver-joined');
      socketRef.current.off('offer');
      socketRef.current.off('answer');
      socketRef.current.off('ice-candidate');
      socketRef.current.off('peer-disconnected');
      socketRef.current.off('receiver-left');
      disconnectSocket();
      socketRef.current = null;
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    cleanup();
    setState(STATES.DISCONNECTED);
  }, [cleanup]);

  const handleBack = useCallback(() => {
    cleanup();
    navigate('/');
  }, [cleanup, navigate]);

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}/speaker/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomId]);

  // Setup a new peer connection for an incoming phone
  const setupReceiverConnection = useCallback(
    async (receiverSocketId) => {
      const socket = socketRef.current;
      const stream = audioStreamRef.current;
      if (!socket || !stream) return;

      // If there was an existing connection for this ID, close it
      if (peerConnectionsRef.current.has(receiverSocketId)) {
        const old = peerConnectionsRef.current.get(receiverSocketId);
        if (old.watchdogTimer) clearTimeout(old.watchdogTimer);
        cleanupPeerConnection(old.pc);
        peerConnectionsRef.current.delete(receiverSocketId);
      }

      console.log(`[Sender] Establishing WebRTC connection with phone ${receiverSocketId}`);
      const pc = createPeerConnection(iceServersRef.current);

      const receiverEntry = {
        id: receiverSocketId,
        pc,
        state: 'connecting',
        latency: null,
        joinedAt: Date.now(),
        pendingCandidates: [],
        hasRemoteDescription: false,
        watchdogTimer: null,
      };

      peerConnectionsRef.current.set(receiverSocketId, receiverEntry);

      // Add audio tracks from continuous stream
      addTracksToConnection(pc, stream);

      // ICE candidate routing
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', {
            to: receiverSocketId,
            candidate: event.candidate,
          });
        }
      };

      // Dual Connection & ICE state tracking
      const checkAndUpdateState = () => {
        const isConnected =
          pc.connectionState === 'connected' ||
          pc.iceConnectionState === 'connected' ||
          pc.iceConnectionState === 'completed';

        const isDisconnected =
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed' ||
          pc.iceConnectionState === 'failed' ||
          pc.iceConnectionState === 'closed';

        if (isConnected) {
          if (receiverEntry.watchdogTimer) {
            clearTimeout(receiverEntry.watchdogTimer);
            receiverEntry.watchdogTimer = null;
          }
          if (receiverEntry.state !== 'connected') {
            console.log(`[Sender] Phone ${receiverSocketId} is fully connected & streaming!`);
            receiverEntry.state = 'connected';
            updateConnectedPhonesList();
          }
        } else if (isDisconnected) {
          if (receiverEntry.watchdogTimer) {
            clearTimeout(receiverEntry.watchdogTimer);
            receiverEntry.watchdogTimer = null;
          }
          console.log(`[Sender] Phone ${receiverSocketId} connection dropped.`);
          receiverEntry.state = 'disconnected';
          cleanupPeerConnection(pc);
          peerConnectionsRef.current.delete(receiverSocketId);
          updateConnectedPhonesList();
        }
      };

      pc.onconnectionstatechange = checkAndUpdateState;
      pc.oniceconnectionstatechange = checkAndUpdateState;

      // Watchdog: Rescue stalled connections with ICE restart after 6s
      receiverEntry.watchdogTimer = setTimeout(async () => {
        const currentEntry = peerConnectionsRef.current.get(receiverSocketId);
        if (currentEntry && currentEntry.state !== 'connected' && currentEntry.pc) {
          const isAlive =
            currentEntry.pc.connectionState === 'connected' ||
            currentEntry.pc.iceConnectionState === 'connected' ||
            currentEntry.pc.iceConnectionState === 'completed';

          if (!isAlive && currentEntry.pc.signalingState !== 'closed') {
            console.log(`[Sender] Connection to phone ${receiverSocketId} stalled. Triggering automatic ICE restart...`);
            try {
              const restartOffer = await currentEntry.pc.createOffer({ iceRestart: true });
              restartOffer.sdp = optimizeAudioSdp(restartOffer.sdp);
              await currentEntry.pc.setLocalDescription(restartOffer);
              socket.emit('offer', {
                to: receiverSocketId,
                offer: currentEntry.pc.localDescription,
              });
            } catch (rErr) {
              console.warn('[Sender] ICE restart attempt error:', rErr);
            }
          }
        }
      }, 6000);

      // Create and send WebRTC offer to this phone
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });

        // Optimize SDP for ultra-low latency, constant bitrate, and multi-speaker synchronization
        offer.sdp = optimizeAudioSdp(offer.sdp);
        await pc.setLocalDescription(offer);

        socket.emit('offer', {
          to: receiverSocketId,
          offer: pc.localDescription,
        });

        updateConnectedPhonesList();
      } catch (err) {
        console.error(`[Sender] Error creating offer for phone ${receiverSocketId}:`, err);
      }
    },
    []
  );

  const updateConnectedPhonesList = () => {
    const list = Array.from(peerConnectionsRef.current.values()).map((entry) => ({
      id: entry.id,
      state: entry.state,
      latency: entry.latency,
      joinedAt: entry.joinedAt,
    }));
    setConnectedPhones(list);
  };

  const hasDisplayMedia = isDisplayMediaSupported();
  const isMobileDevice =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');

  const startStreaming = useCallback(
    async (mode) => {
      setAudioMode(mode);
      setState(STATES.CREATING);
      setErrorMsg('');

      try {
        // 1. Capture local audio (with continuous silence carrier)
        let stream;
        let screenStream;
        try {
          if (mode === 'display') {
            const result = await captureDisplayAudio();
            stream = result.stream;
            screenStream = result.screenStream;
          } else {
            const result = await captureMicrophoneAudio();
            stream = result.stream;
          }
        } catch (err) {
          if (err.message.includes('cancelled') || err.message.includes('denied') || err.name === 'NotAllowedError') {
            setState(STATES.PERMISSION_DENIED);
          } else if (
            err.message.includes('mobile') ||
            err.message.includes('not supported') ||
            err.message.includes('getDisplayMedia') ||
            err.name === 'TypeError'
          ) {
            setState(STATES.UNSUPPORTED);
          } else {
            setState(STATES.FAILED);
          }
          setErrorMsg(err.message || 'Failed to capture audio');
          return;
        }

        audioStreamRef.current = stream;
        if (screenStream) screenStreamRef.current = screenStream;

        // 2. Connect to signaling server
        const socket = await connectSocket();
        socketRef.current = socket;

        // 3. Fetch ICE servers
        const iceServers = await fetchIceServers();
        iceServersRef.current = iceServers;

        // 4. Create room on server
        const newRoomId = await new Promise((resolve, reject) => {
          socket.emit('create-room', (response) => {
            if (response.success) {
              resolve(response.roomId);
            } else {
              reject(new Error(response.error || 'Failed to create room'));
            }
          });
        });

        setRoomId(newRoomId);
        setState(STATES.ACTIVE);

        // 5. Setup Multi-Phone Signaling Event Handlers (clean old listeners first)
        socket.off('receiver-joined');
        socket.off('answer');
        socket.off('ice-candidate');
        socket.off('receiver-left');
        socket.off('peer-disconnected');

        // Receiver joined -> establish WebRTC peer connection
        socket.on('receiver-joined', async ({ receiverSocketId, totalReceivers }) => {
          console.log(`[Sender] New phone joined: ${receiverSocketId} (Total: ${totalReceivers})`);
          await setupReceiverConnection(receiverSocketId);
        });

        // Receiver answered our offer
        socket.on('answer', async ({ from, answer }) => {
          const entry = peerConnectionsRef.current.get(from);
          if (entry && entry.pc) {
            try {
              answer.sdp = optimizeAudioSdp(answer.sdp);
              await entry.pc.setRemoteDescription(new RTCSessionDescription(answer));
              entry.hasRemoteDescription = true;
              console.log(`[Sender] Remote description set for phone ${from}`);

              // Flush any buffered candidates
              if (entry.pendingCandidates && entry.pendingCandidates.length > 0) {
                console.log(`[Sender] Flushing ${entry.pendingCandidates.length} buffered ICE candidates for phone ${from}`);
                for (const cand of entry.pendingCandidates) {
                  try {
                    await entry.pc.addIceCandidate(cand);
                  } catch (cErr) {
                    console.warn('[Sender] Buffered candidate error:', cErr);
                  }
                }
                entry.pendingCandidates = [];
              }
            } catch (err) {
              console.error(`[Sender] Error setting remote description for phone ${from}:`, err);
            }
          }
        });

        // ICE candidate from receiver (with safe parsing and queuing)
        socket.on('ice-candidate', async ({ from, candidate }) => {
          if (!candidate) return;
          const entry = peerConnectionsRef.current.get(from);
          if (entry && entry.pc) {
            try {
              const iceCand = candidate.candidate !== undefined ? candidate : new RTCIceCandidate(candidate);
              if (entry.hasRemoteDescription && entry.pc.remoteDescription) {
                await entry.pc.addIceCandidate(iceCand);
              } else {
                console.log(`[Sender] Buffering ICE candidate for phone ${from}`);
                entry.pendingCandidates.push(iceCand);
              }
            } catch (err) {
              console.warn(`[Sender] Error adding ICE candidate from phone ${from}:`, err);
            }
          }
        });

        // Receiver disconnected or left room
        socket.on('receiver-left', ({ receiverSocketId, totalReceivers }) => {
          console.log(`[Sender] Signaling notice: Phone ${receiverSocketId} left signaling. Remaining: ${totalReceivers}`);
          const entry = peerConnectionsRef.current.get(receiverSocketId);
          if (entry && entry.pc) {
            const isP2pAlive =
              entry.pc.connectionState === 'connected' ||
              entry.pc.iceConnectionState === 'connected' ||
              entry.pc.iceConnectionState === 'completed';

            if (!isP2pAlive) {
              console.log(`[Sender] Closing inactive peer connection for ${receiverSocketId}`);
              if (entry.watchdogTimer) clearTimeout(entry.watchdogTimer);
              cleanupPeerConnection(entry.pc);
              peerConnectionsRef.current.delete(receiverSocketId);
              updateConnectedPhonesList();
            } else {
              console.log(`[Sender] Phone ${receiverSocketId} signaling disconnected, but WebRTC direct audio is active. Keeping playback alive!`);
            }
          }
        });

        socket.on('peer-disconnected', ({ role }) => {
          if (role === 'receiver') {
            console.log('[Sender] Peer disconnected event received');
          }
        });

        // Start local audio level visualizer
        const visualizer = createAudioVisualizer(stream);
        visualizerRef.current = visualizer;
        visualizer.startLoop((level) => {
          setAudioLevel(level);
        });

        // Latency and stats poll interval (every 2.5s)
        if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = setInterval(async () => {
          let totalLatency = 0;
          let measuredCount = 0;
          let listUpdated = false;

          for (const [id, entry] of peerConnectionsRef.current.entries()) {
            if (entry.pc) {
              const isConnected =
                entry.pc.connectionState === 'connected' ||
                entry.pc.iceConnectionState === 'connected' ||
                entry.pc.iceConnectionState === 'completed';

              if (isConnected && entry.state !== 'connected') {
                entry.state = 'connected';
                listUpdated = true;
              }

              if (isConnected) {
                const stats = await getConnectionStats(entry.pc);
                if (stats.latency !== null) {
                  entry.latency = stats.latency;
                  totalLatency += stats.latency;
                  measuredCount++;
                  listUpdated = true;
                }
              }
            }
          }

          if (measuredCount > 0) {
            setAvgLatency(Math.round(totalLatency / measuredCount));
          } else {
            setAvgLatency(null);
          }
          if (listUpdated) {
            updateConnectedPhonesList();
          }
        }, 2500);
      } catch (err) {
        console.error('[Sender] Start error:', err);
        setState(STATES.FAILED);
        setErrorMsg(err.message || 'An unexpected error occurred');
      }
    },
    [setupReceiverConnection]
  );

  const activeConnectedCount = connectedPhones.filter((p) => p.state === 'connected').length;

  const renderContent = () => {
    switch (state) {
      case STATES.IDLE:
        return (
          <div className="sender-idle animate-fade-in">
            <div className="sender-mode-card">
              <div className="mode-header-icon">
                <Radio size={36} />
              </div>
              <h2>Broadcast Audio</h2>
              <p className="mode-description">
                {isMobileDevice
                  ? 'Broadcast your phone microphone to other devices or switch to speaker mode.'
                  : 'Stream laptop sound to multiple phones simultaneously as wireless speakers.'}
              </p>

              {/* Mobile Info Notice */}
              {(!hasDisplayMedia || isMobileDevice) && (
                <div className="mobile-sender-banner">
                  <Smartphone size={20} className="banner-icon" />
                  <div className="banner-text">
                    <strong>Mobile Device Detected</strong>
                    <p>
                      Mobile browsers (Android & iOS) cannot capture audio from other apps or tabs. You can broadcast your <strong>Phone Microphone</strong> or join as a <strong>Speaker</strong> to listen to your PC.
                    </p>
                  </div>
                </div>
              )}

              {/* Display / Tab Audio Button */}
              {hasDisplayMedia ? (
                <button
                  className="mode-btn mode-btn-primary"
                  onClick={() => startStreaming('display')}
                >
                  <MonitorPlay size={24} />
                  <div>
                    <span className="mode-btn-title">Share Tab / PC Audio</span>
                    <span className="mode-btn-desc">
                      Capture audio from YouTube, Spotify, video, or any browser tab.
                    </span>
                  </div>
                </button>
              ) : (
                <div className="mode-btn mode-btn-disabled">
                  <Laptop size={24} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '2px' }}>
                      <span className="mode-btn-title">Share Tab / PC Audio</span>
                      <span className="device-badge badge-desktop">PC / Laptop Only</span>
                    </div>
                    <span className="mode-btn-desc">
                      Requires Chrome/Edge/Firefox on desktop to capture system or tab audio.
                    </span>
                  </div>
                </div>
              )}

              {/* Microphone Button */}
              <button
                className={`mode-btn ${!hasDisplayMedia ? 'mode-btn-primary' : 'mode-btn-secondary'}`}
                onClick={() => startStreaming('mic')}
              >
                <Mic size={24} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '2px' }}>
                    <span className="mode-btn-title">
                      {isMobileDevice ? 'Broadcast Phone Microphone' : 'Microphone Test'}
                    </span>
                    {isMobileDevice && (
                      <span className="device-badge badge-mobile">
                        <Sparkles size={11} style={{ marginRight: 3, display: 'inline' }} />
                        Works on Mobile
                      </span>
                    )}
                  </div>
                  <span className="mode-btn-desc">
                    {isMobileDevice
                      ? 'Stream your voice live to all connected speaker phones.'
                      : 'Test broadcasting your voice to connected phones.'}
                  </span>
                </div>
              </button>

              {/* Switch to Speaker Mode shortcut */}
              <div className="switch-speaker-section">
                <p>Want to turn this phone into a speaker instead?</p>
                <button
                  className="switch-speaker-btn"
                  onClick={() => navigate('/speaker')}
                >
                  <Speaker size={18} />
                  <span>Join as Speaker (Listen to PC)</span>
                  <ArrowRight size={16} />
                </button>
              </div>

              {hasDisplayMedia && (
                <div className="browser-note">
                  <AlertTriangle size={16} />
                  <p>
                    <strong>Tip:</strong> When prompted by Chrome/Edge, make sure the{' '}
                    <strong>"Share audio"</strong> checkbox is checked.
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case STATES.CREATING:
        return (
          <div className="sender-status animate-fade-in">
            <div className="status-card">
              <Loader2 className="spinner" size={48} />
              <h2>Setting up broadcast room...</h2>
              <p>Preparing audio stream and WebRTC signaling</p>
            </div>
          </div>
        );

      case STATES.ACTIVE:
        return (
          <div className="sender-active-grid animate-fade-in">
            {/* Left Card: Live Stream Controls & Connected Phones */}
            <div className="active-main-card">
              {/* Header Badge */}
              <div className="active-header">
                <div className={`status-pill ${activeConnectedCount > 0 ? 'pill-active' : 'pill-waiting'}`}>
                  <div className="pulse-dot" />
                  <span>
                    {activeConnectedCount === 0
                      ? 'Waiting for phones...'
                      : `${activeConnectedCount} Phone${activeConnectedCount > 1 ? 's' : ''} Connected`}
                  </span>
                </div>

                <div className="audio-mode-badge">
                  {audioMode === 'display' ? <MonitorPlay size={14} /> : <Mic size={14} />}
                  <span>{audioMode === 'display' ? 'Tab Audio' : 'Microphone'}</span>
                </div>
              </div>

              {/* Audio Visualizer */}
              <div className="visualizer-container">
                <AudioVisualizer audioLevel={audioLevel} />
              </div>

              {/* Connected Phones List */}
              <div className="phones-status-section">
                <div className="section-title">
                  <Smartphone size={16} />
                  <span>Connected Speakers ({activeConnectedCount})</span>
                </div>

                {connectedPhones.length === 0 ? (
                  <div className="no-phones-box">
                    <p>No phones connected yet. Scan the QR code with your phone to join as a speaker.</p>
                  </div>
                ) : (
                  <div className="phones-list">
                    {connectedPhones.map((phone, idx) => (
                      <div key={phone.id} className="phone-item">
                        <div className="phone-info">
                          <span className="phone-index">📱 Phone #{idx + 1}</span>
                          <span className={`phone-state-badge state-${phone.state}`}>
                            {phone.state === 'connected' ? 'Playing' : 'Connecting...'}
                          </span>
                        </div>
                        <div className="phone-meta">
                          <Wifi size={12} />
                          <span>{phone.latency !== null ? `${phone.latency} ms` : 'P2P'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Overall Latency Info */}
              {avgLatency !== null && (
                <div className="avg-latency-box">
                  <Wifi size={14} />
                  <span>Average Network Latency: {avgLatency} ms</span>
                </div>
              )}

              {/* Disconnect Button */}
              <button className="stop-broadcast-btn" onClick={handleDisconnect}>
                <WifiOff size={18} />
                <span>Stop Broadcasting</span>
              </button>
            </div>

            {/* Right Card: QR Code & Room Code (Always Accessible for Any Number of Phones) */}
            <div className="active-qr-card">
              <div className="qr-card-header">
                <h3>Add More Phones</h3>
                <p>Scan to add another wireless speaker</p>
              </div>

              <div className="qr-wrapper">
                <QRCodeSVG
                  value={`${window.location.origin}/speaker/${roomId}`}
                  size={200}
                  bgColor="var(--bg-card)"
                  fgColor="var(--text-primary)"
                  level="M"
                  includeMargin={false}
                />
              </div>

              {roomId && (
                <div className="room-code-box">
                  <span className="code-label">Room Code</span>
                  <span className="code-digits">{roomId}</span>
                </div>
              )}

              <div className="qr-action-buttons">
                <button className="copy-link-btn" onClick={copyLink}>
                  {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
                </button>

                <button
                  className="manual-toggle-btn"
                  onClick={() => setShowManualCode(!showManualCode)}
                >
                  <Keyboard size={16} />
                  <span>{showManualCode ? 'Hide Instructions' : 'Manual Code'}</span>
                </button>
              </div>

              {showManualCode && (
                <div className="manual-url-box animate-slide-up">
                  <p>On other phones, open:</p>
                  <code>{window.location.origin}/speaker/{roomId}</code>
                </div>
              )}
            </div>
          </div>
        );

      case STATES.DISCONNECTED:
        return (
          <div className="sender-status animate-fade-in">
            <div className="status-card">
              <WifiOff size={48} className="disconnected-icon" />
              <h2>Broadcast Ended</h2>
              <p>The audio stream session was closed.</p>
              <button className="home-cta" onClick={handleBack}>
                <ArrowLeft size={18} />
                Start Over
              </button>
            </div>
          </div>
        );

      case STATES.FAILED:
      case STATES.UNSUPPORTED: {
        const isMobileDisplayError =
          errorMsg.includes('Tab & system audio') ||
          errorMsg.includes('getDisplayMedia') ||
          errorMsg.includes('mobile web browsers') ||
          errorMsg.includes('mobile OS') ||
          (!hasDisplayMedia && audioMode === 'display');

        if (isMobileDisplayError) {
          return (
            <div className="sender-status animate-fade-in">
              <div className="status-card error-card">
                <AlertTriangle size={48} className="warning-icon" />
                <h2>Tab Audio Unavailable on Mobile</h2>
                <p className="error-msg">
                  Mobile web browsers (Android & iOS) do not allow capturing audio from other apps or tabs due to operating system security restrictions.
                </p>

                <div className="resolution-options">
                  <button className="resolution-btn-primary" onClick={() => startStreaming('mic')}>
                    <Mic size={18} />
                    <span>Broadcast Phone Mic Instead</span>
                  </button>

                  <button className="resolution-btn-secondary" onClick={() => navigate('/speaker')}>
                    <Speaker size={18} />
                    <span>Join as Speaker (Listen to PC)</span>
                  </button>

                  <button className="resolution-btn-subtle" onClick={handleBack}>
                    <ArrowLeft size={16} />
                    <span>Back to Home</span>
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="sender-status animate-fade-in">
            <div className="status-card error-card">
              <XCircle size={48} className="error-icon" />
              <h2>{state === STATES.UNSUPPORTED ? 'Browser Not Supported' : 'Connection Failed'}</h2>
              <p className="error-msg">{errorMsg || 'Something went wrong.'}</p>

              <div className="resolution-options">
                <button className="resolution-btn-primary" onClick={() => startStreaming('mic')}>
                  <Mic size={18} />
                  <span>Try Microphone Broadcast</span>
                </button>
                <button className="resolution-btn-secondary" onClick={() => navigate('/speaker')}>
                  <Speaker size={18} />
                  <span>Join as Wireless Speaker</span>
                </button>
                <button className="resolution-btn-subtle" onClick={handleBack}>
                  <ArrowLeft size={16} />
                  <span>Start Over</span>
                </button>
              </div>
            </div>
          </div>
        );
      }

      case STATES.PERMISSION_DENIED:
        return (
          <div className="sender-status animate-fade-in">
            <div className="status-card error-card">
              <AlertTriangle size={48} className="warning-icon" />
              <h2>Permission Denied</h2>
              <p className="error-msg">{errorMsg}</p>
              <p className="error-hint">
                Please allow audio/microphone sharing permissions in your browser settings.
              </p>
              <button className="home-cta" onClick={handleBack}>
                <ArrowLeft size={18} />
                Start Over
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="sender-page">
      <ThemeToggle />
      {state !== STATES.IDLE && state !== STATES.CREATING && (
        <button className="back-btn" onClick={handleBack} aria-label="Go back">
          <ArrowLeft size={20} />
        </button>
      )}
      {renderContent()}

      <style>{`
        .sender-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 16px;
          position: relative;
        }

        .back-btn {
          position: fixed;
          top: 20px;
          left: 20px;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background: var(--bg-card);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: var(--shadow-sm);
        }

        .back-btn:hover {
          background: var(--bg-card-hover);
          color: var(--accent);
        }

        /* Mode Selection */
        .sender-idle {
          max-width: 520px;
          width: 100%;
        }

        .sender-mode-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          padding: 36px 28px;
          box-shadow: var(--shadow-xl);
          text-align: center;
        }

        .mode-header-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 72px;
          height: 72px;
          border-radius: var(--radius-xl);
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          margin-bottom: 20px;
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
        }

        .sender-mode-card h2 {
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .mode-description {
          font-size: 0.95rem;
          color: var(--text-secondary);
          margin-bottom: 24px;
          line-height: 1.5;
        }

        .mode-btn {
          display: flex;
          align-items: center;
          gap: 16px;
          width: 100%;
          padding: 16px 20px;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          color: var(--text-primary);
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 14px;
        }

        .mode-btn-primary {
          border-color: rgba(99, 102, 241, 0.4);
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08));
        }

        .mode-btn-primary:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .mode-btn-secondary:hover {
          background: var(--bg-card-hover);
          transform: translateY(-2px);
        }

        .mode-btn svg {
          color: var(--accent);
          flex-shrink: 0;
        }

        .mode-btn-title {
          display: block;
          font-weight: 700;
          font-size: 1rem;
          margin-bottom: 2px;
        }

        .mode-btn-desc {
          display: block;
          font-size: 0.82rem;
          color: var(--text-muted);
          line-height: 1.35;
        }

        .mode-btn-disabled {
          opacity: 0.7;
          cursor: not-allowed;
          background: var(--bg-primary);
          border-color: var(--border-color);
        }

        .mode-btn-disabled:hover {
          transform: none;
          box-shadow: none;
        }

        .mobile-sender-banner {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(99, 102, 241, 0.08);
          border: 1px solid rgba(99, 102, 241, 0.25);
          border-radius: var(--radius-lg);
          margin-bottom: 20px;
          text-align: left;
        }

        .banner-icon {
          color: var(--accent);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .banner-text strong {
          display: block;
          font-size: 0.9rem;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .banner-text p {
          font-size: 0.82rem;
          color: var(--text-secondary);
          line-height: 1.4;
          margin: 0;
        }

        .device-badge {
          display: inline-flex;
          align-items: center;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 12px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }

        .badge-desktop {
          background: rgba(148, 163, 184, 0.15);
          color: var(--text-muted);
          border: 1px solid rgba(148, 163, 184, 0.3);
        }

        .badge-mobile {
          background: rgba(99, 102, 241, 0.15);
          color: var(--accent);
          border: 1px solid rgba(99, 102, 241, 0.3);
        }

        .switch-speaker-section {
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px dashed var(--border-color);
          text-align: center;
        }

        .switch-speaker-section p {
          font-size: 0.84rem;
          color: var(--text-muted);
          margin-bottom: 10px;
        }

        .switch-speaker-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px 18px;
          background: var(--bg-primary);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .switch-speaker-btn svg {
          color: var(--success);
        }

        .switch-speaker-btn:hover {
          background: var(--bg-card-hover);
          border-color: var(--success);
          color: var(--success);
          transform: translateY(-1px);
        }

        .resolution-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          margin-top: 24px;
        }

        .resolution-btn-primary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 13px 18px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .resolution-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
        }

        .resolution-btn-secondary {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 18px;
          background: var(--bg-primary);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
        }

        .resolution-btn-secondary:hover {
          background: var(--bg-card-hover);
          border-color: var(--accent);
        }

        .resolution-btn-subtle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 0.85rem;
          cursor: pointer;
          padding: 6px;
          margin-top: 4px;
          transition: color 0.2s;
        }

        .resolution-btn-subtle:hover {
          color: var(--text-primary);
        }

        .browser-note {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: 0.82rem;
          color: var(--text-secondary);
          text-align: left;
          margin-top: 10px;
        }

        .browser-note svg {
          color: var(--warning);
          flex-shrink: 0;
          margin-top: 2px;
        }

        /* Status & Error Cards */
        .sender-status {
          max-width: 440px;
          width: 100%;
        }

        .status-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          padding: 40px 24px;
          text-align: center;
          box-shadow: var(--shadow-xl);
        }

        .status-card h2 {
          font-size: 1.4rem;
          font-weight: 700;
          margin: 16px 0 8px;
        }

        .status-card p {
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        .disconnected-icon {
          color: var(--text-muted);
        }

        .error-icon {
          color: var(--error);
        }

        .warning-icon {
          color: var(--warning);
        }

        .error-hint {
          font-size: 0.82rem !important;
          color: var(--text-muted) !important;
          margin-top: 6px;
        }

        .home-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 20px;
          padding: 12px 24px;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          cursor: pointer;
        }

        /* Multi-Phone Active Streaming Grid */
        .sender-active-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 24px;
          max-width: 900px;
          width: 100%;
        }

        .active-main-card, .active-qr-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          padding: 28px 24px;
          box-shadow: var(--shadow-xl);
          display: flex;
          flex-direction: column;
        }

        .active-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 10px;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 700;
        }

        .pill-active {
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .pill-waiting {
          background: rgba(245, 158, 11, 0.15);
          color: var(--warning);
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
          animation: pulse 1.5s infinite;
        }

        .audio-mode-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .visualizer-container {
          margin: 10px 0 20px;
        }

        /* Phones Section */
        .phones-status-section {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 16px;
          margin-bottom: 16px;
          flex: 1;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 0.9rem;
          color: var(--text-primary);
          margin-bottom: 12px;
        }

        .section-title svg {
          color: var(--accent);
        }

        .no-phones-box {
          font-size: 0.82rem;
          color: var(--text-muted);
          text-align: center;
          padding: 12px 6px;
          line-height: 1.4;
        }

        .phones-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .phone-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          padding: 10px 14px;
          border-radius: var(--radius-md);
        }

        .phone-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .phone-index {
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .phone-state-badge {
          font-size: 0.75rem;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 12px;
        }

        .state-connected {
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
        }

        .state-connecting {
          background: rgba(245, 158, 11, 0.15);
          color: var(--warning);
        }

        .phone-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .avg-latency-box {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 0.82rem;
          color: var(--text-muted);
          margin-bottom: 16px;
        }

        .stop-broadcast-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 14px;
          background: transparent;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: auto;
        }

        .stop-broadcast-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          color: var(--error);
          border-color: var(--error);
        }

        /* Right QR Card */
        .active-qr-card {
          align-items: center;
          text-align: center;
        }

        .qr-card-header h3 {
          font-size: 1.2rem;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .qr-card-header p {
          font-size: 0.82rem;
          color: var(--text-secondary);
          margin-bottom: 16px;
        }

        .qr-wrapper {
          background: var(--bg-card);
          padding: 14px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .room-code-box {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 16px;
        }

        .code-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          font-weight: 700;
        }

        .code-digits {
          font-size: 1.8rem;
          font-weight: 900;
          letter-spacing: 0.15em;
          color: var(--accent);
          font-family: monospace;
        }

        .qr-action-buttons {
          display: flex;
          gap: 8px;
          width: 100%;
        }

        .copy-link-btn, .manual-toggle-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background: var(--bg-card-hover);
          color: var(--text-primary);
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .copy-link-btn:hover, .manual-toggle-btn:hover {
          border-color: var(--accent);
        }

        .manual-url-box {
          margin-top: 12px;
          padding: 10px;
          background: var(--bg-primary);
          border-radius: var(--radius-md);
          font-size: 0.8rem;
          width: 100%;
          word-break: break-all;
        }

        .manual-url-box code {
          display: block;
          margin-top: 4px;
          color: var(--accent);
          font-weight: 700;
        }

        @media (max-width: 800px) {
          .sender-active-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

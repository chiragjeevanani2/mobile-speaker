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
        cleanupPeerConnection(peerConnectionsRef.current.get(receiverSocketId).pc);
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
      };

      peerConnectionsRef.current.set(receiverSocketId, receiverEntry);

      // Add audio tracks from existing stream
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

      // Connection state tracking
      pc.onconnectionstatechange = () => {
        console.log(`[Sender] Phone ${receiverSocketId} connection state:`, pc.connectionState);
        if (pc.connectionState === 'connected') {
          receiverEntry.state = 'connected';
          updateConnectedPhonesList();
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          receiverEntry.state = 'disconnected';
          cleanupPeerConnection(pc);
          peerConnectionsRef.current.delete(receiverSocketId);
          updateConnectedPhonesList();
        }
      };

      // Create and send WebRTC offer to this phone
      try {
        const offer = await pc.createOffer();
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

  const startStreaming = useCallback(
    async (mode) => {
      setAudioMode(mode);
      setState(STATES.CREATING);
      setErrorMsg('');

      try {
        // 1. Capture local audio
        let stream;
        let screenStream;
        try {
          if (mode === 'display') {
            const result = await captureDisplayAudio();
            stream = result.stream;
            screenStream = result.screenStream;
          } else {
            stream = await captureMicrophoneAudio();
          }
        } catch (err) {
          if (err.message.includes('cancelled') || err.message.includes('denied') || err.name === 'NotAllowedError') {
            setState(STATES.PERMISSION_DENIED);
          } else {
            setState(STATES.FAILED);
          }
          setErrorMsg(err.message);
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

        // 5. Setup Multi-Phone Signaling Event Handlers

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
              await entry.pc.setRemoteDescription(new RTCSessionDescription(answer));
              console.log(`[Sender] Remote description set for phone ${from}`);
            } catch (err) {
              console.error(`[Sender] Error setting remote description for phone ${from}:`, err);
            }
          }
        });

        // ICE candidate from receiver
        socket.on('ice-candidate', async ({ from, candidate }) => {
          const entry = peerConnectionsRef.current.get(from);
          if (entry && entry.pc) {
            try {
              await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
              console.error(`[Sender] Error adding ICE candidate from phone ${from}:`, err);
            }
          }
        });

        // Receiver disconnected or left room
        socket.on('receiver-left', ({ receiverSocketId, totalReceivers }) => {
          console.log(`[Sender] Phone ${receiverSocketId} left room. Remaining: ${totalReceivers}`);
          const entry = peerConnectionsRef.current.get(receiverSocketId);
          if (entry) {
            cleanupPeerConnection(entry.pc);
            peerConnectionsRef.current.delete(receiverSocketId);
            updateConnectedPhonesList();
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

          for (const [id, entry] of peerConnectionsRef.current.entries()) {
            if (entry.pc && entry.pc.connectionState === 'connected') {
              const stats = await getConnectionStats(entry.pc);
              if (stats.latency !== null) {
                entry.latency = stats.latency;
                totalLatency += stats.latency;
                measuredCount++;
              }
            }
          }

          if (measuredCount > 0) {
            setAvgLatency(Math.round(totalLatency / measuredCount));
          } else {
            setAvgLatency(null);
          }
          updateConnectedPhonesList();
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
                Stream laptop sound to multiple phones simultaneously as wireless speakers.
              </p>

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

              <button
                className="mode-btn mode-btn-secondary"
                onClick={() => startStreaming('mic')}
              >
                <Mic size={24} />
                <div>
                  <span className="mode-btn-title">Microphone Test</span>
                  <span className="mode-btn-desc">
                    Test broadcasting your voice to connected phones.
                  </span>
                </div>
              </button>

              <div className="browser-note">
                <AlertTriangle size={16} />
                <p>
                  <strong>Tip:</strong> When prompted by Chrome/Edge, make sure the{' '}
                  <strong>"Share audio"</strong> checkbox is checked.
                </p>
              </div>
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
        return (
          <div className="sender-status animate-fade-in">
            <div className="status-card error-card">
              <XCircle size={48} className="error-icon" />
              <h2>Connection Failed</h2>
              <p className="error-msg">{errorMsg || 'Something went wrong.'}</p>
              <button className="home-cta" onClick={handleBack}>
                <ArrowLeft size={18} />
                Start Over
              </button>
            </div>
          </div>
        );

      case STATES.PERMISSION_DENIED:
        return (
          <div className="sender-status animate-fade-in">
            <div className="status-card error-card">
              <AlertTriangle size={48} className="warning-icon" />
              <h2>Permission Denied</h2>
              <p className="error-msg">{errorMsg}</p>
              <p className="error-hint">
                Please allow tab audio sharing and make sure "Share audio" is checked.
              </p>
              <button className="home-cta" onClick={handleBack}>
                <ArrowLeft size={18} />
                Start Over
              </button>
            </div>
          </div>
        );

      case STATES.UNSUPPORTED:
        return (
          <div className="sender-status animate-fade-in">
            <div className="status-card error-card">
              <XCircle size={48} className="error-icon" />
              <h2>Browser Not Supported</h2>
              <p className="error-msg">{errorMsg}</p>
              <button className="home-cta" onClick={handleBack}>
                <ArrowLeft size={18} />
                Go Back
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

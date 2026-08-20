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
  Clock,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import AudioVisualizer from '../components/AudioVisualizer.jsx';
import ConnectionStats from '../components/ConnectionStats.jsx';
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
  QR_READY: 'qr_ready',
  WAITING: 'waiting',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  STREAMING: 'streaming',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  EXPIRED: 'expired',
  UNSUPPORTED: 'unsupported',
  PERMISSION_DENIED: 'permission_denied',
};

export default function SenderPage() {
  const navigate = useNavigate();
  const [state, setState] = useState(STATES.IDLE);
  const [roomId, setRoomId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [latency, setLatency] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showManualCode, setShowManualCode] = useState(false);
  const [audioMode, setAudioMode] = useState(null); // 'display' or 'mic'

  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const audioStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const visualizerRef = useRef(null);
  const statsIntervalRef = useRef(null);

  // Check browser support on mount
  useEffect(() => {
    const hasWebRTC = !!window.RTCPeerConnection;
    const hasMediaDevices = !!navigator.mediaDevices;
    if (!hasWebRTC || !hasMediaDevices) {
      setState(STATES.UNSUPPORTED);
      setErrorMsg('Your browser does not support WebRTC or Media Devices API. Please use Chrome, Edge, or Firefox.');
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
    cleanupPeerConnection(peerConnectionRef.current);
    peerConnectionRef.current = null;
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
      // Fallback
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

  const setupPeerConnection = useCallback(
    async (socket, receiverSocketId, iceServers) => {
      const pc = createPeerConnection(iceServers);
      peerConnectionRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', {
            to: receiverSocketId,
            candidate: event.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setState(STATES.STREAMING);
          // Start latency stats
          statsIntervalRef.current = setInterval(async () => {
            if (pc) {
              const stats = await getConnectionStats(pc);
              setLatency(stats.latency);
            }
          }, 3000);
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          handleDisconnect();
        }
      };

      return pc;
    },
    [handleDisconnect]
  );

  const startStreaming = useCallback(
    async (mode) => {
      setAudioMode(mode);
      setState(STATES.CREATING);
      setErrorMsg('');

      try {
        // Capture audio first
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
          if (err.message.includes('permission denied') || err.message.includes('Permission denied')) {
            setState(STATES.PERMISSION_DENIED);
          } else {
            setState(STATES.FAILED);
          }
          setErrorMsg(err.message);
          return;
        }

        audioStreamRef.current = stream;
        if (screenStream) screenStreamRef.current = screenStream;

        // Connect to signaling server
        const socket = await connectSocket();
        socketRef.current = socket;

        // Fetch ICE servers
        const iceServers = await fetchIceServers();

        // Create room
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
        setState(STATES.QR_READY);

        // Listen for receiver joining
        socket.on('receiver-joined', async ({ receiverSocketId }) => {
          setState(STATES.CONNECTING);

          const pc = await setupPeerConnection(socket, receiverSocketId, iceServers);

          // Add audio tracks
          addTracksToConnection(pc, stream);

          // Create and send offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit('offer', {
            to: receiverSocketId,
            offer: pc.localDescription,
          });
        });

        // Handle answer from receiver
        socket.on('answer', async ({ answer }) => {
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(
              new RTCSessionDescription(answer)
            );
            setState(STATES.CONNECTED);
          }
        });

        // Handle ICE candidates from receiver
        socket.on('ice-candidate', async ({ candidate }) => {
          if (peerConnectionRef.current) {
            try {
              await peerConnectionRef.current.addIceCandidate(
                new RTCIceCandidate(candidate)
              );
            } catch (err) {
              console.error('[WebRTC] Error adding ICE candidate:', err);
            }
          }
        });

        // Handle receiver disconnect
        socket.on('receiver-left', () => {
          cleanup();
          setState(STATES.WAITING);
          // Re-create the waiting state with existing room
          setRoomId(newRoomId);
          // Re-setup socket listeners for next connection
        });

        socket.on('peer-disconnected', ({ role }) => {
          if (role === 'receiver') {
            handleDisconnect();
          }
        });

        // Start audio visualization
        const visualizer = createAudioVisualizer(stream);
        visualizerRef.current = visualizer;
        visualizer.startLoop((level) => {
          setAudioLevel(level);
        });
      } catch (err) {
        console.error('[Sender] Error:', err);
        setState(STATES.FAILED);
        setErrorMsg(err.message || 'An unexpected error occurred');
      }
    },
    [setupPeerConnection, handleDisconnect, cleanup]
  );

  // Render based on state
  const renderContent = () => {
    switch (state) {
      case STATES.IDLE:
        return (
          <div className="sender-idle animate-fade-in">
            <div className="sender-mode-card">
              <h2>Choose Audio Source</h2>
              <p className="mode-description">
                Select what audio you want to stream to your phone.
              </p>

              <button
                className="mode-btn mode-btn-primary"
                onClick={() => startStreaming('display')}
              >
                <MonitorPlay size={24} />
                <div>
                  <span className="mode-btn-title">Share Tab / Window Audio</span>
                  <span className="mode-btn-desc">
                    Capture audio from a browser tab, window, or screen.
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
                    Test the audio pipeline with your microphone.
                  </span>
                </div>
              </button>

              <div className="browser-note">
                <AlertTriangle size={16} />
                <p>
                  <strong>Note:</strong> For PC audio, choose a tab/window/screen and
                  enable audio sharing when your browser asks. System-wide audio capture
                  is not available in web browsers.
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
              <h2>Setting up connection...</h2>
              <p>Creating room and capturing audio</p>
            </div>
          </div>
        );

      case STATES.QR_READY:
      case STATES.WAITING:
        return (
          <div className="sender-qr animate-fade-in">
            <div className="qr-card">
              <h2>Scan with phone</h2>

              <div className="qr-container">
                <QRCodeSVG
                  value={`${window.location.origin}/speaker/${roomId}`}
                  size={220}
                  bgColor="var(--bg-card)"
                  fgColor="var(--text-primary)"
                  level="M"
                  includeMargin={false}
                />
              </div>

              {roomId && (
                <div className="room-code-section">
                  <p className="room-code-label">Or enter code</p>
                  <div className="room-code">{roomId}</div>
                </div>
              )}

              <div className="qr-actions">
                <button className="action-btn" onClick={copyLink}>
                  {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy connection link'}
                </button>
                <button
                  className="action-btn"
                  onClick={() => setShowManualCode(!showManualCode)}
                >
                  <Keyboard size={16} />
                  {showManualCode ? 'Hide instructions' : 'Enter code manually'}
                </button>
              </div>

              {showManualCode && (
                <div className="manual-instructions animate-slide-up">
                  <p>On your phone, open:</p>
                  <code>{window.location.origin}/speaker/{roomId}</code>
                </div>
              )}

              <div className="waiting-status">
                <div className="waiting-dot" />
                <span>Waiting for phone...</span>
              </div>
            </div>
          </div>
        );

      case STATES.CONNECTING:
        return (
          <div className="sender-status animate-fade-in">
            <div className="status-card">
              <Loader2 className="spinner" size={48} />
              <h2>Phone detected!</h2>
              <p>Establishing WebRTC connection...</p>
            </div>
          </div>
        );

      case STATES.CONNECTED:
      case STATES.STREAMING:
        return (
          <div className="sender-streaming animate-fade-in">
            <div className="streaming-card">
              <div className="streaming-header">
                <div className="connected-badge">
                  <CheckCircle2 size={20} />
                  <span>Phone Connected</span>
                </div>
                <div className="audio-source-badge">
                  {audioMode === 'display' ? <MonitorPlay size={16} /> : <Mic size={16} />}
                  <span>{audioMode === 'display' ? 'Tab Audio' : 'Microphone'}</span>
                </div>
              </div>

              <AudioVisualizer audioLevel={audioLevel} />

              <ConnectionStats latency={latency} status="connected" />

              <button className="disconnect-btn" onClick={handleDisconnect}>
                <WifiOff size={18} />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        );

      case STATES.DISCONNECTED:
        return (
          <div className="sender-status animate-fade-in">
            <div className="status-card">
              <WifiOff size={48} className="disconnected-icon" />
              <h2>Disconnected</h2>
              <p>The phone has disconnected from the session.</p>
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
                Please allow screen/audio sharing or microphone access and try again.
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
              <p className="error-hint">
                Please use a modern browser like Chrome, Edge, or Firefox.
              </p>
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
          padding: 40px 20px;
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

        /* Mode selection */
        .sender-idle {
          max-width: 500px;
          width: 100%;
        }

        .sender-mode-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 32px;
          box-shadow: var(--shadow-lg);
        }

        .sender-mode-card h2 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .mode-description {
          color: var(--text-secondary);
          margin-bottom: 24px;
        }

        .mode-btn {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          width: 100%;
          padding: 20px;
          border: 2px solid var(--border-color);
          border-radius: var(--radius-md);
          background: var(--bg-primary);
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          margin-bottom: 12px;
        }

        .mode-btn:hover {
          border-color: var(--accent);
          background: var(--accent-light);
        }

        .mode-btn svg {
          flex-shrink: 0;
          color: var(--accent);
          margin-top: 2px;
        }

        .mode-btn-title {
          display: block;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .mode-btn-desc {
          display: block;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .browser-note {
          display: flex;
          gap: 10px;
          padding: 14px;
          background: var(--warning-bg);
          border-radius: var(--radius-sm);
          margin-top: 8px;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .browser-note svg {
          flex-shrink: 0;
          color: var(--warning);
          margin-top: 2px;
        }

        .browser-note p {
          margin: 0;
          line-height: 1.5;
        }

        /* Status cards */
        .sender-status {
          max-width: 500px;
          width: 100%;
        }

        .status-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 48px 32px;
          text-align: center;
          box-shadow: var(--shadow-lg);
        }

        .status-card h2 {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 20px 0 8px;
        }

        .status-card p {
          color: var(--text-secondary);
        }

        .spinner {
          color: var(--accent);
          animation: spin 1s linear infinite;
        }

        .disconnected-icon {
          color: var(--text-muted);
        }

        .error-card .error-icon {
          color: var(--error);
        }

        .error-card .warning-icon {
          color: var(--warning);
        }

        .error-msg {
          margin-top: 8px;
          padding: 12px 16px;
          background: var(--error-bg);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .error-hint {
          margin-top: 12px;
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        /* QR card */
        .sender-qr {
          max-width: 500px;
          width: 100%;
        }

        .qr-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 32px;
          text-align: center;
          box-shadow: var(--shadow-lg);
        }

        .qr-card h2 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 24px;
        }

        .qr-container {
          display: flex;
          justify-content: center;
          padding: 24px;
          background: var(--bg-primary);
          border-radius: var(--radius-md);
          border: 2px dashed var(--border-color);
          margin-bottom: 20px;
        }

        .room-code-section {
          margin-bottom: 20px;
        }

        .room-code-label {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-bottom: 8px;
        }

        .room-code {
          font-size: 2.5rem;
          font-weight: 800;
          letter-spacing: 0.3em;
          color: var(--accent);
          font-family: 'SF Mono', 'Fira Code', monospace;
        }

        .qr-actions {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-bottom: 20px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--bg-primary);
          color: var(--text-secondary);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-light);
        }

        .manual-instructions {
          margin-bottom: 20px;
          padding: 16px;
          background: var(--bg-primary);
          border-radius: var(--radius-sm);
        }

        .manual-instructions p {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }

        .manual-instructions code {
          display: block;
          padding: 8px 12px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
          color: var(--accent);
          word-break: break-all;
        }

        .waiting-status {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 0.95rem;
          color: var(--text-secondary);
        }

        .waiting-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse 2s infinite;
        }

        /* Streaming card */
        .sender-streaming {
          max-width: 500px;
          width: 100%;
        }

        .streaming-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 32px;
          box-shadow: var(--shadow-lg);
        }

        .streaming-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .connected-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--success);
        }

        .audio-source-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          background: var(--accent-light);
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--accent);
        }

        .disconnect-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 14px;
          border: 1px solid var(--error);
          border-radius: var(--radius-md);
          background: transparent;
          color: var(--error);
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 24px;
        }

        .disconnect-btn:hover {
          background: var(--error);
          color: white;
        }

        .home-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          margin-top: 24px;
          font-size: 0.95rem;
          font-weight: 600;
          color: white;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .home-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        @media (max-width: 640px) {
          .sender-page {
            padding: 24px 16px;
          }

          .qr-card,
          .sender-mode-card {
            padding: 24px 20px;
          }

          .room-code {
            font-size: 2rem;
          }

          .qr-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}

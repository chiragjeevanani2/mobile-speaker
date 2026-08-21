import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeX,
  Volume1,
  Wifi,
  WifiOff,
  AlertTriangle,
  ArrowLeft,
  Speaker,
  QrCode,
  Keyboard,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import QrScannerModal from '../components/QrScannerModal.jsx';
import { connectSocket, disconnectSocket } from '../services/socket.js';
import {
  createPeerConnection,
  createAudioVisualizer,
  getConnectionStats,
  cleanupPeerConnection,
} from '../services/webrtc.js';

const STATES = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  PLAYING: 'playing',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  UNSUPPORTED: 'unsupported',
};

export default function ReceiverPage() {
  const { roomId: urlRoomId } = useParams();
  const navigate = useNavigate();

  const [activeRoomId, setActiveRoomId] = useState(urlRoomId ? urlRoomId.toUpperCase() : '');
  const [manualCode, setManualCode] = useState(urlRoomId ? urlRoomId.toUpperCase() : '');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [codeError, setCodeError] = useState('');

  const [state, setState] = useState(STATES.IDLE);
  const [errorMsg, setErrorMsg] = useState('');
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [latency, setLatency] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const audioRef = useRef(null);
  const visualizerRef = useRef(null);
  const statsIntervalRef = useRef(null);

  // Sync if URL param changes
  useEffect(() => {
    if (urlRoomId) {
      setActiveRoomId(urlRoomId.toUpperCase());
      setManualCode(urlRoomId.toUpperCase());
    }
  }, [urlRoomId]);

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
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    cleanupPeerConnection(peerConnectionRef.current);
    peerConnectionRef.current = null;
    if (socketRef.current) {
      socketRef.current.off('offer');
      socketRef.current.off('answer');
      socketRef.current.off('ice-candidate');
      socketRef.current.off('peer-disconnected');
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

  const handleStartAudio = useCallback(async () => {
    if (audioRef.current) {
      try {
        await audioRef.current.play();
        setAutoplayBlocked(false);
      } catch {
        // Still blocked
      }
    }
  }, []);

  const joinRoomWithId = useCallback(async (targetRoomId) => {
    const target = (targetRoomId || activeRoomId || '').trim().toUpperCase();
    if (!target || target.length < 4) {
      setCodeError('Please enter a valid room code.');
      return;
    }

    setActiveRoomId(target);
    setState(STATES.CONNECTING);
    setErrorMsg('');

    try {
      // Connect to signaling server
      const socket = await connectSocket();
      socketRef.current = socket;

      // Join room
      const joinResult = await new Promise((resolve, reject) => {
        socket.emit('join-room', { roomId: target }, (response) => {
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'Failed to join room'));
          }
        });
      });

      // Create peer connection
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Receiver connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setState(STATES.PLAYING);
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

      // Handle incoming audio track
      pc.ontrack = (event) => {
        console.log('[WebRTC] Received track:', event.track.kind);
        const [remoteStream] = event.streams;

        if (!audioRef.current) {
          audioRef.current = new Audio();
          audioRef.current.autoplay = true;
          audioRef.current.playsInline = true;
        }

        audioRef.current.srcObject = remoteStream;
        audioRef.current.volume = muted ? 0 : volume;

        audioRef.current.play()
          .then(() => {
            setAutoplayBlocked(false);
            setState(STATES.PLAYING);

            try {
              const vis = createAudioVisualizer(remoteStream);
              visualizerRef.current = vis;
              vis.startLoop((level) => {
                setAudioLevel(level);
              });
            } catch {
              // Visualizer optional
            }
          })
          .catch(() => {
            setAutoplayBlocked(true);
            setState(STATES.PLAYING);
          });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice-candidate', {
            to: joinResult.senderSocketId,
            candidate: event.candidate,
          });
        }
      };

      socket.on('offer', async ({ from, offer }) => {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('answer', {
          to: from,
          answer: pc.localDescription,
        });
      });

      socket.on('ice-candidate', async ({ candidate }) => {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      });

      socket.on('peer-disconnected', ({ role }) => {
        if (role === 'sender') {
          handleDisconnect();
        }
      });
    } catch (err) {
      console.error('[Receiver] Error:', err);
      setState(STATES.FAILED);
      setErrorMsg(err.message || 'Failed to connect');
    }
  }, [activeRoomId, volume, muted, handleDisconnect]);

  const handleScanSuccess = (scannedRoomId) => {
    setIsScannerOpen(false);
    setActiveRoomId(scannedRoomId);
    setManualCode(scannedRoomId);
    navigate(`/speaker/${scannedRoomId}`, { replace: true });
    joinRoomWithId(scannedRoomId);
  };

  // Update volume when changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted]);

  const getVolumeIcon = () => {
    if (muted || volume === 0) return <VolumeX size={20} />;
    if (volume < 0.5) return <Volume1 size={20} />;
    return <Volume2 size={20} />;
  };

  const renderContent = () => {
    switch (state) {
      case STATES.IDLE:
        return (
          <div className="receiver-idle animate-fade-in">
            <div className="receiver-card">
              <div className="receiver-logo">
                <Speaker size={36} />
              </div>
              <h1>Listen on Phone</h1>

              {activeRoomId ? (
                <>
                  <p className="receiver-subtitle">
                    Room Code: <span className="room-badge">{activeRoomId}</span>
                  </p>
                  <p className="receiver-desc">
                    Your phone will become the wireless speaker for this computer. Make sure your device volume is turned up!
                  </p>
                  <button className="connect-btn" onClick={() => joinRoomWithId(activeRoomId)}>
                    <Volume2 size={20} />
                    <span>Connect & Start Listening</span>
                  </button>
                  <button className="secondary-btn" onClick={() => { setActiveRoomId(''); setManualCode(''); }}>
                    <span>Change Room Code</span>
                  </button>
                </>
              ) : (
                <div className="receiver-manual-box">
                  <p className="receiver-desc">
                    Scan the QR code on your PC screen or enter the 6-character code below:
                  </p>

                  <button className="scan-qr-btn" onClick={() => setIsScannerOpen(true)}>
                    <QrCode size={20} />
                    <span>Scan QR Code</span>
                  </button>

                  <div className="code-input-group">
                    <Keyboard size={18} className="code-icon" />
                    <input
                      type="text"
                      placeholder="ENTER ROOM CODE"
                      value={manualCode}
                      onChange={(e) => {
                        setManualCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
                        setCodeError('');
                      }}
                      maxLength={8}
                      className="manual-code-input"
                    />
                    <button
                      className="manual-join-btn"
                      disabled={!manualCode || manualCode.length < 4}
                      onClick={() => {
                        navigate(`/speaker/${manualCode}`, { replace: true });
                        joinRoomWithId(manualCode);
                      }}
                    >
                      Join
                    </button>
                  </div>
                  {codeError && <p className="code-error-msg">{codeError}</p>}
                </div>
              )}
            </div>
          </div>
        );

      case STATES.CONNECTING:
        return (
          <div className="receiver-status animate-fade-in">
            <div className="receiver-card">
              <Loader2 className="spinner" size={48} />
              <h2>Connecting...</h2>
              <p>Joining room <span className="room-badge">{activeRoomId}</span></p>
            </div>
          </div>
        );

      case STATES.CONNECTED:
      case STATES.PLAYING:
        return (
          <div className="receiver-playing animate-fade-in">
            <div className="receiver-card">
              {autoplayBlocked && (
                <div className="autoplay-banner animate-slide-up">
                  <AlertTriangle size={18} />
                  <span>Tap the button below to start audio playback</span>
                </div>
              )}

              <div className="playing-status">
                <div className="status-icon-pulse">
                  <CheckCircle2 size={48} />
                </div>
                <h2>🔊 Connected</h2>
                <p>Playing audio from computer in room <span className="room-badge">{activeRoomId}</span></p>
              </div>

              {/* Audio level visualizer */}
              <div className="phone-visualizer">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className={`phone-bar ${audioLevel > i / 12 ? 'active' : ''}`}
                    style={{ height: `${Math.max(4, audioLevel * 30 * (1 - Math.abs(i - 6) / 6))}px` }}
                  />
                ))}
              </div>

              {/* Volume control */}
              <div className="volume-control">
                <button
                  className="mute-btn"
                  onClick={() => setMuted(!muted)}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {getVolumeIcon()}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    if (muted) setMuted(false);
                  }}
                  className="volume-slider"
                />
                <span className="volume-value">
                  {Math.round((muted ? 0 : volume) * 100)}%
                </span>
              </div>

              {/* Latency */}
              <div className="latency-info">
                <Wifi size={14} />
                <span>
                  {latency !== null ? `Latency: ${latency} ms` : 'P2P Connected'}
                </span>
              </div>

              {/* Autoplay button */}
              {autoplayBlocked && (
                <button className="autoplay-btn" onClick={handleStartAudio}>
                  <Volume2 size={18} />
                  <span>Tap to Start Audio</span>
                </button>
              )}

              <button className="disconnect-btn" onClick={handleDisconnect}>
                <WifiOff size={16} />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        );

      case STATES.DISCONNECTED:
        return (
          <div className="receiver-status animate-fade-in">
            <div className="receiver-card">
              <WifiOff size={48} className="disconnected-icon" />
              <h2>Disconnected</h2>
              <p>The audio stream has ended.</p>
              <button className="home-cta-btn" onClick={handleBack}>
                <ArrowLeft size={18} />
                Return Home
              </button>
            </div>
          </div>
        );

      case STATES.FAILED:
        return (
          <div className="receiver-status animate-fade-in">
            <div className="receiver-card error-card">
              <XCircle size={48} className="error-icon" />
              <h2>Connection Failed</h2>
              <p className="error-msg">{errorMsg || 'Could not connect to the room.'}</p>
              <div className="action-buttons-row">
                <button className="retry-btn" onClick={() => joinRoomWithId(activeRoomId)}>
                  Retry
                </button>
                <button className="home-cta-btn" onClick={handleBack}>
                  <ArrowLeft size={18} />
                  Home
                </button>
              </div>
            </div>
          </div>
        );

      case STATES.UNSUPPORTED:
        return (
          <div className="receiver-status animate-fade-in">
            <div className="receiver-card error-card">
              <XCircle size={48} className="error-icon" />
              <h2>Browser Not Supported</h2>
              <p>Please use a modern mobile browser like Chrome, Safari, or Edge.</p>
              <button className="home-cta-btn" onClick={handleBack}>
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
    <div className="receiver-page">
      <ThemeToggle />
      {renderContent()}

      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      <style>{`
        .receiver-page {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          position: relative;
        }

        .receiver-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          padding: 32px 24px;
          text-align: center;
          box-shadow: var(--shadow-xl);
          max-width: 440px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .receiver-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 68px;
          height: 68px;
          border-radius: var(--radius-lg);
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          margin-bottom: 16px;
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.3);
        }

        .receiver-idle h1 {
          font-size: 1.6rem;
          font-weight: 800;
          margin-bottom: 6px;
          color: var(--text-primary);
        }

        .receiver-subtitle {
          font-size: 1rem;
          color: var(--text-secondary);
          margin-bottom: 12px;
        }

        .room-badge {
          display: inline-block;
          padding: 2px 10px;
          background: var(--accent-light);
          color: var(--accent);
          border-radius: var(--radius-sm);
          font-weight: 800;
          font-family: monospace;
          letter-spacing: 0.1em;
        }

        .receiver-desc {
          font-size: 0.88rem;
          color: var(--text-muted);
          margin-bottom: 20px;
          line-height: 1.5;
        }

        .connect-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 15px;
          font-size: 1.05rem;
          font-weight: 700;
          color: white;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
          margin-bottom: 12px;
        }

        .connect-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
        }

        .secondary-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 0.88rem;
          font-weight: 500;
          cursor: pointer;
          padding: 6px;
        }

        .secondary-btn:hover {
          color: var(--accent);
        }

        .receiver-manual-box {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .scan-qr-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 13px;
          background: var(--bg-card-hover);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .scan-qr-btn:hover {
          border-color: var(--accent);
          background: var(--border-color);
        }

        .code-input-group {
          display: flex;
          align-items: center;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 4px 6px 4px 12px;
          width: 100%;
        }

        .code-input-group:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        .code-icon {
          color: var(--text-muted);
          margin-right: 8px;
        }

        .manual-code-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 8px 0;
        }

        .manual-join-btn {
          background: var(--accent);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: var(--radius-sm);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
        }

        .manual-join-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .code-error-msg {
          color: var(--error);
          font-size: 0.8rem;
          text-align: left;
        }

        /* Playing state */
        .playing-status {
          margin-bottom: 20px;
        }

        .status-icon-pulse {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
          margin-bottom: 12px;
        }

        .phone-visualizer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 48px;
          width: 100%;
          margin-bottom: 20px;
        }

        .phone-bar {
          width: 6px;
          border-radius: 3px;
          background: var(--border-color);
          transition: height 0.1s ease, background 0.1s ease;
        }

        .phone-bar.active {
          background: var(--accent);
        }

        .volume-control {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          background: var(--bg-primary);
          padding: 12px 16px;
          border-radius: var(--radius-md);
          margin-bottom: 16px;
        }

        .mute-btn {
          background: none;
          border: none;
          color: var(--text-primary);
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        .volume-slider {
          flex: 1;
          accent-color: var(--accent);
        }

        .volume-value {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
          min-width: 40px;
          text-align: right;
        }

        .latency-info {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-bottom: 20px;
        }

        .disconnect-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px;
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-secondary);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-weight: 600;
        }

        .disconnect-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          color: var(--error);
          border-color: var(--error);
        }

        .home-cta-btn, .retry-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: var(--radius-md);
          font-weight: 600;
          cursor: pointer;
          border: none;
          margin-top: 12px;
        }

        .home-cta-btn {
          background: var(--bg-card-hover);
          color: var(--text-primary);
        }

        .retry-btn {
          background: var(--accent);
          color: white;
        }

        .action-buttons-row {
          display: flex;
          gap: 12px;
        }

        .autoplay-banner {
          background: rgba(245, 158, 11, 0.15);
          color: var(--warning);
          border: 1px solid rgba(245, 158, 11, 0.3);
          padding: 10px 14px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          margin-bottom: 16px;
        }

        .autoplay-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 14px;
          background: var(--warning);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 700;
          cursor: pointer;
          margin-bottom: 12px;
        }
      `}</style>
    </div>
  );
}

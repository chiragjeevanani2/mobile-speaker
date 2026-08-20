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
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { connectSocket, disconnectSocket } from '../services/socket.js';
import {
  createPeerConnection,
  setupAudioPlayback,
  createAudioVisualizer,
  getConnectionStats,
  cleanupPeerConnection,
  cleanupStream,
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
  const { roomId } = useParams();
  const navigate = useNavigate();
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
  const audioElementRef = useRef(null);
  const visualizerRef = useRef(null);
  const statsIntervalRef = useRef(null);

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

  const joinRoom = useCallback(async () => {
    if (!roomId) {
      setState(STATES.FAILED);
      setErrorMsg('No room code found. Please scan the QR code again.');
      return;
    }

    setState(STATES.CONNECTING);
    setErrorMsg('');

    try {
      // Connect to signaling server
      const socket = await connectSocket();
      socketRef.current = socket;

      // Join room
      const joinResult = await new Promise((resolve, reject) => {
        socket.emit('join-room', { roomId }, (response) => {
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
          // Start stats
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

        // Try to play (handle autoplay)
        audioRef.current.play()
          .then(() => {
            setAutoplayBlocked(false);
            setState(STATES.PLAYING);

            // Create visualizer
            try {
              const vis = createAudioVisualizer(remoteStream);
              visualizerRef.current = vis;
              vis.startLoop((level) => {
                setAudioLevel(level);
              });
            } catch {
              // Visualizer is optional
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

      // Listen for offer from sender
      socket.on('offer', async ({ from, offer }) => {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('answer', {
          to: from,
          answer: pc.localDescription,
        });
      });

      // Handle ICE candidates from sender
      socket.on('ice-candidate', async ({ candidate }) => {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      });

      // Handle sender disconnect
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
  }, [roomId, volume, muted, handleDisconnect]);

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
              <h1>Connect to "Hear This"</h1>
              <p className="receiver-subtitle">
                Join room <span className="room-badge">{roomId}</span>
              </p>
              <p className="receiver-desc">
                Your phone will become a speaker for the connected computer.
                Make sure your volume is up!
              </p>
              <button className="connect-btn" onClick={joinRoom}>
                <Volume2 size={20} />
                <span>Connect as Speaker</span>
              </button>
            </div>
          </div>
        );

      case STATES.CONNECTING:
        return (
          <div className="receiver-status animate-fade-in">
            <div className="receiver-card">
              <Loader2 className="spinner" size={48} />
              <h2>Connecting...</h2>
              <p>Establishing connection to the computer</p>
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
                <p>Your phone is now the speaker for this computer.</p>
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
              <p>The connection has been lost.</p>
              <button className="home-cta" onClick={handleBack}>
                <ArrowLeft size={18} />
                Done
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
              <p className="error-msg">{errorMsg || 'Could not connect to the computer.'}</p>
              <button className="home-cta" onClick={handleBack}>
                <ArrowLeft size={18} />
                Go Back
              </button>
            </div>
          </div>
        );

      case STATES.UNSUPPORTED:
        return (
          <div className="receiver-status animate-fade-in">
            <div className="receiver-card error-card">
              <XCircle size={48} className="error-icon" />
              <h2>Browser Not Supported</h2>
              <p>Please use a modern mobile browser like Chrome, Safari, or Firefox.</p>
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
    <div className="receiver-page">
      <ThemeToggle />
      {renderContent()}

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
          border-radius: var(--radius-lg);
          padding: 32px 24px;
          text-align: center;
          box-shadow: var(--shadow-lg);
          max-width: 420px;
          width: 100%;
        }

        /* Idle state */
        .receiver-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 72px;
          height: 72px;
          border-radius: var(--radius-lg);
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          margin-bottom: 20px;
        }

        .receiver-idle h1 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .receiver-subtitle {
          font-size: 1rem;
          color: var(--text-secondary);
          margin-bottom: 16px;
        }

        .room-badge {
          display: inline-block;
          padding: 2px 10px;
          background: var(--accent-light);
          color: var(--accent);
          border-radius: var(--radius-sm);
          font-weight: 700;
          font-family: 'SF Mono', 'Fira Code', monospace;
          letter-spacing: 0.1em;
        }

        .receiver-desc {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-bottom: 24px;
          line-height: 1.5;
        }

        .connect-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 16px;
          font-size: 1.05rem;
          font-weight: 600;
          color: white;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
        }

        .connect-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
        }

        .connect-btn:active {
          transform: translateY(0);
        }

        /* Status states */
        .receiver-status {
          max-width: 420px;
          width: 100%;
        }

        .receiver-status .receiver-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 48px 24px;
        }

        .receiver-status h2 {
          font-size: 1.3rem;
          font-weight: 700;
        }

        .spinner {
          color: var(--accent);
          animation: spin 1s linear infinite;
        }

        .disconnected-icon {
          color: var(--text-muted);
        }

        .error-icon {
          color: var(--error);
        }

        .error-msg {
          padding: 12px 16px;
          background: var(--error-bg);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          color: var(--text-primary);
          margin-top: 4px;
        }

        /* Playing state */
        .receiver-playing {
          max-width: 420px;
          width: 100%;
        }

        .autoplay-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: var(--warning-bg);
          border-radius: var(--radius-sm);
          margin-bottom: 16px;
          font-size: 0.85rem;
          color: var(--text-primary);
        }

        .playing-status {
          margin-bottom: 16px;
        }

        .status-icon-pulse {
          color: var(--success);
          margin-bottom: 8px;
          animation: scaleIn 0.5s ease-out;
        }

        .playing-status h2 {
          font-size: 1.4rem;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .playing-status p {
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        /* Phone visualizer */
        .phone-visualizer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          height: 40px;
          margin: 16px 0;
        }

        .phone-bar {
          width: 5px;
          border-radius: 2px;
          background: var(--border-color);
          transition: height 0.08s ease, background-color 0.15s ease;
          min-height: 4px;
        }

        .phone-bar.active {
          background: linear-gradient(180deg, #6366f1, #8b5cf6);
        }

        /* Volume control */
        .volume-control {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg-primary);
          border-radius: var(--radius-md);
          width: 100%;
          margin: 12px 0;
        }

        .mute-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 50%;
          background: var(--bg-card);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .mute-btn:hover {
          color: var(--accent);
          background: var(--accent-light);
        }

        .volume-slider {
          flex: 1;
          height: 6px;
          -webkit-appearance: none;
          appearance: none;
          background: var(--border-color);
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }

        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        .volume-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        .volume-value {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary);
          min-width: 36px;
          text-align: right;
        }

        /* Latency */
        .latency-info {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-bottom: 16px;
        }

        /* Autoplay button */
        .autoplay-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 14px;
          background: var(--success);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 12px;
          transition: all 0.2s ease;
        }

        .autoplay-btn:hover {
          opacity: 0.9;
        }

        .disconnect-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px;
          border: 1px solid var(--error);
          border-radius: var(--radius-md);
          background: transparent;
          color: var(--error);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
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
          margin-top: 16px;
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
      `}</style>
    </div>
  );
}

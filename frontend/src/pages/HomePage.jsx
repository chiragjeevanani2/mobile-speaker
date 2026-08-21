import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Speaker,
  Zap,
  Wifi,
  Shield,
  MonitorPlay,
  QrCode,
  ArrowRight,
  Radio,
  Smartphone,
  Keyboard,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import QrScannerModal from '../components/QrScannerModal.jsx';

export default function HomePage() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [inputError, setInputError] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const handleJoinByCode = (e) => {
    e?.preventDefault();
    const cleanCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanCode || cleanCode.length < 4) {
      setInputError('Please enter a valid room code (e.g. K8XESG)');
      return;
    }
    setInputError('');
    navigate(`/speaker/${cleanCode}`);
  };

  const handleScanSuccess = (scannedRoomId) => {
    setIsScannerOpen(false);
    navigate(`/speaker/${scannedRoomId}`);
  };

  const handleCodeChange = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setRoomCode(val);
    if (inputError) setInputError('');
  };

  return (
    <div className="home-page">
      <ThemeToggle />

      <div className="home-content">
        {/* Logo & Header */}
        <div className="home-header animate-fade-in">
          <div className="logo-icon">
            <Speaker size={42} />
          </div>
          <h1 className="home-title">Hear This</h1>
          <p className="home-subtitle">
            Turn any phone into a temporary wireless speaker for your PC.
          </p>
        </div>

        {/* Feature Pills */}
        <div className="home-features animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="feature">
            <Zap size={16} />
            <span>Zero App Install</span>
          </div>
          <div className="feature-divider" />
          <div className="feature">
            <Shield size={16} />
            <span>Private P2P</span>
          </div>
          <div className="feature-divider" />
          <div className="feature">
            <Wifi size={16} />
            <span>Ultra Low Latency</span>
          </div>
        </div>

        {/* Action Grid: Host vs Join */}
        <div className="action-grid animate-fade-in" style={{ animationDelay: '0.2s' }}>
          {/* Card 1: Broadcast from PC */}
          <div className="action-card host-card">
            <div className="card-badge host-badge">
              <Radio size={14} />
              <span>Host on PC</span>
            </div>
            <div className="card-header-group">
              <div className="card-icon-circle host-icon">
                <MonitorPlay size={26} />
              </div>
              <div>
                <h3>Share Audio from PC</h3>
                <p>Broadcast your tab, window, or mic audio to your phone</p>
              </div>
            </div>

            <button
              className="card-primary-btn host-btn"
              onClick={() => navigate('/sender')}
            >
              <span>Start Broadcasting</span>
              <ArrowRight size={18} />
            </button>
          </div>

          {/* Card 2: Listen on Phone (Speaker) */}
          <div className="action-card receive-card">
            <div className="card-badge receive-badge">
              <Smartphone size={14} />
              <span>Listen on Phone</span>
            </div>
            <div className="card-header-group">
              <div className="card-icon-circle receive-icon">
                <Speaker size={26} />
              </div>
              <div>
                <h3>Join as Speaker</h3>
                <p>Scan QR code or enter the 6-character room code</p>
              </div>
            </div>

            {/* QR Scan Button */}
            <button
              className="scan-qr-btn"
              onClick={() => setIsScannerOpen(true)}
            >
              <QrCode size={20} />
              <span>Scan QR Code with Camera</span>
            </button>

            {/* Code Input Form */}
            <form className="join-form" onSubmit={handleJoinByCode}>
              <div className="input-group">
                <Keyboard size={18} className="input-icon" />
                <input
                  type="text"
                  placeholder="Enter 6-letter code"
                  value={roomCode}
                  onChange={handleCodeChange}
                  maxLength={8}
                  className={`room-input ${inputError ? 'input-error' : ''}`}
                  autoComplete="off"
                  spellCheck="false"
                />
                <button
                  type="submit"
                  className="join-submit-btn"
                  disabled={!roomCode || roomCode.length < 4}
                >
                  Join
                </button>
              </div>
              {inputError && <p className="error-text">{inputError}</p>}
            </form>
          </div>
        </div>

        {/* Footer info */}
        <div className="home-footer animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <p>
            Audio streams directly from device to device via encrypted WebRTC peer-to-peer connection.
          </p>
        </div>
      </div>

      {/* QR Camera Scanner Modal */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      <style>{`
        .home-page {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 32px 16px;
          position: relative;
        }

        .home-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          max-width: 840px;
          width: 100%;
          text-align: center;
          gap: 24px;
        }

        .home-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 76px;
          height: 76px;
          border-radius: var(--radius-xl);
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          box-shadow: 0 8px 28px rgba(99, 102, 241, 0.35);
          margin-bottom: 4px;
        }

        .home-title {
          font-size: 3rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, var(--text-primary), var(--accent));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1.1;
        }

        .home-subtitle {
          font-size: 1.15rem;
          color: var(--text-secondary);
          max-width: 480px;
          line-height: 1.5;
        }

        .home-features {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          flex-wrap: wrap;
          padding: 6px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 30px;
          box-shadow: var(--shadow-sm);
        }

        .feature {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .feature svg {
          color: var(--accent);
        }

        .feature-divider {
          width: 1px;
          height: 14px;
          background: var(--border-color);
        }

        /* Action Grid */
        .action-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          width: 100%;
          margin-top: 8px;
        }

        .action-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          padding: 24px;
          display: flex;
          flex-direction: column;
          text-align: left;
          position: relative;
          box-shadow: var(--shadow-md);
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }

        .action-card:hover {
          border-color: var(--accent);
          box-shadow: var(--shadow-xl);
        }

        .card-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 4px 10px;
          border-radius: 20px;
          width: fit-content;
          margin-bottom: 16px;
        }

        .host-badge {
          background: rgba(99, 102, 241, 0.15);
          color: var(--accent);
          border: 1px solid rgba(99, 102, 241, 0.3);
        }

        .receive-badge {
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .card-header-group {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 20px;
        }

        .card-icon-circle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }

        .host-icon {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2));
          color: var(--accent);
        }

        .receive-icon {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.2));
          color: var(--success);
        }

        .card-header-group h3 {
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .card-header-group p {
          font-size: 0.88rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        /* Buttons */
        .card-primary-btn {
          margin-top: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 14px 20px;
          font-size: 1rem;
          font-weight: 600;
          border-radius: var(--radius-lg);
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .host-btn {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
        }

        .host-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
        }

        .scan-qr-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 13px 18px;
          background: var(--bg-card-hover);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 12px;
        }

        .scan-qr-btn svg {
          color: var(--accent);
        }

        .scan-qr-btn:hover {
          background: var(--border-color);
          border-color: var(--accent);
        }

        /* Form */
        .join-form {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .input-group {
          display: flex;
          align-items: center;
          position: relative;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 4px 6px 4px 12px;
          transition: border-color 0.2s;
        }

        .input-group:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        .input-icon {
          color: var(--text-muted);
          flex-shrink: 0;
          margin-right: 8px;
        }

        .room-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: 1rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 8px 0;
        }

        .room-input::placeholder {
          text-transform: none;
          letter-spacing: normal;
          font-weight: 400;
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        .join-submit-btn {
          background: var(--accent);
          color: white;
          border: none;
          padding: 9px 18px;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: background-color 0.2s, opacity 0.2s;
        }

        .join-submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .join-submit-btn:not(:disabled):hover {
          background: var(--accent-hover);
        }

        .error-text {
          font-size: 0.8rem;
          color: var(--error);
          text-align: left;
          padding-left: 4px;
        }

        .home-footer {
          margin-top: 10px;
          font-size: 0.82rem;
          color: var(--text-muted);
          line-height: 1.5;
          max-width: 500px;
        }

        @media (max-width: 768px) {
          .action-grid {
            grid-template-columns: 1fr;
          }

          .home-title {
            font-size: 2.3rem;
          }

          .home-subtitle {
            font-size: 1rem;
          }

          .home-page {
            padding: 24px 16px;
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
}

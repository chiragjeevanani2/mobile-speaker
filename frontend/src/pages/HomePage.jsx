import { useNavigate } from 'react-router-dom';
import { Speaker, Zap, Wifi, Shield, MonitorSmartphone } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <ThemeToggle />

      <div className="home-content">
        {/* Logo */}
        <div className="home-logo animate-fade-in">
          <div className="logo-icon">
            <Speaker size={48} />
          </div>
        </div>

        {/* Title */}
        <h1 className="home-title animate-fade-in" style={{ animationDelay: '0.1s' }}>
          Hear This
        </h1>
        <p className="home-subtitle animate-fade-in" style={{ animationDelay: '0.2s' }}>
          Turn your phone into a temporary wireless speaker.
        </p>

        {/* Features */}
        <div className="home-features animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <div className="feature">
            <Zap size={18} />
            <span>No app needed</span>
          </div>
          <div className="feature-divider" />
          <div className="feature">
            <Shield size={18} />
            <span>No login required</span>
          </div>
          <div className="feature-divider" />
          <div className="feature">
            <Wifi size={18} />
            <span>No cables</span>
          </div>
        </div>

        {/* CTA */}
        <button
          className="home-cta animate-fade-in"
          style={{ animationDelay: '0.4s' }}
          onClick={() => navigate('/sender')}
        >
          <MonitorSmartphone size={20} />
          <span>Start</span>
        </button>

        {/* Info */}
        <p className="home-info animate-fade-in" style={{ animationDelay: '0.5s' }}>
          Works with Chrome, Edge, and Firefox on desktop. Phone can be any modern browser.
        </p>
      </div>

      {/* Footer info */}
      <div className="home-footer animate-fade-in" style={{ animationDelay: '0.6s' }}>
        <p>
          Audio travels directly from your computer to your phone via WebRTC.
          <br />
          Nothing is stored or transmitted through our servers.
        </p>
      </div>

      <style>{`
        .home-page {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 40px 20px;
          position: relative;
        }

        .home-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          max-width: 500px;
          text-align: center;
          gap: 20px;
        }

        .home-logo {
          margin-bottom: 8px;
        }

        .logo-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100px;
          height: 100px;
          border-radius: var(--radius-xl);
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          box-shadow: 0 8px 32px rgba(99, 102, 241, 0.3);
        }

        .home-title {
          font-size: 3.5rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, var(--text-primary), var(--accent));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .home-subtitle {
          font-size: 1.25rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .home-features {
          display: flex;
          align-items: center;
          gap: 16px;
          margin: 8px 0 16px;
        }

        .feature {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.9rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .feature svg {
          color: var(--accent);
        }

        .feature-divider {
          width: 1px;
          height: 20px;
          background: var(--border-color);
        }

        .home-cta {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 48px;
          font-size: 1.1rem;
          font-weight: 600;
          color: white;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none;
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
        }

        .home-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
        }

        .home-cta:active {
          transform: translateY(0);
        }

        .home-info {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-top: 8px;
        }

        .home-footer {
          position: absolute;
          bottom: 24px;
          text-align: center;
          font-size: 0.8rem;
          color: var(--text-muted);
          line-height: 1.6;
        }

        @media (max-width: 640px) {
          .home-title {
            font-size: 2.5rem;
          }
          .home-subtitle {
            font-size: 1.1rem;
          }
          .home-features {
            flex-wrap: wrap;
            justify-content: center;
          }
          .feature-divider {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

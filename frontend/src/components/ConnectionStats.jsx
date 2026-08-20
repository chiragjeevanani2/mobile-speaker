import { Wifi, Clock, Activity } from 'lucide-react';

export default function ConnectionStats({ latency, status = 'connected' }) {
  return (
    <div className="connection-stats">
      <div className="stat">
        <div className="stat-icon">
          <Wifi size={16} />
        </div>
        <div className="stat-info">
          <span className="stat-label">Status</span>
          <span className={`stat-value status-${status}`}>
            {status === 'connected' ? 'Connected' : status}
          </span>
        </div>
      </div>

      <div className="stat">
        <div className="stat-icon">
          <Clock size={16} />
        </div>
        <div className="stat-info">
          <span className="stat-label">Latency</span>
          <span className="stat-value">
            {latency !== null ? `${latency} ms` : 'Measuring...'}
          </span>
        </div>
      </div>

      <div className="stat">
        <div className="stat-icon">
          <Activity size={16} />
        </div>
        <div className="stat-info">
          <span className="stat-label">Connection</span>
          <span className="stat-value">WebRTC (P2P)</span>
        </div>
      </div>

      <style>{`
        .connection-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin: 16px 0;
        }

        .stat {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          background: var(--bg-primary);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
        }

        .stat-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          background: var(--accent-light);
          color: var(--accent);
          flex-shrink: 0;
        }

        .stat-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .stat-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        }

        .stat-value {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .status-connected {
          color: var(--success);
        }

        @media (max-width: 480px) {
          .connection-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

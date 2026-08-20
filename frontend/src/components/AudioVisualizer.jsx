import { useMemo } from 'react';

const BARS = 24;

export default function AudioVisualizer({ audioLevel = 0 }) {
  const bars = useMemo(() => {
    return Array.from({ length: BARS }, (_, i) => {
      const distance = Math.abs(i - BARS / 2) / (BARS / 2);
      const maxLevel = 1 - distance * 0.5;
      const isActive = audioLevel * maxLevel > 0.05;
      const height = isActive
        ? Math.max(4, audioLevel * maxLevel * 40 + Math.random() * 8)
        : 4;
      return { height, isActive };
    });
  }, [audioLevel]);

  return (
    <div className="audio-visualizer">
      <div className="visualizer-label">
        <span className="label-icon">🔊</span>
        <span>Audio Level</span>
      </div>
      <div className="visualizer-bars">
        {bars.map((bar, i) => (
          <div
            key={i}
            className={`visualizer-bar ${bar.isActive ? 'active' : ''}`}
            style={{ height: `${bar.height}px` }}
          />
        ))}
      </div>
      <div className="visualizer-meter">
        <div
          className="meter-fill"
          style={{ width: `${Math.min(audioLevel * 100 * 2, 100)}%` }}
        />
      </div>

      <style>{`
        .audio-visualizer {
          margin: 16px 0;
        }

        .visualizer-label {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 12px;
          font-weight: 500;
        }

        .label-icon {
          font-size: 1.1rem;
        }

        .visualizer-bars {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          height: 48px;
          padding: 4px 0;
        }

        .visualizer-bar {
          width: 6px;
          border-radius: 3px;
          background: var(--border-color);
          transition: height 0.05s ease, background-color 0.15s ease;
          min-height: 4px;
        }

        .visualizer-bar.active {
          background: linear-gradient(180deg, #6366f1, #8b5cf6);
        }

        .visualizer-meter {
          height: 6px;
          background: var(--bg-primary);
          border-radius: 3px;
          overflow: hidden;
          margin-top: 12px;
        }

        .meter-fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #8b5cf6);
          border-radius: 3px;
          transition: width 0.1s ease;
        }
      `}</style>
    </div>
  );
}

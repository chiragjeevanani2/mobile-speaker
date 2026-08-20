import { useTheme } from '../hooks/useTheme.jsx';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      <style>{`
        .theme-toggle {
          position: fixed;
          top: 20px;
          right: 20px;
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
        .theme-toggle:hover {
          background: var(--bg-card-hover);
          color: var(--accent);
          transform: scale(1.05);
        }
      `}</style>
    </button>
  );
}

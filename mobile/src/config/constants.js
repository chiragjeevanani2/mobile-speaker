/**
 * Application Constants & Configuration for Mobile App
 */

// Default backend signaling server
// In production or deployed environment: https://mobile-speaker-backend.onrender.com
// In local development on LAN: http://192.168.1.X:10000 (replace with your machine IP)
export const DEFAULT_SERVER_URL = 'https://mobile-speaker-backend.onrender.com';

export const DEFAULT_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:global.stun.twilio.com:3478'] },
];

export const COLORS = {
  bgPrimary: '#0b0f19',
  bgCard: '#131b2e',
  bgCardHover: '#1c2742',
  border: '#23304d',
  accent: '#6366f1',
  accentHover: '#4f46e5',
  accentLight: 'rgba(99, 102, 241, 0.15)',
  success: '#22c55e',
  successLight: 'rgba(34, 197, 94, 0.15)',
  warning: '#f59e0b',
  warningLight: 'rgba(245, 158, 11, 0.15)',
  error: '#ef4444',
  errorLight: 'rgba(239, 68, 68, 0.15)',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
};

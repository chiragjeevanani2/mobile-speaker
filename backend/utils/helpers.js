import { randomBytes } from 'crypto';

/**
 * Generate a cryptographically random 6-character room ID.
 * Uses alphanumeric characters (uppercase) for easy manual entry.
 * Format: XXXXXX (e.g., "7K3P9A")
 */
export function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous I/O/0/1
  const bytes = randomBytes(6);
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

/**
 * Generate a cryptographically random string for session IDs.
 */
export function generateSessionId(length = 24) {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

import { io } from 'socket.io-client';

const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER || 'http://localhost:3001';

let socket = null;

/**
 * Get or create a singleton Socket.IO connection.
 */
export function getSocket() {
  if (!socket || socket.disconnected) {
    socket = io(SIGNALING_SERVER, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 30000, // 30 seconds — Render free tier cold starts can be slow
      transports: ['polling', 'websocket'], // Start with polling, upgrade to websocket
    });
  }
  return socket;
}

/**
 * Connect the socket.
 */
export function connectSocket() {
  return new Promise((resolve, reject) => {
    const s = getSocket();

    if (s.connected) {
      resolve(s);
      return;
    }

    const onConnect = () => {
      s.off('connect_error', onError);
      s.off('connect_timeout', onTimeout);
      resolve(s);
    };

    const onError = (err) => {
      s.off('connect', onConnect);
      s.off('connect_timeout', onTimeout);
      reject(err);
    };

    const onTimeout = () => {
      s.off('connect', onConnect);
      s.off('connect_error', onError);
      reject(new Error('Connection timed out. The server may be starting up, please try again in a moment.'));
    };

    s.once('connect', onConnect);
    s.once('connect_error', onError);
    s.once('connect_timeout', onTimeout);
    s.connect();
  });
}

/**
 * Disconnect the socket.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get the ICE server configuration from the server.
 */
export async function fetchIceServers() {
  try {
    const res = await fetch(`${SIGNALING_SERVER}/api/config`);
    const data = await res.json();
    return data.iceServers || [];
  } catch {
    // Fallback to default STUN servers
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

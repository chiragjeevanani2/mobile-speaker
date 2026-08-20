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
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
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
      resolve(s);
    };

    const onError = (err) => {
      s.off('connect', onConnect);
      reject(err);
    };

    s.once('connect', onConnect);
    s.once('connect_error', onError);
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

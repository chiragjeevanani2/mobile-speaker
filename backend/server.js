import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './socket/handlers.js';

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');

// Normalize origins: strip trailing slashes so browser CORS always matches
function isAllowedOrigin(origin) {
  if (!origin) return true; // Allow server-to-server requests with no origin
  return origin.replace(/\/+$/, '') === CORS_ORIGIN;
}

// Express CORS middleware
app.use(cors({
  origin: isAllowedOrigin,
  credentials: true,
}));

const io = new Server(httpServer, {
  cors: {
    origin: isAllowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 10000,
});

// Parse JSON for REST endpoints
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ICE server configuration endpoint
app.get('/api/config', (_req, res) => {
  let iceServers;
  try {
    iceServers = JSON.parse(process.env.ICE_SERVERS || '[]');
  } catch (err) {
    iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  }
  res.json({ iceServers });
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('Hear This server running on port ' + PORT);
  console.log('CORS origin: ' + CORS_ORIGIN);
});

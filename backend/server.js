import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setupSocketHandlers } from './socket/handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 20000,
  pingInterval: 10000,
});

// Parse JSON for REST endpoints
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ICE server configuration endpoint
app.get('/api/config', (req, res) => {
  let iceServers;
  try {
    iceServers = JSON.parse(process.env.ICE_SERVERS || '[]');
  } catch {
    iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  }
  res.json({ iceServers });
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`🔊 Hear This server running on port ${PORT}`);
  console.log(`   CORS origin: ${CORS_ORIGIN}`);
});

# 🔊 Hear This

**Turn your phone into a temporary wireless speaker.**

No app. No login. No cables.

Hear This uses WebRTC to stream audio from your computer browser directly to your phone browser in real time. Open the site on your PC, scan the QR code with your phone, and your phone becomes a temporary speaker for your computer.

## How It Works

```
┌──────────┐    Socket.IO     ┌──────────┐
│  PC /    │   (signaling)    │  Phone /  │
│  Sender  │◄────────────────►│ Receiver  │
└────┬─────┘                  └─────┬─────┘
     │                              │
     │         WebRTC (P2P)         │
     └──────────────────────────────┘
           Audio Stream (direct)
```

1. **PC creates a room** — generates a unique 6-character room code and displays a QR code
2. **Phone scans QR** — joins the room via Socket.IO signaling
3. **WebRTC handshake** — SDP offer/answer and ICE candidate exchange happens through the signaling server
4. **Audio streams directly** — once connected, audio flows PC → Phone via WebRTC peer connection. The server is NOT involved in audio transfer

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, JavaScript |
| Styling | CSS (custom properties, dark/light mode) |
| Backend | Node.js, Express, Socket.IO |
| Signaling | Socket.IO |
| Audio | WebRTC, Web Audio API |
| QR Code | qrcode.react |

## Prerequisites

- Node.js 18+ 
- npm 9+
- Modern browser (Chrome, Edge, Firefox) on PC
- Any modern browser on phone

## Installation

### 1. Clone and install

```bash
# Install server dependencies
cd backend
npm install

# Install client dependencies
cd ../frontend
npm install
```

### 2. Environment variables

Create `.env` files from the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**Backend `.env`:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `ROOM_EXPIRATION_MS` | `900000` | Room timeout (15 min) |
| `ICE_SERVERS` | Google STUN servers | JSON array of RTCIceServer configs |

**Frontend `.env`:**

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SIGNALING_SERVER` | `http://localhost:3001` | Backend URL |

### 3. Run locally

Open two terminals:

**Terminal 1 — Server:**
```bash
cd backend
npm run dev
```

**Terminal 2 — Client:**
```bash
cd frontend
npm run dev
```

The app will be available at `http://localhost:5173`.

### 4. Test PC → Phone locally

1. Open `http://localhost:5173` on your computer
2. Click **Start**
3. Choose **Share Tab / Window Audio** (make sure to enable "Share audio" when prompted)
4. Scan the QR code with your phone
5. Tap **Connect as Speaker** on your phone
6. Play audio in the selected tab — your phone should play it!

> **Note:** For local testing, both devices must be on the same network. WebRTC will attempt direct peer connection.

## Deployment

### Frontend (Vite build)

```bash
cd frontend
npm run build
```

Deploy the `frontend/dist/` folder to any static hosting (Vercel, Netlify, Cloudflare Pages, etc.).

Update the `VITE_SIGNALING_SERVER` environment variable to point to your deployed backend URL.

### Backend

```bash
cd backend
npm start
```

Deploy to any Node.js hosting (Railway, Render, Fly.io, DigitalOcean, etc.).

Set the environment variables for production:
- `PORT` — the port your host expects
- `CORS_ORIGIN` — your deployed frontend URL (e.g., `https://hear-this.vercel.app`)
- `ICE_SERVERS` — your TURN server configuration (see below)

### Reverse Proxy (Nginx example)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    # Frontend
    location / {
        root /var/www/hear-this/dist;
        try_files $uri $uri/ /index.html;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api/ {
        proxy_pass http://localhost:3001;
    }
}
```

## HTTPS Requirements

**HTTPS is required in production** for several reasons:

1. **WebRTC** requires a secure context (HTTPS or localhost)
2. **Media APIs** (`getDisplayMedia`, `getUserMedia`) require secure contexts
3. **Socket.IO** should use WSS in production

For local development, `localhost` is treated as a secure context by browsers, so HTTP works fine.

For production:
- Use a valid SSL certificate (Let's Encrypt is free)
- Ensure `CORS_ORIGIN` uses `https://`
- Socket.IO will automatically use WSS when the page is served over HTTPS

## TURN Server Configuration

WebRTC tries to establish a direct peer-to-peer connection. However, some network configurations (symmetric NAT, restrictive firewalls) prevent direct connections. In these cases, a **TURN server** relays the audio traffic.

### Free TURN servers (for development/testing)

```text
ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"stun:stun1.l.google.com:19302"}]
```

### Production TURN server options

| Service | Free Tier | Notes |
|---------|-----------|-------|
| [Twilio TURN](https://www.twilio.com/docs/stun-turn) | 50MB/month | Reliable, easy setup |
| [Coturn](https://github.com/coturn/coturn) | Self-hosted | Open source, full control |
| [Metered](https://www.metered.ca/tools/openrelay/) | 50GB/month | Free STUN/TURN servers |
| [Open Relay](https://openrelayproject.org/) | 1GB/month | Free TURN servers |

Example with TURN credentials:

```text
ICE_SERVERS=[{"urls":"turn:your-turn-server.com:3478","username":"user","credential":"pass"}]
```

## Known Browser Limitations

| Limitation | Details |
|-----------|---------|
| **No system-wide audio capture** | Browsers cannot capture all system audio. You must share a specific tab, window, or screen with audio enabled. |
| **Safari iOS** | `getDisplayMedia` may have limited support. Microphone mode works. |
| **Autoplay restrictions** | Mobile browsers may block audio autoplay. The app shows a "Tap to Start Audio" button. |
| **Shared audio** | Some browsers require explicit "Share audio" checkbox when sharing a tab. |
| **WebRTC NAT traversal** | Some networks block UDP. TURN server may be needed. |
| **Firefox** | `getDisplayMedia` video track is required but immediately discarded. |

## Security

- Room IDs are **cryptographically random** (6 uppercase alphanumeric characters)
- No audio, session data, or personal information is stored on the server
- Rooms **auto-expire** after 15 minutes of inactivity
- Rooms are **automatically destroyed** when both devices disconnect
- WebRTC provides **end-to-end encryption** for the audio stream

## Project Structure

```
hear-this/
├── backend/
│   ├── server.js              # Express + Socket.IO server
│   ├── socket/
│   │   └── handlers.js        # Socket.IO event handlers
│   ├── utils/
│   │   ├── roomManager.js     # Room lifecycle management
│   │   └── helpers.js         # ID generation utilities
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AudioVisualizer.jsx   # Audio level visualization
│   │   │   ├── ConnectionStats.jsx   # Latency & status display
│   │   │   └── ThemeToggle.jsx       # Dark/light mode toggle
│   │   ├── pages/
│   │   │   ├── HomePage.jsx          # Landing page
│   │   │   ├── SenderPage.jsx        # PC sender interface
│   │   │   └── ReceiverPage.jsx      # Phone receiver interface
│   │   ├── hooks/
│   │   │   └── useTheme.jsx          # Theme context & hook
│   │   ├── services/
│   │   │   ├── socket.js             # Socket.IO client
│   │   │   └── webrtc.js             # WebRTC utilities
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

## Audio Flow Explained

```
1. PC captures tab/mic audio → MediaStream (audio tracks)
2. MediaStream added to RTCPeerConnection
3. WebRTC negotiates codec & connection with phone's RTCPeerConnection
4. Audio packets sent directly: PC → Phone via UDP (or TURN relay)
5. Phone receives remote audio track
6. Audio plays through <audio> element → phone speakers
```

**The Node.js server only handles signaling (room management + WebRTC offer/answer/ICE exchange). It never touches the audio data.**

## License

MIT

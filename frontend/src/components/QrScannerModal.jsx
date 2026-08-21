import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, SwitchCamera, AlertCircle, RefreshCw } from 'lucide-react';
import jsQR from 'jsqr';

export default function QrScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [error, setError] = useState('');
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' or 'user'
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isScanningRef = useRef(false);

  // Check for multiple video inputs
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);
    }).catch(() => {});
  }, []);

  const parseRoomId = useCallback((rawData) => {
    if (!rawData) return null;
    const str = rawData.trim();
    // Check if it's a URL ending with /speaker/ROOM_ID or /speaker/ROOM_ID/
    const urlMatch = str.match(/\/speaker\/([A-Za-z0-9]{4,10})/i);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1].toUpperCase();
    }
    // Check if raw alphanumeric 4-8 chars
    const cleanStr = str.replace(/[^A-Za-z0-9]/g, '');
    if (cleanStr.length >= 4 && cleanStr.length <= 8) {
      return cleanStr.toUpperCase();
    }
    return null;
  }, []);

  const stopCamera = useCallback(() => {
    isScanningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const scanFrame = useCallback(() => {
    if (!isScanningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      if (canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          const roomId = parseRoomId(code.data);
          if (roomId) {
            stopCamera();
            onScanSuccess(roomId);
            return;
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }, [parseRoomId, stopCamera, onScanSuccess]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setIsLoading(true);
    setError('');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Camera access is not supported by your browser. Please enter the room code manually.');
      setIsLoading(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS Safari
        await videoRef.current.play();
        setIsLoading(false);
        isScanningRef.current = true;
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      console.error('[QR Scanner] Camera error:', err);
      setIsLoading(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera permission denied. Please allow camera access in browser settings, or enter the code manually.');
      } else {
        setError('Unable to access camera. Please enter the room code manually.');
      }
    }
  }, [facingMode, scanFrame, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div className="qr-modal-overlay animate-fade-in" onClick={onClose}>
      <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="qr-modal-header">
          <div className="qr-modal-title">
            <Camera size={20} />
            <span>Scan QR Code</span>
          </div>
          <button className="qr-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Camera View Area */}
        <div className="qr-viewport">
          <video ref={videoRef} className="qr-video" muted playsInline />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {isLoading && (
            <div className="qr-loading-overlay">
              <RefreshCw className="spinner" size={36} />
              <p>Starting camera...</p>
            </div>
          )}

          {!isLoading && !error && (
            <div className="qr-scanner-overlay">
              <div className="qr-reticle">
                <div className="reticle-corner top-left" />
                <div className="reticle-corner top-right" />
                <div className="reticle-corner bottom-left" />
                <div className="reticle-corner bottom-right" />
                <div className="scan-laser" />
              </div>
              <p className="qr-scan-hint">Point your camera at the QR code on the PC</p>
            </div>
          )}

          {error && (
            <div className="qr-error-overlay">
              <AlertCircle size={36} className="text-error" />
              <p>{error}</p>
              <button className="qr-retry-btn" onClick={startCamera}>
                <RefreshCw size={16} />
                <span>Retry Camera</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="qr-modal-footer">
          {hasMultipleCameras && !error && (
            <button className="qr-flip-btn" onClick={toggleCamera} title="Switch camera">
              <SwitchCamera size={18} />
              <span>Flip Camera</span>
            </button>
          )}
          <button className="qr-cancel-btn" onClick={onClose}>
            Enter Code Manually
          </button>
        </div>
      </div>

      <style>{`
        .qr-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
        }

        .qr-modal-content {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          width: 100%;
          max-width: 440px;
          overflow: hidden;
          box-shadow: var(--shadow-xl);
          display: flex;
          flex-direction: column;
        }

        .qr-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .qr-modal-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          font-size: 1.1rem;
          color: var(--text-primary);
        }

        .qr-modal-title svg {
          color: var(--accent);
        }

        .qr-modal-close {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s, color 0.2s;
        }

        .qr-modal-close:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
        }

        .qr-viewport {
          position: relative;
          width: 100%;
          aspect-ratio: 4 / 3;
          background: #000;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .qr-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .qr-loading-overlay,
        .qr-error-overlay {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.85);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 24px;
          text-align: center;
          color: #f1f5f9;
        }

        .qr-error-overlay p {
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .text-error {
          color: #f87171;
        }

        .qr-retry-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--accent);
          color: #fff;
          border: none;
          padding: 8px 16px;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          margin-top: 6px;
        }

        .qr-scanner-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .qr-reticle {
          position: relative;
          width: 220px;
          height: 220px;
          border-radius: 16px;
          box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.45);
        }

        .reticle-corner {
          position: absolute;
          width: 28px;
          height: 28px;
          border-color: #6366f1;
          border-style: solid;
        }

        .top-left {
          top: -2px;
          left: -2px;
          border-width: 4px 0 0 4px;
          border-top-left-radius: 12px;
        }

        .top-right {
          top: -2px;
          right: -2px;
          border-width: 4px 4px 0 0;
          border-top-right-radius: 12px;
        }

        .bottom-left {
          bottom: -2px;
          left: -2px;
          border-width: 0 0 4px 4px;
          border-bottom-left-radius: 12px;
        }

        .bottom-right {
          bottom: -2px;
          right: -2px;
          border-width: 0 4px 4px 0;
          border-bottom-right-radius: 12px;
        }

        .scan-laser {
          position: absolute;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #818cf8, #a855f7, transparent);
          box-shadow: 0 0 12px 2px rgba(129, 140, 248, 0.7);
          animation: scanLaser 2.2s ease-in-out infinite;
        }

        @keyframes scanLaser {
          0% {
            top: 5%;
            opacity: 0.2;
          }
          50% {
            top: 95%;
            opacity: 1;
          }
          100% {
            top: 5%;
            opacity: 0.2;
          }
        }

        .qr-scan-hint {
          margin-top: 18px;
          font-size: 0.85rem;
          color: #f8fafc;
          background: rgba(15, 23, 42, 0.75);
          padding: 6px 14px;
          border-radius: 20px;
          backdrop-filter: blur(4px);
        }

        .qr-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 20px;
          border-top: 1px solid var(--border-color);
        }

        .qr-flip-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-card-hover);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          padding: 8px 14px;
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
        }

        .qr-cancel-btn {
          margin-left: auto;
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          padding: 8px;
        }

        .qr-cancel-btn:hover {
          color: var(--accent);
        }
      `}</style>
    </div>
  );
}

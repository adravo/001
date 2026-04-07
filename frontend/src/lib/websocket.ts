import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
    socket = io(`${WS_URL}/automation`, {
      auth: { token: Cookies.get('token') },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => console.log('WS connected'));
    socket.on('disconnect', () => console.log('WS disconnected'));
    socket.on('connect_error', (err) => console.error('WS error:', err.message));
  }
  return socket;
}

export function subscribeToSearch(
  searchRequestId: string,
  handlers: {
    onStatusUpdate?: (data: StatusUpdateEvent) => void;
    onCaptchaRequired?: (data: CaptchaRequiredEvent) => void;
    onProgress?: (data: ProgressEvent) => void;
    onCompleted?: (data: CompletedEvent) => void;
    onFailed?: (data: FailedEvent) => void;
  },
): () => void {
  const sock = getSocket();
  sock.emit('subscribe', { searchRequestId });

  if (handlers.onStatusUpdate)
    sock.on('status_update', handlers.onStatusUpdate);
  if (handlers.onCaptchaRequired)
    sock.on('captcha_required', handlers.onCaptchaRequired);
  if (handlers.onProgress)
    sock.on('progress', handlers.onProgress);
  if (handlers.onCompleted)
    sock.on('completed', handlers.onCompleted);
  if (handlers.onFailed)
    sock.on('failed', handlers.onFailed);

  // Return unsubscribe function
  return () => {
    sock.off('status_update');
    sock.off('captcha_required');
    sock.off('progress');
    sock.off('completed');
    sock.off('failed');
  };
}

export interface StatusUpdateEvent {
  searchRequestId: string;
  status: string;
  message: string;
  timestamp: string;
}

export interface CaptchaRequiredEvent {
  searchRequestId: string;
  screenshot: string; // base64
  sessionToken: string;
  message: string;
  timestamp: string;
}

export interface ProgressEvent {
  searchRequestId: string;
  step: string;
  percentage: number;
  timestamp: string;
}

export interface CompletedEvent {
  searchRequestId: string;
  reportId: string;
  message: string;
  timestamp: string;
}

export interface FailedEvent {
  searchRequestId: string;
  reason: string;
  fallback: string;
  timestamp: string;
}

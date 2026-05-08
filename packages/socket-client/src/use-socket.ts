'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { pingSchema, pongSchema, type PongPayload } from '@quiz-app/validation';

type Namespace = '/player' | '/mobile' | '/console' | '/admin';

interface UseSocketOptions {
  url?: string | undefined;
  autoConnect?: boolean | undefined;
}

interface UseSocketReturn {
  socket: Socket | null;
  connected: boolean;
  sendPing: () => void;
  lastPong: PongPayload | null;
}

const DEFAULT_API_URL = 'http://localhost:3000';

export function useSocket(namespace: Namespace, options: UseSocketOptions = {}): UseSocketReturn {
  const { url = DEFAULT_API_URL, autoConnect = true } = options;

  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastPong, setLastPong] = useState<PongPayload | null>(null);

  useEffect(() => {
    if (!autoConnect) return;

    const socket = io(`${url}${namespace}`, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('pong', (data: unknown) => {
      const parsed = pongSchema.safeParse(data);
      if (parsed.success) {
        setLastPong(parsed.data);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [url, namespace, autoConnect]);

  const sendPing = useCallback(() => {
    if (socketRef.current?.connected) {
      const payload = pingSchema.parse({
        timestamp: new Date().toISOString(),
      });
      socketRef.current.emit('ping', payload);
    }
  }, []);

  return { socket: socketRef.current, connected, sendPing, lastPong };
}

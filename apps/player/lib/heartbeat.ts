import { api } from './api';

let intervalId: ReturnType<typeof setInterval> | null = null;
let failCount = 0;

export function startHeartbeat(onFail?: () => void) {
  stopHeartbeat();
  failCount = 0;

  intervalId = setInterval(async () => {
    try {
      await api.post('/api/nucs/heartbeat', {});
      failCount = 0;
    } catch {
      failCount++;
      if (failCount >= 3 && onFail) {
        onFail();
      }
    }
  }, 30_000);
}

export function stopHeartbeat() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

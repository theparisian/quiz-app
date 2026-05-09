let backgroundAudio: HTMLAudioElement | null = null;
let muted = false;
let unlocked = false;

function tryUnlock() {
  if (unlocked) return;
  const handler = () => {
    unlocked = true;
    document.removeEventListener('click', handler);
    document.removeEventListener('touchstart', handler);
    if (backgroundAudio && !backgroundAudio.paused) return;
    if (backgroundAudio && !muted) {
      backgroundAudio.play().catch(() => {});
    }
  };
  document.addEventListener('click', handler);
  document.addEventListener('touchstart', handler);
}

export function preloadBackground(url: string) {
  if (backgroundAudio?.src === url) return;
  if (backgroundAudio) {
    backgroundAudio.pause();
    backgroundAudio = null;
  }
  backgroundAudio = new Audio(url);
  backgroundAudio.loop = true;
  backgroundAudio.volume = 0.3;
  backgroundAudio.preload = 'auto';
  backgroundAudio.muted = muted;
  tryUnlock();
}

export function playBackground() {
  if (!backgroundAudio || muted) return;
  backgroundAudio.play().catch(() => {});
}

export function pauseBackground() {
  if (!backgroundAudio) return;
  backgroundAudio.pause();
}

export function playSound(name: 'question-start' | 'question-end' | 'final') {
  if (muted) return;
  const audio = new Audio(`/sounds/${name}.mp3`);
  audio.volume = 0.6;
  audio.play().catch(() => {});
}

export function setMuted(value: boolean) {
  muted = value;
  if (backgroundAudio) {
    backgroundAudio.muted = value;
  }
}

export function isMuted() {
  return muted;
}

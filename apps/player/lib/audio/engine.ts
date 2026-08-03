import {
  MUSIC_CROSSFADE_MS,
  SFX_MAX_PER_SECOND,
  type AudioSlotKey,
  type ResolvedAudioCue,
  type ResolvedQuizAudio,
} from '@quiz-app/validation';
import { resolveMediaUrl } from '@/lib/media-url';

/**
 * Moteur audio de l'écran cinéma (interface A). Volontairement sans dépendance :
 * deux canaux musique pour le fondu enchaîné, un pool par SFX pour les rafales.
 *
 * Le moteur ne connaît rien de la machine à états du quiz : il expose des
 * primitives (`playMusic`, `playSfx`) que le directeur audio orchestre.
 */

const FADE_STEP_MS = 50;
const SFX_POOL_SIZE = 4;
/** Volume de la musique d'ambiance cinéma, qui n'a pas de slot configurable. */
const AMBIENT_VOLUME = 0.3;

interface MusicChannel {
  el: HTMLAudioElement;
  url: string | null;
  fadeHandle: ReturnType<typeof setInterval> | null;
}

interface SfxPool {
  url: string;
  volume: number;
  elements: HTMLAudioElement[];
  next: number;
  recentPlays: number[];
}

function cueUrl(cue: ResolvedAudioCue): string | null {
  // Les sons intégrés vivent dans /public du player : leur URL est déjà locale.
  return cue.source === 'builtin' ? cue.url : resolveMediaUrl(cue.url);
}

class AudioEngine {
  private cues: Partial<Record<string, ResolvedAudioCue>> = {};
  /** Évite de reconstruire les pools quand un snapshot renvoie une config identique. */
  private cuesSignature = '';
  private channels: MusicChannel[] = [];
  private activeChannel = 0;
  private sfxPools = new Map<string, SfxPool>();
  private muted = false;
  private unlocked = false;
  private unlockBound = false;
  /** Musique demandée avant le déverrouillage autoplay, rejouée dès le premier geste. */
  private pendingMusic: { url: string; volume: number; loop: boolean } | null = null;

  // ─── Cycle de vie ───────────────────────────────────────

  /**
   * Remplace la table des cues. Une musique déjà en cours dont l'URL n'a pas changé
   * n'est jamais coupée : c'est ce qui rend l'option « musique continue » possible.
   */
  configure(audio: ResolvedQuizAudio | null | undefined): void {
    const cues = audio?.enabled ? { ...audio.cues } : {};
    const signature = JSON.stringify(cues);
    if (signature === this.cuesSignature) return;

    this.cues = cues;
    this.cuesSignature = signature;
    this.sfxPools.clear();
    if (!audio?.enabled) this.stopMusic();
  }

  hasCue(key: AudioSlotKey): boolean {
    return Boolean(this.cues[key]);
  }

  setMuted(value: boolean): void {
    this.muted = value;
    for (const channel of this.channels) {
      channel.el.muted = value;
    }
    if (!value) this.resumeActiveChannel();
  }

  /**
   * Chrome bloque la lecture avant interaction utilisateur. Le NUC étant sans
   * clavier ni souris, on tente d'abord la lecture puis on retombe sur le premier
   * geste disponible : la musique démarre alors sans intervention explicite.
   */
  private bindUnlock(): void {
    if (this.unlockBound || typeof document === 'undefined') return;
    this.unlockBound = true;
    const handler = () => {
      this.unlocked = true;
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
      document.removeEventListener('touchstart', handler);
      const pending = this.pendingMusic;
      this.pendingMusic = null;
      if (pending) this.playMusicUrl(pending.url, pending.volume, pending.loop);
    };
    document.addEventListener('click', handler);
    document.addEventListener('keydown', handler);
    document.addEventListener('touchstart', handler);
  }

  // ─── Musique ────────────────────────────────────────────

  private ensureChannels(): MusicChannel[] {
    if (this.channels.length === 0) {
      for (let i = 0; i < 2; i += 1) {
        const el = new Audio();
        el.preload = 'auto';
        el.volume = 0;
        el.muted = this.muted;
        this.channels.push({ el, url: null, fadeHandle: null });
      }
    }
    return this.channels;
  }

  private current(): MusicChannel | null {
    return this.channels[this.activeChannel] ?? null;
  }

  private resumeActiveChannel(): void {
    const channel = this.current();
    if (!channel?.url || this.muted) return;
    void channel.el.play().catch(() => {});
  }

  /** Joue la musique du slot demandé. Aucun effet si c'est déjà celle qui tourne. */
  playMusic(key: AudioSlotKey): void {
    const cue = this.cues[key];
    if (!cue) return;
    const url = cueUrl(cue);
    if (!url) return;
    this.playMusicUrl(url, cue.volume, true);
  }

  /** Musique d'ambiance du cinéma (hors configuration quiz), ex. écran d'attente. */
  playAmbientUrl(url: string, volume = AMBIENT_VOLUME): void {
    const resolved = resolveMediaUrl(url);
    if (!resolved) return;
    this.playMusicUrl(resolved, volume, true);
  }

  private playMusicUrl(url: string, volume: number, loop: boolean): void {
    this.bindUnlock();
    const channels = this.ensureChannels();
    const current = channels[this.activeChannel]!;

    if (current.url === url) {
      this.fadeTo(current, volume);
      if (!this.muted && current.el.paused) {
        void current.el.play().catch(() => {
          this.pendingMusic = { url, volume, loop };
        });
      }
      return;
    }

    const nextIndex = (this.activeChannel + 1) % channels.length;
    const next = channels[nextIndex]!;

    this.stopFade(next);
    next.el.src = url;
    next.el.loop = loop;
    next.el.currentTime = 0;
    next.el.volume = 0;
    next.el.muted = this.muted;
    next.url = url;

    const started = next.el.play();
    if (started) {
      started.catch(() => {
        if (!this.unlocked) this.pendingMusic = { url, volume, loop };
      });
    }

    this.activeChannel = nextIndex;
    this.fadeTo(next, volume);
    if (current.url) this.fadeTo(current, 0, () => this.haltChannel(current));
  }

  stopMusic(): void {
    for (const channel of this.channels) {
      if (!channel.url) continue;
      this.fadeTo(channel, 0, () => this.haltChannel(channel));
    }
    this.pendingMusic = null;
  }

  pauseMusic(): void {
    const channel = this.current();
    if (channel) channel.el.pause();
  }

  private haltChannel(channel: MusicChannel): void {
    channel.el.pause();
    channel.el.removeAttribute('src');
    channel.url = null;
  }

  private stopFade(channel: MusicChannel): void {
    if (channel.fadeHandle) {
      clearInterval(channel.fadeHandle);
      channel.fadeHandle = null;
    }
  }

  private fadeTo(channel: MusicChannel, target: number, onDone?: () => void): void {
    this.stopFade(channel);
    const clamped = Math.min(1, Math.max(0, target));
    const steps = Math.max(1, Math.round(MUSIC_CROSSFADE_MS / FADE_STEP_MS));
    const delta = (clamped - channel.el.volume) / steps;
    let remaining = steps;

    channel.fadeHandle = setInterval(() => {
      remaining -= 1;
      const value = remaining <= 0 ? clamped : channel.el.volume + delta;
      channel.el.volume = Math.min(1, Math.max(0, value));
      if (remaining <= 0) {
        this.stopFade(channel);
        onDone?.();
      }
    }, FADE_STEP_MS);
  }

  // ─── SFX ────────────────────────────────────────────────

  private pool(key: AudioSlotKey, cue: ResolvedAudioCue): SfxPool | null {
    const existing = this.sfxPools.get(key);
    if (existing) return existing;
    const url = cueUrl(cue);
    if (!url) return null;
    const pool: SfxPool = {
      url,
      volume: cue.volume,
      elements: Array.from({ length: SFX_POOL_SIZE }, () => {
        const el = new Audio(url);
        el.preload = 'auto';
        el.volume = cue.volume;
        return el;
      }),
      next: 0,
      recentPlays: [],
    };
    this.sfxPools.set(key, pool);
    return pool;
  }

  /**
   * Joue un SFX. Les instances tournent en round-robin pour que deux occurrences
   * rapprochées se superposent, et un plafond par seconde évite la bouillie
   * sonore quand toute la salle répond en même temps.
   */
  playSfx(key: AudioSlotKey): void {
    if (this.muted) return;
    const cue = this.cues[key];
    if (!cue) return;
    const pool = this.pool(key, cue);
    if (!pool) return;

    const now = Date.now();
    pool.recentPlays = pool.recentPlays.filter((t) => now - t < 1000);
    if (pool.recentPlays.length >= SFX_MAX_PER_SECOND) return;
    pool.recentPlays.push(now);

    const el = pool.elements[pool.next]!;
    pool.next = (pool.next + 1) % pool.elements.length;
    el.volume = pool.volume;
    try {
      el.currentTime = 0;
    } catch {
      // Ressource pas encore prête : play() la démarrera au début de toute façon.
    }
    void el.play().catch(() => {});
    this.bindUnlock();
  }

  /** Précharge les SFX du quiz pour que la première occurrence ne soit pas en retard. */
  preloadSfx(): void {
    for (const [key, cue] of Object.entries(this.cues)) {
      if (cue && !cue.loop) this.pool(key as AudioSlotKey, cue);
    }
  }
}

export const audioEngine = new AudioEngine();

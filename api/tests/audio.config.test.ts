import { describe, expect, it } from 'vitest';
import {
  AUDIO_SLOTS,
  defaultQuizAudioConfig,
  readQuizAudioConfig,
  resolvedQuizAudioSchema,
} from '@quiz-app/validation';
import { AppError } from '../src/shared/errors/app-error.js';
import { sniffAudioMime } from '../src/shared/upload/audio-sniffer.js';

describe('readQuizAudioConfig', () => {
  it('retombe sur les valeurs par défaut pour un JSON absent ou corrompu', () => {
    const expected = defaultQuizAudioConfig();
    for (const raw of [null, undefined, 'nope', 42, [], { slots: 'oops' }]) {
      expect(readQuizAudioConfig(raw)).toEqual(expected);
    }
  });

  it('déclare un slot pour chaque cue du registre', () => {
    const config = defaultQuizAudioConfig();
    for (const slot of AUDIO_SLOTS) {
      expect(config.slots[slot.key]).toEqual({ soundId: null, volume: slot.defaultVolume });
    }
  });

  it('borne les volumes et ignore les références de son vides', () => {
    const config = readQuizAudioConfig({
      enabled: true,
      continuousMusic: true,
      masterVolume: 512,
      slots: {
        lobbyMusic: { soundId: '12', volume: -30 },
        gameMusic: { soundId: '', volume: 42.6 },
        unknownSlot: { soundId: '99', volume: 10 },
      },
    });

    expect(config.masterVolume).toBe(100);
    expect(config.continuousMusic).toBe(true);
    expect(config.slots.lobbyMusic).toEqual({ soundId: '12', volume: 0 });
    expect(config.slots.gameMusic).toEqual({ soundId: null, volume: 43 });
    expect(config.slots.unknownSlot).toBeUndefined();
  });

  it('ignore un slot mal typé sans perdre les autres', () => {
    const config = readQuizAudioConfig({
      slots: { lobbyMusic: 'nope', questionStart: { soundId: '7', volume: 80 } },
    });
    expect(config.slots.lobbyMusic?.soundId).toBeNull();
    expect(config.slots.questionStart).toEqual({ soundId: '7', volume: 80 });
  });
});

describe('resolvedQuizAudioSchema', () => {
  it('accepte un payload player avec volume normalisé', () => {
    const parsed = resolvedQuizAudioSchema.safeParse({
      enabled: true,
      continuousMusic: false,
      cues: {
        lobbyMusic: { url: '/uploads/sound/a.mp3', source: 'storage', volume: 0.24, loop: true },
        questionStart: {
          url: '/sounds/question-start.mp3',
          source: 'builtin',
          volume: 0.6,
          loop: false,
        },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('refuse un volume hors bornes ou une source inconnue', () => {
    expect(
      resolvedQuizAudioSchema.safeParse({
        enabled: true,
        continuousMusic: false,
        cues: { lobbyMusic: { url: 'a.mp3', source: 'storage', volume: 1.4, loop: true } },
      }).success,
    ).toBe(false);
    expect(
      resolvedQuizAudioSchema.safeParse({
        enabled: true,
        continuousMusic: false,
        cues: { lobbyMusic: { url: 'a.mp3', source: 'cdn', volume: 0.5, loop: true } },
      }).success,
    ).toBe(false);
  });
});

describe('sniffAudioMime', () => {
  it('reconnaît les conteneurs supportés par leur signature', () => {
    expect(sniffAudioMime(Buffer.from('ID3\u0004\u0000', 'latin1'))).toBe('audio/mpeg');
    expect(sniffAudioMime(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toBe('audio/mpeg');
    expect(sniffAudioMime(Buffer.from('OggS', 'latin1'))).toBe('audio/ogg');
    expect(sniffAudioMime(Buffer.from('fLaC', 'latin1'))).toBe('audio/flac');
    expect(sniffAudioMime(Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVE', 'latin1'))).toBe(
      'audio/wav',
    );
    expect(sniffAudioMime(Buffer.from('\u0000\u0000\u0000 ftypM4A ', 'latin1'))).toBe('audio/mp4');
    expect(sniffAudioMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).toBe('audio/webm');
  });

  it('refuse un fichier non audio même si le MIME déclaré est audio', () => {
    expect(() => sniffAudioMime(Buffer.from('<html></html>', 'utf8'))).toThrow(AppError);
    expect(() => sniffAudioMime(Buffer.from('GIF89a', 'latin1'))).toThrow(AppError);
  });
});

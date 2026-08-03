import {
  AUDIO_SLOTS,
  EMPTY_RESOLVED_AUDIO,
  readQuizAudioConfig,
  type ResolvedAudioCue,
  type ResolvedQuizAudio,
} from '@quiz-app/validation';
import { prisma } from '../../shared/db/index.js';

/**
 * Traduit `quizzes.audio_config` en cues prêtes à jouer pour le player cinéma.
 *
 * Tolérance aux pannes volontaire : un son supprimé ou introuvable retombe sur le
 * son intégré au player (ou sur le silence). Une session ne doit jamais échouer
 * à cause de l'audio.
 */
export async function resolveQuizAudioPayload(quiz: {
  id: bigint;
  audioConfig: unknown;
}): Promise<ResolvedQuizAudio> {
  const config = readQuizAudioConfig(quiz.audioConfig);
  if (!config.enabled) return EMPTY_RESOLVED_AUDIO;

  const referencedIds = [...new Set(Object.values(config.slots).map((s) => s.soundId))].filter(
    (id): id is string => id !== null,
  );

  const soundsById = new Map<string, { audioUrl: string }>();
  if (referencedIds.length > 0) {
    const ids: bigint[] = [];
    for (const id of referencedIds) {
      try {
        ids.push(BigInt(id));
      } catch {
        // Référence corrompue : ignorée, le slot retombera sur son fallback.
      }
    }
    if (ids.length > 0) {
      const rows = await prisma.sound.findMany({
        where: { id: { in: ids }, OR: [{ quizId: null }, { quizId: quiz.id }] },
        select: { id: true, audioUrl: true },
      });
      for (const row of rows) {
        soundsById.set(row.id.toString(), { audioUrl: row.audioUrl });
      }
    }
  }

  const masterFactor = config.masterVolume / 100;
  const cues: Record<string, ResolvedAudioCue> = {};

  for (const slot of AUDIO_SLOTS) {
    const assignment = config.slots[slot.key];
    if (!assignment) continue;

    const sound = assignment.soundId ? soundsById.get(assignment.soundId) : undefined;
    const url = sound?.audioUrl ?? slot.builtInUrl;
    if (!url) continue;

    cues[slot.key] = {
      url,
      source: sound ? 'storage' : 'builtin',
      volume: Number(((assignment.volume / 100) * masterFactor).toFixed(3)),
      loop: slot.kind === 'music',
    };
  }

  return { enabled: true, continuousMusic: config.continuousMusic, cues };
}

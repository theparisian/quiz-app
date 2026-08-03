import { AppError } from '../errors/app-error.js';

/**
 * Vérifie que le fichier est réellement un conteneur audio connu.
 * Le MIME déclaré par le navigateur est trivialement falsifiable ; on lit donc
 * la signature réelle avant de servir le fichier au player en salle.
 */

function hasAscii(buffer: Buffer, offset: number, text: string): boolean {
  if (buffer.length < offset + text.length) return false;
  return buffer.toString('latin1', offset, offset + text.length) === text;
}

function isMp3(buffer: Buffer): boolean {
  // ID3v2 en tête, ou synchronisation de frame MPEG (0xFF 0xEx/0xFx).
  if (hasAscii(buffer, 0, 'ID3')) return true;
  if (buffer.length < 2) return false;
  const b0 = buffer[0]!;
  const b1 = buffer[1]!;
  return b0 === 0xff && (b1 & 0xe0) === 0xe0;
}

function isMp4Audio(buffer: Buffer): boolean {
  return hasAscii(buffer, 4, 'ftyp');
}

function isWav(buffer: Buffer): boolean {
  return hasAscii(buffer, 0, 'RIFF') && hasAscii(buffer, 8, 'WAVE');
}

function isMatroska(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  );
}

function isAdtsAac(buffer: Buffer): boolean {
  if (buffer.length < 2) return false;
  return buffer[0] === 0xff && (buffer[1]! & 0xf6) === 0xf0;
}

/**
 * Retourne le MIME canonique déduit du contenu, ou lève une AppError si la
 * signature n'est reconnue par aucun conteneur audio supporté.
 */
export function sniffAudioMime(buffer: Buffer): string {
  if (hasAscii(buffer, 0, 'OggS')) return 'audio/ogg';
  if (hasAscii(buffer, 0, 'fLaC')) return 'audio/flac';
  if (isWav(buffer)) return 'audio/wav';
  if (isMatroska(buffer)) return 'audio/webm';
  if (isMp4Audio(buffer)) return 'audio/mp4';
  if (isMp3(buffer)) return 'audio/mpeg';
  if (isAdtsAac(buffer)) return 'audio/aac';
  throw new AppError(
    'Unrecognized audio file (supported: MP3, OGG, WAV, M4A/AAC, FLAC, WebM)',
    400,
    'AUDIO_INVALID_FILE',
  );
}

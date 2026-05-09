export const BAD_WORDS_FR = [
  'connard',
  'connasse',
  'salaud',
  'salope',
  'putain',
  'pute',
  'merde',
  'enculer',
  'encule',
  'enculé',
  'nique',
  'niquer',
  'ntm',
  'fdp',
  'batard',
  'bâtard',
  'pd',
  'pédé',
  'gouine',
  'trou du cul',
  'trouduc',
  'branleur',
  'branleuse',
  'couille',
  'couilles',
  'bite',
  'chier',
  'bouffon',
  'bouffonne',
  'con',
  'conne',
  'abruti',
  'abrutie',
];

export const BAD_WORDS_EN = [
  'fuck',
  'fucker',
  'shit',
  'asshole',
  'bitch',
  'bastard',
  'dick',
  'pussy',
  'cunt',
  'damn',
  'slut',
  'whore',
  'nigger',
  'nigga',
  'retard',
  'faggot',
  'fag',
  'motherfucker',
  'cock',
  'wanker',
  'twat',
  'bollocks',
  'prick',
  'arse',
  'arsehole',
  'crap',
];

const ALL_BAD_WORDS = [...BAD_WORDS_FR, ...BAD_WORDS_EN];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function containsBadWord(text: string): boolean {
  const normalized = normalize(text);
  return ALL_BAD_WORDS.some((word) => {
    const normalizedWord = normalize(word);
    const regex = new RegExp(`\\b${normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(normalized);
  });
}

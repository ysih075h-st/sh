// Korean particles that depend on whether the previous syllable ends in a consonant (받침).

function lastChar(word: string): string {
  const s = word.replace(/[\s"'”’)\]}>.,!?…]+$/u, '');
  return s.slice(-1);
}

/** true / false for Hangul, null when the word ends in something we cannot judge reliably. */
export function hasBatchim(word: string): boolean | null {
  const c = lastChar(word);
  if (!c) return null;
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(c)) return /[013678]/.test(c); // 영, 일, 삼, 육, 칠, 팔 end in a consonant
  if (/[a-z]/i.test(c)) return /[lmnr]/i.test(c);
  return null;
}

function rieul(word: string): boolean {
  const code = lastChar(word).charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
}

type Pair = '은/는' | '이/가' | '을/를' | '과/와' | '으로/로' | '이에요/예요';

/** Attach the right particle: josa('보고서', '을/를') → '보고서를' */
export function josa(word: string, pair: Pair): string {
  const [withB, without] = pair.split('/');
  const b = hasBatchim(word);
  if (pair === '으로/로') return word + (b && !rieul(word) ? withB : without);
  if (b === null) return word + (pair === '이에요/예요' ? '이에요' : `${withB}(${without})`);
  return word + (b ? withB : without);
}

/** Just the particle: particle('보고서', '을/를') → '를' */
export function particle(word: string, pair: Pair): string {
  return josa(word, pair).slice(word.length);
}

import CFB from 'cfb';
import { inflateSync } from 'fflate';
import aesjs from 'aes-js';

/** Thrown when a file is recognized but cannot be read; `code` maps to a message in readers.ts. */
export class ReadError extends Error {
  constructor(public code: string) { super(code); }
}

const TAG_PARA_TEXT = 67;
const TAG_DISTRIBUTE_DOC_DATA = 28;

type Cfb = ReturnType<typeof CFB.read>;

export function openCfb(u8: Uint8Array): Cfb {
  try {
    return CFB.read(u8, { type: 'array' });
  } catch {
    throw new ReadError('error');
  }
}

function stream(cfb: Cfb, path: string): Uint8Array | null {
  const e = CFB.find(cfb, path);
  return e && e.content ? Uint8Array.from(e.content as ArrayLike<number>) : null;
}

/** Numbered streams such as BodyText/Section0, BodyText/Section1 ... in order. */
function sections(cfb: Cfb, storage: string): Uint8Array[] {
  const re = new RegExp(`${storage}/Section(\\d+)$`);
  return cfb.FullPaths
    .map((p, i) => ({ m: p.match(re), i }))
    .filter(x => x.m)
    .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
    .map(x => Uint8Array.from(cfb.FileIndex[x.i].content as ArrayLike<number>));
}

interface Rec { tag: number; payload: Uint8Array }

function* records(buf: Uint8Array): Generator<Rec> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  while (o + 4 <= buf.length) {
    const h = dv.getUint32(o, true);
    o += 4;
    let size = h >>> 20;
    if (size === 0xfff) {
      if (o + 4 > buf.length) return;
      size = dv.getUint32(o, true);
      o += 4;
    }
    if (o + size > buf.length) return;
    yield { tag: h & 0x3ff, payload: buf.subarray(o, o + size) };
    o += size;
  }
}

/** Control characters that take one code unit; every other control below 32 takes eight. */
const SINGLE = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

function paraText(p: Uint8Array): string {
  let out = '';
  const n = p.length >> 1;
  for (let i = 0; i < n;) {
    const c = p[i * 2] | (p[i * 2 + 1] << 8);
    if (c >= 32) { out += String.fromCharCode(c); i++; continue; }
    if (SINGLE.has(c)) {
      if (c === 10 || c === 13) out += '\n';
      else if (c === 24) out += '-';
      else if (c === 30 || c === 31) out += ' ';
      i++;
    } else {
      if (c === 9) out += '\t';
      i += 8;
    }
  }
  return out;
}

function sectionText(raw: Uint8Array, compressed: boolean): string {
  let buf = raw;
  if (compressed) {
    try { buf = inflateSync(raw); } catch { throw new ReadError('error'); }
  }
  let out = '';
  for (const r of records(buf)) {
    if (r.tag !== TAG_PARA_TEXT) continue;
    const t = paraText(r.payload);
    out += t.endsWith('\n') ? t : t + '\n';
  }
  return out;
}

/** MSVC srand()/rand(). */
function msvcRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 214013) + 2531011) >>> 0;
    return (s >>> 16) & 0x7fff;
  };
}

/** 배포용 문서: the first record holds a scrambled AES key; the rest of the stream is AES-128-ECB. */
export function decryptDistributed(raw: Uint8Array): Uint8Array {
  const first = records(raw).next();
  if (first.done || first.value.tag !== TAG_DISTRIBUTE_DOC_DATA || first.value.payload.length !== 256) throw new ReadError('error');
  const data = Uint8Array.from(first.value.payload);
  const seed = (data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>> 0;
  const rand = msvcRand(seed);
  let key = 0, n = 0;
  for (let i = 0; i < 256; i++) {
    if (n === 0) { key = rand() & 0xff; n = (rand() & 0xf) + 1; }
    if (i >= 4) data[i] ^= key;
    n--;
  }
  const off = 4 + (seed & 0xf);
  const aesKey = data.slice(off, off + 16);
  const tail = raw.subarray(4 + 256);
  const len = tail.length - (tail.length % 16);
  return new aesjs.ModeOfOperation.ecb(aesKey).decrypt(tail.subarray(0, len));
}

/** Reads the text of a 한글 5.0 (.hwp) document, including tables, footnotes and 배포용 문서. */
export function readHwp(u8: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(u8.subarray(0, 32));
  if (head.startsWith('HWP Document File V3')) throw new ReadError('hwp3');
  const cfb = openCfb(u8);
  const header = stream(cfb, 'FileHeader');
  if (!header || header.length < 40) throw new ReadError('error');
  const flags = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(36, true);
  const compressed = (flags & 1) !== 0;
  if (flags & 2) throw new ReadError('password');
  const distributed = (flags & 4) !== 0;

  let text = '';
  if (distributed) {
    for (const s of sections(cfb, 'ViewText')) text += sectionText(decryptDistributed(s), compressed);
  } else {
    for (const s of sections(cfb, 'BodyText')) text += sectionText(s, compressed);
  }
  if (text.replace(/\s/g, '').length < 20) {
    // Fall back to the short preview text the editor stores alongside the document.
    const prv = stream(cfb, 'PrvText');
    if (prv) text = new TextDecoder('utf-16le').decode(prv);
  }
  // U+F53A is the 한 of Hancom's own 한/글 logo; other private-use glyphs are symbols with no text meaning.
  return text.replace(//g, '한').replace(/[-]/g, '').replace(/\t+/g, ' ').replace(/[  ]{2,}/g, ' ');
}

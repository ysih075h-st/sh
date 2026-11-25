import type { Worker } from 'tesseract.js';
import { ReadError } from './hwp';

/** Marks a word the recognizer could not read. Never part of a requirement; at most one per evidence sentence. */
export const UNSURE = '▢';
const WORD_MIN_CONF = 60;
const LINE_MIN_CONF = 65;
const IDLE_MS = 3 * 60 * 1000;

type Kind = 'main' | 'kor';
const workers: Partial<Record<Kind, Promise<Worker>>> = {};
let idle = 0;

function abs(path: string) { return new URL(path, location.href).href; }

/**
 * 'main' reads Korean and English together and gets word spacing right. It sometimes reads a Korean word
 * as Latin letters (배달앱 → HEH), so 'kor' re-reads just those words with Korean only.
 */
async function getWorker(kind: Kind, status: (m: string) => void): Promise<Worker> {
  clearTimeout(idle);
  if (!workers[kind]) {
    if (kind === 'main') status('글자 인식 도구를 준비하는 중이에요. 처음 한 번만 8MB 정도 받아요.');
    const p = import('tesseract.js').then(async T => {
      const w = await T.createWorker(kind === 'main' ? ['kor', 'eng'] : ['kor'], T.OEM.LSTM_ONLY, {
        workerPath: abs('/ocr/worker.min.js'),
        corePath: abs('/ocr/core'),
        langPath: abs('/ocr/lang'),
        gzip: true
      });
      if (kind === 'kor') await w.setParameters({ tessedit_pageseg_mode: T.PSM.SINGLE_LINE });
      return w;
    });
    workers[kind] = p;
    p.catch(() => { delete workers[kind]; });
  }
  try {
    return await workers[kind]!;
  } catch {
    throw new ReadError('offline');
  }
}

function release() {
  clearTimeout(idle);
  idle = window.setTimeout(async () => {
    for (const k of Object.keys(workers) as Kind[]) {
      const p = workers[k];
      delete workers[k];
      if (p) (await p).terminate();
    }
  }, IDLE_MS);
}

/** Corrections for misreads that are unambiguous in assignment notices. */
export function fixOcr(line: string): string {
  let s = line
    .replace(/^(\d{1,2}[.)])(?=[가-힣A-Za-z])/, '$1 ')
    .replace(/(^|[\s(:：])[&@64]4(?=\s*(용지|\d+\s*(쪽|매|장|페이지|page)))/gi, '$1A4');
  // 앱 (app) is often read as 앰; 앰 practically never ends a word (앰프, 앰뷸런스 start with it).
  s = s.replace(/([가-힣])앰(?=([이을를은는의에과와도만로]|에서|으로)?([\s,.)]|$))/g, '$1앱');
  // % is often read as 96 or 9 (30% → 3096, 20% → 209); only fixed on lines that already have a real percentage.
  if (/\d\s*%/.test(s)) s = s.replace(/\b([1-9]?\d0)(96|9)(?=[,\s)]|$)/g, '$1%');
  return s;
}

interface OcrWord { text: string; confidence: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }
interface OcrLine { text: string; confidence: number; words: OcrWord[] }

/** Acronyms that really appear in assignment notices; kept when read with reasonable confidence. */
const ACRONYM = /^(A4|APA|MLA|IEEE|ASA|PDF|LMS|HWPX?|PPTX?|DOCX?|XLSX?|ZIP|SPSS|Excel|Word|PowerPoint|URL|DOI|ISBN|GDP|AI|SNS|IT|OTT|ESG|MZ|PPT)$/i;
const REREAD_MIN_CONF = 75;
const MAX_REREADS = 40;

/** A Latin-looking word in a Korean line is often a misread Korean word. */
export function suspicious(w: OcrWord, line: OcrLine): boolean {
  if (!/[A-Za-z]/.test(w.text)) return false;
  if ((line.text.match(/[가-힣]/g) || []).length < 4) return false;
  const core = w.text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/(에|로|의|를|은|는|이|가|와|과|으로|에서)$/, '');
  return !(ACRONYM.test(core) && w.confidence >= 55);
}

/** Accepts a Korean re-read only when it is clearly Korean and confident; otherwise the word is marked unsure. */
export function acceptReread(text: string, confidence: number): string {
  const t = text.replace(/\s+/g, '');
  return confidence >= REREAD_MIN_CONF && /[가-힣]/.test(t) && !/[A-Za-z]/.test(t) ? t : UNSURE;
}

function crop(src: HTMLCanvasElement, b: NonNullable<OcrWord['bbox']>): HTMLCanvasElement {
  const pad = Math.round((b.y1 - b.y0) * 0.3);
  const x = Math.max(0, b.x0 - pad), y = Math.max(0, b.y0 - pad);
  const w = Math.min(src.width - x, b.x1 - b.x0 + 2 * pad), h = Math.min(src.height - y, b.y1 - b.y0 + 2 * pad);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

/** Rebuilds a line from its words, replacing words the recognizer was unsure about with ▢. */
export function lineText(l: OcrLine, reread: Map<OcrWord, string> = new Map()): string {
  const t = l.text.replace(/\n$/, '');
  let out = '', pos = 0;
  for (const w of l.words) {
    const i = t.indexOf(w.text, pos);
    if (i < 0) continue;
    out += t.slice(pos, i) + (reread.get(w) ?? (w.confidence < WORD_MIN_CONF ? UNSURE : w.text));
    pos = i + w.text.length;
  }
  out += t.slice(pos);
  out = out.replace(new RegExp(`${UNSURE}(\\s*${UNSURE})+`, 'g'), UNSURE).replace(/\s+/g, ' ').trim();
  if (l.confidence < LINE_MIN_CONF && !out.includes(UNSURE)) out = `${UNSURE} ${out}`;
  return fixOcr(out);
}

const ITEM = /^([•\-–·●○■□▶►*]|\d{1,2}[.)]|[①-⑳]|[가-하][.)]|\(\d{1,2}\))/;

/** Lines in one recognized paragraph are wrapped text: join them unless they are list items or end a sentence. */
export function joinParagraph(lines: string[]): string {
  let out = '';
  for (const l of lines) {
    if (!out) out = l;
    else if (ITEM.test(l) || /[.!?。:：]$/.test(out)) out += '\n' + l;
    else out += ' ' + l;
  }
  return out;
}

/** Recognizes Korean and English text in a canvas. Lines that are only noise are dropped. */
export async function recognize(canvas: HTMLCanvasElement, status: (m: string) => void): Promise<string> {
  try {
    const main = await getWorker('main', status);
    const { data } = await main.recognize(canvas, {}, { text: true, blocks: true });
    const paras = (data.blocks || []).flatMap(b => b.paragraphs.map(p => p.lines as unknown as OcrLine[]));
    const reread = new Map<OcrWord, string>();
    const todo = paras.flat().flatMap(l => l.words.filter(w => w.bbox && suspicious(w, l))).slice(0, MAX_REREADS);
    if (todo.length) {
      const kor = await getWorker('kor', status);
      for (const w of todo) {
        const r = (await kor.recognize(crop(canvas, w.bbox!))).data;
        reread.set(w, acceptReread(r.text, r.confidence));
      }
    }
    return paras.map(p => joinParagraph(p.map(l => lineText(l, reread)).filter(t => t.replace(new RegExp(UNSURE, 'g'), '').replace(/[^가-힣A-Za-z0-9]/g, '').length >= 2))).join('\n\n');
  } finally {
    release();
  }
}

/** Draws an image file on a canvas at a size the recognizer reads well. */
export async function imageCanvas(file: Blob): Promise<HTMLCanvasElement> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ReadError('heic');
  }
  const long = Math.max(bmp.width, bmp.height);
  const scale = long > 3000 ? 3000 / long : long < 1200 ? 1200 / long : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

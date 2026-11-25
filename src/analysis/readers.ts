import { strFromU8, unzipSync } from 'fflate';
import type { TaskFile, Unreadable } from '../domain/types';
import { analyzeText } from './text';
import { readHwp, ReadError } from './hwp';
import { readDoc, readPpt } from './legacy';
import { imageCanvas, recognize, UNSURE } from './ocr';

const MAX_BYTES = 50 * 1024 * 1024;
/** Scanned pages are slow to recognize, so long scans are read up to this many pages. */
const MAX_OCR_PAGES = 20;

export type Status = (message: string) => void;

function xmlText(xml: string, paraEnd: string): string {
  return xml.split(paraEnd).join('\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

function readOffice(u8: Uint8Array, ext: string): string {
  const want: Record<string, RegExp> = { docx: /^word\/document\.xml$/, pptx: /^ppt\/slides\/slide\d+\.xml$/, xlsx: /^xl\/sharedStrings\.xml$/, hwpx: /^Contents\/section\d+\.xml$/ };
  const end: Record<string, string> = { docx: '</w:p>', pptx: '</a:p>', xlsx: '</si>', hwpx: '</hp:p>' };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(u8, { filter: f => want[ext].test(f.name) });
  } catch {
    // Office files with a password are not zip archives but encrypted compound files.
    throw new ReadError(u8[0] === 0xd0 && u8[1] === 0xcf ? 'password' : 'error');
  }
  const order = (n: string) => Number((n.match(/(\d+)\.xml$/) || [0, 0])[1]);
  return Object.keys(files).sort((a, b) => order(a) - order(b)).map(n => xmlText(strFromU8(files[n]), end[ext])).join('\n');
}

let pdfjsP: Promise<typeof import('pdfjs-dist')> | null = null;
function pdfjs() {
  if (!pdfjsP) {
    pdfjsP = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsP;
}

interface Read { text: string; ocr?: boolean; note?: string }

/** Reads the text layer of each page; pages without one (scans) are rendered and recognized. */
async function readPdf(u8: Uint8Array, status: Status): Promise<Read> {
  const lib = await pdfjs();
  let doc;
  try {
    doc = await lib.getDocument({ data: u8, cMapUrl: '/cmaps/', cMapPacked: true, isEvalSupported: false }).promise;
  } catch (e: any) {
    throw new ReadError(e && e.name === 'PasswordException' ? 'password' : 'error');
  }
  const pages = Math.min(doc.numPages, 80);
  const texts: string[] = [];
  const scanned: number[] = [];
  for (let p = 1; p <= pages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const t = tc.items.map((it: any) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('');
    texts.push(t);
    if (t.replace(/\s/g, '').length < 30) scanned.push(p);
  }
  let ocr = false, note: string | undefined;
  if (scanned.length) {
    const todo = scanned.slice(0, MAX_OCR_PAGES);
    for (let i = 0; i < todo.length; i++) {
      status(`스캔한 쪽에서 글자를 읽는 중이에요 (${i + 1}/${todo.length}쪽)`);
      const page = await doc.getPage(todo[i]);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, 1800 / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const t = await recognize(canvas, status);
      texts[todo[i] - 1] = `${texts[todo[i] - 1]}\n${t}`;
      ocr = true;
    }
    if (scanned.length > todo.length) note = `스캔한 쪽이 많아 앞 ${MAX_OCR_PAGES}쪽만 읽었어요.`;
  }
  if (doc.numPages > pages) note = `${pages}쪽까지만 읽었어요.`;
  await doc.destroy();
  return { text: texts.join('\n'), ocr, note };
}

/** Plain text files from Korean Windows are often CP949/EUC-KR rather than UTF-8. */
function readPlain(u8: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(u8);
  if ((utf8.match(/�/g) || []).length > 3) {
    try { return new TextDecoder('euc-kr').decode(u8); } catch { /* not supported */ }
  }
  return utf8;
}

async function readImage(file: File, status: Status): Promise<Read> {
  status('사진에서 글자를 읽는 중이에요.');
  return { text: await recognize(await imageCanvas(file), status), ocr: true };
}

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/;

/** Reads a source the student uploads and analyzes it in the browser. The file itself is not kept or sent anywhere. */
export async function readSource(file: File, status: Status = () => {}): Promise<TaskFile> {
  const r: TaskFile = { name: file.name, size: file.size, kind: 'text' };
  const name = file.name.toLowerCase();
  const ext = (name.match(/\.([a-z0-9]+)$/) || ['', ''])[1];
  const fail = (why: Unreadable): TaskFile => ({ ...r, kind: 'other', why });
  if (file.size > MAX_BYTES) return fail('error');
  let read: Read;
  try {
    if (/^image\//.test(file.type) || IMAGE.test(name)) read = await readImage(file, status);
    else {
      const u8 = new Uint8Array(await file.arrayBuffer());
      if (ext === 'pdf' || file.type === 'application/pdf') read = await readPdf(u8, status);
      else if (ext === 'hwp') read = { text: readHwp(u8) };
      else if (ext === 'doc') read = { text: readDoc(u8) };
      else if (ext === 'ppt') read = { text: readPpt(u8) };
      else if (/^(docx|pptx|xlsx|hwpx)$/.test(ext)) read = { text: readOffice(u8, ext) };
      else if (/^text\//.test(file.type) || /^(txt|md|csv)$/.test(ext)) read = { text: readPlain(u8) };
      else return fail('type');
    }
  } catch (e) {
    return fail(e instanceof ReadError ? (e.code as Unreadable) : 'error');
  }
  const text = read.text.trim();
  if (text.split(UNSURE).join('').replace(/[^가-힣A-Za-z0-9]/g, '').length < 20) return fail(read.ocr ? 'blank' : 'empty');
  return { ...r, ocr: read.ocr || undefined, note: read.note, auto: analyzeText(text.slice(0, 80000), read.ocr ? UNSURE : undefined) };
}

export const UNREADABLE_MESSAGE: Record<string, string> = {
  password: '암호가 걸린 파일이에요. 암호를 푼 뒤 저장해서 다시 올려 주세요.',
  hwp3: '아주 오래된 한글 형식(한글 97 이전)이에요. 한글에서 열어 새 형식(.hwp, .hwpx)이나 PDF로 저장해 다시 올려 주세요.',
  heic: '이 브라우저는 이 사진 형식(HEIC)을 열지 못해요. 사진 앱에서 JPG로 내보내거나 화면을 캡처해서 올려 주세요.',
  offline: '글자 인식 도구를 받지 못했어요. 인터넷에 연결된 상태에서 다시 올려 주세요.',
  blank: '사진에서 읽을 수 있는 글자를 찾지 못했어요. 글자가 화면을 채우도록 가까이, 밝은 곳에서 다시 찍어 올려 주세요.',
  type: '이 형식은 읽지 못해요. PDF, 한글, 워드, PPT, 엑셀(.xlsx), 사진, 텍스트 파일을 올려 주세요.',
  empty: '파일에서 읽을 글자가 없어요.',
  error: '파일을 여는 데 실패했어요. 50MB보다 크거나 손상된 파일일 수 있어요.',
  // Files uploaded with an earlier version, which could not read these yet.
  hwp: '이전 버전에서 올려 읽지 못한 파일이에요. 삭제하고 다시 올리면 읽을 수 있어요.',
  scan: '이전 버전에서 올려 읽지 못한 파일이에요. 삭제하고 다시 올리면 스캔한 쪽도 읽어요.',
  image: '이전 버전에서 올려 읽지 못한 사진이에요. 삭제하고 다시 올리면 글자를 읽어요.'
};

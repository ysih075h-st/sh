import { strFromU8, unzipSync } from 'fflate';
import type { TaskFile } from '../domain/types';
import { analyzeText } from './text';

const MAX_BYTES = 30 * 1024 * 1024;

function xmlText(xml: string, paraEnd: string): string {
  return xml.split(paraEnd).join('\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

async function readOffice(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const want: Record<string, RegExp> = { docx: /^word\/document\.xml$/, pptx: /^ppt\/slides\/slide\d+\.xml$/, xlsx: /^xl\/sharedStrings\.xml$/, hwpx: /^Contents\/section\d+\.xml$/ };
  const end: Record<string, string> = { docx: '</w:p>', pptx: '</a:p>', xlsx: '</si>', hwpx: '</hp:p>' };
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: f => want[ext].test(f.name) });
  const order = (n: string) => Number((n.match(/(\d+)\.xml$/) || [0, 0])[1]);
  return Object.keys(files).sort((a, b) => order(a) - order(b)).map(n => xmlText(strFromU8(files[n]), end[ext])).join('\n');
}

let pdfjsP: Promise<typeof import('pdfjs-dist')> | null = null;
async function readPdf(file: File): Promise<string> {
  if (!pdfjsP) {
    pdfjsP = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  const lib = await pdfjsP;
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: '/cmaps/', cMapPacked: true, isEvalSupported: false }).promise;
  let out = '';
  for (let p = 1; p <= Math.min(doc.numPages, 80) && out.length < 80000; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    out += tc.items.map((it: any) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('') + '\n';
  }
  await doc.destroy();
  return out;
}

/** Plain text files from Korean Windows are often CP949/EUC-KR rather than UTF-8. */
async function readPlain(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if ((utf8.match(/�/g) || []).length > 3) {
    try { return new TextDecoder('euc-kr').decode(buf); } catch { /* not supported */ }
  }
  return utf8;
}

/** Reads a source the student uploads and analyzes it in the browser. The file itself is not kept. */
export async function readSource(file: File): Promise<TaskFile> {
  const r: TaskFile = { name: file.name, size: file.size, kind: 'text' };
  const name = file.name.toLowerCase();
  if (file.size > MAX_BYTES) return { ...r, kind: 'other', why: 'error' };
  if (/^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|heic)$/.test(name)) return { ...r, kind: 'other', why: 'image' };
  if (/\.hwp$/.test(name)) return { ...r, kind: 'other', why: 'hwp' };
  let text = '';
  try {
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) text = await readPdf(file);
    else if (/\.(docx|pptx|xlsx|hwpx)$/.test(name)) text = await readOffice(file);
    else if (/^text\//.test(file.type) || /\.(txt|md|csv)$/.test(name)) text = await readPlain(file);
    else return { ...r, kind: 'other', why: 'type' };
  } catch {
    return { ...r, kind: 'other', why: 'error' };
  }
  if (text.replace(/\s/g, '').length < 20) return { ...r, kind: 'other', why: name.endsWith('.pdf') ? 'scan' : 'empty' };
  return { ...r, auto: analyzeText(text.slice(0, 80000)) };
}

export const UNREADABLE_MESSAGE: Record<string, string> = {
  hwp: '한글(.hwp)은 읽지 못해요. 한글에서 PDF나 .hwpx로 저장해 다시 올려 주세요.',
  scan: '글자를 찾지 못했어요. 스캔한 PDF라면 필요한 내용을 과제 내용 칸에 옮겨 적어 주세요.',
  image: '이미지는 글자를 읽지 못해요. 필요한 내용을 과제 내용 칸에 옮겨 적어 주세요.',
  type: '이 형식은 읽지 못해요. PDF, 워드, PPT, 엑셀, 한글(.hwpx), 텍스트 파일을 올려 주세요.',
  empty: '파일에서 읽을 글자가 없어요.',
  error: '파일을 여는 데 실패했어요. 30MB보다 크거나 손상된 파일일 수 있어요.'
};

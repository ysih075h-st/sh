import type { FileAnalysis, Requirements } from '../domain/types';

/* ---------- sentence splitting ---------- */

/** Joins lines that a PDF or slide broke mid-sentence, drops repeated headers/footers and page numbers. */
export function toSentences(text: string): string[] {
  const clean = String(text || '')
    .replace(/\r/g, '')
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .replace(/[ \t ]+/g, ' ');
  const lines = clean.split('\n').map(l => l.trim());
  const count = new Map<string, number>();
  for (const l of lines) if (l) count.set(l, (count.get(l) || 0) + 1);
  const kept = lines.filter(l => l && (count.get(l) || 0) < 3 && !/^\d+(\s*\/\s*\d+)?$/.test(l) && !/^(출처|source)\s*[:：]/i.test(l));
  let joined = '';
  for (const l of kept) {
    const bullet = /^([•\-–·●○■□▶►*]|\d+[.)]\s|[①-⑳]|[가-하][.)]\s)/.test(l);
    if (!joined) joined = l;
    else if (bullet || /[.!?。:：]$/.test(joined) || /^\[.*\]$/.test(l) || (joined.split('\n').pop() || '').length < 40) joined += '\n' + l;
    else joined += ' ' + l;
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (let s of joined.split(/(?<=[.!?。])\s+|\n+/)) {
    s = s.trim().replace(/^([•\-–·●○■□▶►*]\s*|\d+[.)]\s*|[①-⑳]\s*|[가-하][.)]\s*)+/, '').trim();
    if (s.length < 6 || s.length > 200 || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/* ---------- words ---------- */

const JOSA = /(으로서|으로써|에서는|에게서|으로는|이라는|에서|에게|으로|부터|까지|처럼|보다|이나|이며|이고|에는|에도|과의|와의|이란|라는|은|는|이|가|을|를|의|에|와|과|도|만|로)$/;
const VERBISH = /(하다|한다|했다|된다|되는|하는|하고|하며|하여|해서|했던|있는|없는|있다|없다|합니다|됩니다|입니다|습니다|세요|어요|아요|해요|니다|것이다|으며|이다|인가|한가|할까|된|한|할|함|됨|임|음|기)$/;
const STOP = new Set(('그리고 그러나 하지만 그래서 또한 이것 그것 저것 이번 다음 모든 각각 가장 우리 여러 어떤 무엇 어떻게 정도 경우 때문 대한 대해 통해 위해 따라 같은 관련 경우 이상 이하 내외 이내 정리 부분 내용 사용 활용 진행 해당 기타 ' +
  '과제 제출 작성 수업 학생 교수 강의 주차 페이지 주는 보는 가는 오는 받는 쓰는 맞는 사는 드는 아는 나는 따른 위한 대한 통한 같은 다른 누구 무엇 어디 언제 왜 어느 시간 수준 이후 이전 사람 생각 방법 the and for with that this from are was you your will should must page').split(' '));

const VERB_STEM = /(해야|하는|하다|한다|했다|하기|하여|해서|하고|하며|하면|할지|할까|하는가|한가|되는|된다|되어|돼야|시키는|시켜야)$/;

/** Noun-like words, particles removed. Verb and adjective forms are dropped instead of being mangled;
 *  with stems=true a verb like '보호해야' is kept as its stem '보호' (used to match issues to sentences). */
export function words(s: string, stems = false): string[] {
  const out: string[] = [];
  for (const raw of s.match(/[가-힣]{2,}|[A-Za-z][A-Za-z0-9+#]{1,}/g) || []) {
    if (/[가-힣]/.test(raw)) {
      if (stems && VERB_STEM.test(raw)) { const st = raw.replace(VERB_STEM, ''); if (st.length >= 2 && !STOP.has(st)) out.push(st); continue; }
      if (VERBISH.test(raw) && raw.length <= 6) continue;
      let w = raw;
      if (w.length > 2) w = w.replace(JOSA, '');
      if (w.length < 2 || STOP.has(w)) continue;
      out.push(w);
    } else {
      const w = raw.length <= 5 && raw === raw.toUpperCase() ? raw : raw.toLowerCase();
      if (w.length < 2 || STOP.has(w.toLowerCase())) continue;
      out.push(w);
    }
  }
  return out;
}

/* ---------- requirements ---------- */

const CITATION = /\b(APA|MLA|IEEE)\b(\s*\d+\s*판|\s*\d+(st|nd|rd|th)\s*edition)?|(Chicago|시카고|Harvard|하버드)(\s*\d+\s*판)?|각주|미주/i;
const FORMAT = /(글꼴|폰트)\s*[가-힣A-Za-z ]{0,10}?\d+(\.\d+)?\s*(pt|포인트)|\d+(\.\d+)?\s*(pt|포인트)|줄\s*간격\s*\d+\s*%|double[- ]spaced|single[- ]spaced|1\.5\s*spacing/gi;
const DURATION = /발표\s*(시간)?\s*(은|:)?\s*(\d{1,2})\s*분|(\d{1,2})\s*분\s*(이내|내외)?\s*발표|(\d{1,2})[- ]minute presentation/i;
const FILETYPE = /\b(PDF|HWPX?|DOCX?|PPTX?)\b|한글\s*파일|워드\s*파일/gi;
const AMOUNT = /(A4\s*)?(\d{1,4})\s*(쪽|페이지|매|자|단어|장)(\s*(내외|이상|이내|이하|분량))?/g;
const AMOUNT_EN = /(\d{1,3})\s*(?:-|~|–|to)\s*(\d{1,3})\s*pages?|(\d{1,3})\s*pages?/i;
const JUNK_ITEM = /(면|에|에서|으로|로|고|며|서|도|는|은|이|가|%|\d)$|하면|이면|경우/;
const MUST_LINE = /(필수|반드시|꼭|포함할 것|포함해야|포함하여야|넣을 것|넣어야|must include|required|should include)/i;

function cleanItem(s: string): string {
  return s.replace(/^(필수|필수 항목|반드시|꼭)\s*[:：]?\s*/, '')
    .replace(/\s*(반드시|꼭)\s*/g, ' ')
    .replace(/(을|를)?\s*[가-힣]*(할|을|를|야 할) 것\.?$/, '')
    .replace(/(을|를)?\s*(포함해야 함|포함해야 합니다|포함하세요|넣어야 함|넣으세요|적으세요|포함)\.?$/, '')
    .replace(/^(must include|include|at least)\s+/i, m => (/at least/i.test(m) ? m : ''))
    .replace(/[.。]$/, '').trim();
}

export function extractRequirements(sentences: string[]): { req: Requirements; lines: string[] } {
  const req: Requirements = { fileTypes: [], criteria: [], musts: [] };
  const lines: string[] = [];
  for (const s of sentences) {
    let hit = false;
    if (!req.amount) {
      for (const am of s.matchAll(AMOUNT)) {
        // '장' is a slide count only next to 슬라이드/분량/A4/내외; otherwise it is usually a chapter (교재 5장).
        if (am[3] === '장' && !(/(슬라이드|분량|A4|PPT|ppt)/.test(s) || am[5])) continue;
        if (am[3] === '자' && Number(am[2]) < 100) continue;
        req.amount = `${am[1] ? 'A4 ' : ''}${am[2]}${am[3]}${am[5] ? ' ' + am[5] : ''}`;
        hit = true;
        break;
      }
      const en = !req.amount && s.match(AMOUNT_EN);
      if (en) { req.amount = en[1] ? `${en[1]}~${en[2]}쪽` : `${en[3]}쪽`; hit = true; }
    }
    const fm = s.match(FORMAT);
    if (fm && !req.format && /(글꼴|폰트|간격|spaced|spacing|pt|포인트)/i.test(s)) {
      req.format = [...new Set(fm.map(x => x.replace(/\s+/g, ' ').trim()))].slice(0, 3).join(', ');
      hit = true;
    }
    const du = s.match(DURATION);
    if (du && !req.duration) { req.duration = `${du[3] || du[4] || du[6]}분`; hit = true; }
    const ci = s.match(CITATION);
    if (ci && !req.citation && (/^(APA|MLA|IEEE)/i.test(ci[0]) || /(출처|인용|참고문헌|표기|형식|스타일|citation|reference|style)/i.test(s))) {
      req.citation = ci[0].replace(/\s+/g, ' ').replace(/(\d+)\s*판/, '$1판').replace(/\s*(\d+)(st|nd|rd|th)\s*edition/i, ' $1판').replace(/^(apa|mla|ieee)/i, m => m.toUpperCase());
      hit = true;
    }
    for (const f of s.match(FILETYPE) || []) {
      const v = /한글/.test(f) ? 'HWP' : /워드/.test(f) ? 'DOCX' : f.toUpperCase();
      if (/(제출|파일|형식|업로드)/.test(s) && !req.fileTypes.includes(v)) { req.fileTypes.push(v); hit = true; }
    }
    if (/(평가|배점|채점|비중|점수|grading|grade|weight)/i.test(s) && /%/.test(s)) {
      const re = /([가-힣A-Za-z][가-힣A-Za-z ]{0,14}?)\s*[(:：]?\s*(\d{1,3})\s*%/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const name = m[1].replace(/^(평가\s*기준|평가|배점|채점\s*기준|비중|및|그리고)\s*/, '').trim();
        const pct = Number(m[2]);
        if (name.length >= 2 && name.length <= 12 && pct > 0 && pct <= 100 && !req.criteria.some(c => c.name === name)) { req.criteria.push({ name, pct }); hit = true; }
      }
    }
    if (MUST_LINE.test(s)) {
      const body = s.includes(':') || s.includes('：') ? s.split(/[:：]/).slice(1).join(':') : s;
      const english = !/[가-힣]/.test(body);
      for (const part of body.split(english ? /,|;/ : /,|·|\/|，| 및 /)) {
        const item = cleanItem(part);
        const max = english ? 40 : 18;
        if (item.length >= 2 && item.length <= max && !/[.?!:]/.test(item) && !/(필수|반드시|제출|할 것|평가|배점)/.test(item) && !(!english && JUNK_ITEM.test(item)) && !/%/.test(item) && !req.musts.includes(item)) { req.musts.push(item); hit = true; }
      }
    }
    if (hit) lines.push(s);
  }
  req.criteria.sort((a, b) => b.pct - a.pct);
  req.musts = req.musts.slice(0, 6);
  return { req, lines: lines.slice(0, 6) };
}

export function mergeRequirements(list: Requirements[]): Requirements {
  const out: Requirements = { fileTypes: [], criteria: [], musts: [] };
  for (const r of list) {
    out.amount = out.amount || r.amount;
    out.citation = out.citation || r.citation;
    out.format = out.format || r.format;
    out.duration = out.duration || r.duration;
    r.fileTypes.forEach(f => out.fileTypes.includes(f) || out.fileTypes.push(f));
    r.criteria.forEach(c => out.criteria.some(x => x.name === c.name) || out.criteria.push(c));
    r.musts.forEach(m => out.musts.includes(m) || out.musts.push(m));
  }
  out.criteria.sort((a, b) => b.pct - a.pct);
  return out;
}

/* ---------- key sentences + keywords ---------- */

export function looksLikeProse(s: string): boolean {
  const hangul = (s.match(/[가-힣]/g) || []).length;
  const letters = (s.match(/[가-힣A-Za-z]/g) || []).length;
  const symbols = (s.match(/[|│→←↑↓=<>{}\[\]#*_~^]/g) || []).length;
  return letters >= s.length * 0.5 && symbols <= 2 && (hangul >= 8 || letters >= 25) && s.length >= 15;
}

export function analyzeText(text: string): FileAnalysis {
  const sentences = toSentences(text);
  const toks = sentences.map(s => words(s));
  const freq = new Map<string, number>(), docf = new Map<string, number>();
  toks.forEach(t => {
    t.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
    new Set(t).forEach(w => docf.set(w, (docf.get(w) || 0) + 1));
  });
  const N = Math.max(1, sentences.length);
  const keywords = [...freq.keys()]
    .filter(w => (freq.get(w) || 0) >= 2 && (docf.get(w) || 0) <= N * 0.6 + 1 && !/^\d/.test(w))
    .sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0) || b.length - a.length)
    .slice(0, 8);
  const kw = new Set(keywords);
  const scored = sentences.map((s, i) => {
    const u = new Set(toks[i]);
    let sc = 0;
    u.forEach(w => { sc += Math.log(1 + (freq.get(w) || 0)) + (kw.has(w) ? 1 : 0); });
    sc /= Math.pow(Math.max(4, toks[i].length), 0.6);
    if (!looksLikeProse(s)) sc *= 0.2;
    return { i, s, sc };
  });
  const overlap = (a: string[], b: string[]) => { const A = new Set(a); return b.filter(w => A.has(w)).length / Math.max(1, Math.min(a.length, b.length)); };
  const chosen: typeof scored = [];
  for (const c of [...scored].sort((a, b) => b.sc - a.sc)) {
    if (chosen.length >= 3 || c.sc <= 0) break;
    if (!looksLikeProse(c.s)) continue;
    if (chosen.some(x => overlap(toks[x.i], toks[c.i]) > 0.5)) continue;
    chosen.push(c);
  }
  chosen.sort((a, b) => a.i - b.i);
  const { req, lines } = extractRequirements(sentences);
  return { summary: chosen.map(c => c.s), keywords: keywords.length >= 3 ? keywords : [], sentences: sentences.slice(0, 200), req, reqLines: lines, chars: text.length };
}

import type { Requirements, Task } from '../domain/types';
import { fmtNeed, fmtWhen, MIN } from '../domain/format';
import { josa, particle } from '../domain/josa';
import { needMinutes } from '../domain/urgency';
import { extractRequirements, looksLikeProse, mergeRequirements, toSentences, words } from './text';

export interface Evidence { point: string; source: string; found: boolean }
export interface IssueGuide { issue: string; question: string; angles: string[]; evidence: Evidence[]; counter: string; how: string }
export interface OutlinePart { part: string; amount: string; weight: number; points: string[] }
export interface Guide { summary: string; issues: IssueGuide[]; outline: OutlinePart[]; checklist: string[]; next: string; req: Requirements }
export interface Tip { title: string; body: string }

const quote = (s: string) => `‘${s}’`;
const stripQ = (s: string) => s.trim().replace(/[?？.]+$/, '');

/** Everything the task tells us about its requirements: the pasted brief plus every readable file. */
export function taskRequirements(t: Task): Requirements {
  const list: Requirements[] = [];
  if (t.content) list.push(extractRequirements(toSentences(t.content)).req);
  for (const f of t.files || []) if (f.auto) list.push(f.auto.req);
  return mergeRequirements(list);
}

/* ---------- issue frames ---------- */

type Frame = Pick<IssueGuide, 'question' | 'angles' | 'counter' | 'how'>;

export function frameFor(issueRaw: string, type: Task['type'] = '보고서'): Frame {
  const is = stripQ(issueRaw);
  const q = quote(is);
  if (type === '문제풀이') return {
    question: `${q}에서 꼭 알아야 할 정의와 공식은 무엇인가요?`,
    angles: ['정의와 공식을 한 줄로 적어 두세요.', '교재 예제 하나를 직접 풀며 단계별로 확인하세요.', '자주 틀리는 부분(단위, 부호, 분모)을 따로 적어 두세요.'],
    counter: '답만 쓰면 감점될 수 있어요. 사용한 공식과 풀이 과정을 함께 적으세요.',
    how: '공식 → 대입 → 계산 → 답의 단위 확인 순서로 쓰세요.'
  };
  if (/(상관|관계|영향|효과|요인)/.test(is) && !/(문제|해결|방안)/.test(is)) return {
    question: `${q}에서 무엇이 원인이고 무엇이 결과인지, 그 관계를 자료로 보여 줄 수 있나요?`,
    angles: ['원인과 결과를 각각 한 문장으로 먼저 정의하세요.', '함께 움직인다는 것(상관)과 그것 때문이라는 것(인과)을 구분해서 쓰세요.', '결과에 영향을 줄 수 있는 다른 요인을 하나 이상 짚어 주세요.'],
    counter: '우연이거나 다른 요인 때문일 수 있다는 반론이 나올 수 있어요. 자료의 한계를 먼저 밝혀 두면 방어가 돼요.',
    how: '현상 → 관계를 보여 주는 표나 수치 → 해석 → 한계 순서로 한 단락씩 쓰세요.'
  };
  if (/(비교|차이|대비|\bvs\b)/i.test(is)) return {
    question: `${q}에서 무엇을 기준으로 비교하고, 그 차이는 왜 생기나요?`,
    angles: ['비교 기준을 2~3개 정하고 표로 먼저 정리하세요.', '공통점보다 차이점과 그 원인에 분량을 더 쓰세요.', '어느 쪽이 낫다고 말하려면 판단 기준을 먼저 밝히세요.'],
    counter: '비교 기준이 한쪽에 유리하다는 지적이 나올 수 있어요. 그 기준을 고른 이유를 한 문장 덧붙이세요.',
    how: '비교표 → 기준별 해석 → 종합 판단 순서로 쓰면 읽기 쉬워요.'
  };
  if (/(문제|한계|위기|해결|개선|방안|대책)/.test(is)) return {
    question: `${q}의 실제 모습은 어떻고, 원인과 현실적인 해결책은 무엇인가요?`,
    angles: ['문제를 사례나 수치로 먼저 보여 주세요.', '원인을 구조적인 요인과 개인·조직 요인으로 나눠 보세요.', '대안은 1~2개만 고르고, 누가 어떻게 실행할지까지 쓰세요.'],
    counter: '대안이 비현실적이라는 반론이 나올 수 있어요. 비용과 실행 가능성을 한 줄이라도 다뤄 주세요.',
    how: '문제 제기 → 원인 분석 → 대안 → 대안의 한계 순서로 쓰세요.'
  };
  if (/(이유|까닭|필요성|중요성|왜\s)/.test(is)) return {
    question: `${q}${particle(is, '을/를')} 근거 2~3개로 설명할 수 있나요?`,
    angles: ['이유를 2~3개로 나누고, 이유마다 근거나 사례를 하나씩 붙이세요.', '그렇게 하지 않았을 때 생기는 문제를 함께 보여 주면 설득력이 커져요.', '가장 중요한 이유를 먼저 쓰세요.'],
    counter: '꼭 그래야 하느냐는 반론에는 예외가 되는 경우와 그때의 대안을 함께 밝혀 두세요.',
    how: '주장 → 이유와 근거 → 하지 않았을 때의 문제 → 정리 순서로 쓰세요.'
  };
  if (/(절차|과정|방법|단계|순서|전략|프로세스)/.test(is)) return {
    question: `${q}${particle(is, '은/는')} 어떤 단계로 이루어지고, 단계마다 무엇이 중요한가요?`,
    angles: ['단계를 순서대로 나열하고 단계마다 한 문장으로 설명하세요.', '단계마다 나오는 결과물이나 판단 기준을 함께 적으세요.', '실제로 해 보며 겪은 어려움이나 주의할 점을 덧붙이세요.'],
    counter: '왜 그 순서여야 하는지 묻는 반론에 대비해, 순서를 바꾸면 생기는 문제를 한 줄 적어 두세요.',
    how: '전체 단계 요약 → 단계별 설명 → 주의할 점 → 정리 순서로 쓰세요.'
  };
  if (/[?？]\s*$/.test(issueRaw) || /(는가|은가|한가|할까|인가|일까|충분|타당|옳은|필요한|해야)/.test(is)) return {
    question: `${q}에 대한 내 답은 무엇이고, 그 답을 받칠 가장 강한 근거는 무엇인가요?`,
    angles: ['그렇다는 쪽과 아니라는 쪽의 답을 각각 한 문장으로 정리해 보세요.', '내 답을 정하고, 그 답을 받쳐 줄 근거 2개를 고르세요.', '무엇을 기준으로 판단했는지(수치, 이론, 사례) 분명히 밝히세요.'],
    counter: '반대쪽 답의 가장 강한 근거를 먼저 인정한 뒤 재반박하면 설득력이 커져요.',
    how: '내 답 → 근거 1 → 근거 2 → 반대 의견과 재반박 → 소결 순서로 쓰세요.'
  };
  return {
    question: `${q}${particle(is, '을/를')} 어떻게 정의하고, 이 과제에서 왜 중요한가요?`,
    angles: ['핵심 개념을 정의하고 다룰 범위를 좁히세요.', '구체적인 사례 1~2개로 설명하세요.', '분석 결과가 과제 주제에 주는 의미로 마무리하세요.'],
    counter: '정의가 모호하다는 지적을 피하려면 어떤 정의를 쓰는지 출처와 함께 밝히세요.',
    how: '정의 → 사례 → 분석 → 시사점 순서로 쓰세요.'
  };
}

/** Sentences in the uploaded sources that really talk about the issue. Nothing weak is shown,
 *  and the assignment instructions themselves never count as evidence. */
export function findEvidence(t: Task, issue: string, max = 2): Evidence[] {
  const keys = [...new Set(words(issue, true))];
  if (!keys.length) return [];
  const need = keys.length >= 3 ? 2 : 1;
  const pool: { s: string; src: string }[] = [];
  // A file that reads like an assignment brief feeds the requirements, not the evidence.
  for (const f of t.files || []) if (f.auto && f.auto.reqLines.length < 2) for (const s of f.auto.sentences) pool.push({ s, src: f.ocr ? `${f.name} · 사진에서 읽음, 원본과 대조해 쓰세요` : f.name });
  const stem = (k: string) => (k.length >= 3 ? k.slice(0, k.length - 1) : k);
  const has = (s: string, k: string) => s.toLowerCase().includes(stem(k).toLowerCase());
  // A key that shows up in only a few sentences is specific enough to count on its own.
  const rare = new Set(keys.filter(k => pool.filter(p => has(p.s, k)).length <= 3));
  const hits = pool
    .filter(p => p.s.length <= 160 && looksLikeProse(p.s) && !/[?？]$/.test(p.s) && !/(할 것|하시오|하세요|하십시오|바랍니다|주세요|해야 함)\s*[.!]?$/.test(p.s) && /([다요음함됨임]|니다)\s*[.!]?["”’)]*$|[.!]["”’)]*$/.test(p.s))
    .map(p => { const m = keys.filter(k => has(p.s, k)); return { ...p, n: m.length, rareHit: m.some(k => rare.has(k)), num: /\d/.test(p.s) ? 1 : 0 }; })
    .filter(p => p.n >= need || (p.n >= 1 && p.rareHit && keys.length <= 3))
    .sort((a, b) => b.n - a.n || Number(a.s.includes('▢')) - Number(b.s.includes('▢')) || b.num - a.num || a.s.length - b.s.length);
  const out: Evidence[] = [];
  for (const h of hits) {
    if (out.length >= max) break;
    if (out.some(o => o.point.includes(h.s))) continue;
    out.push({ point: `“${h.s.replace(/^[“”"']+|[“”"']+$/g, '')}”`, source: h.src, found: true });
  }
  return out;
}

/* ---------- outline ---------- */

function outlineFor(t: Task, issues: IssueGuide[], keywords: string[]): OutlinePart[] {
  const n = Math.max(1, issues.length);
  const preview = issues.length ? `다룰 쟁점 ${issues.length}개 예고` : '다룰 소주제 예고';
  const pts = (g: IssueGuide) => [`다룰 쟁점: ${quote(stripQ(g.issue))}`, g.how];
  const bodyParts = (label: (i: number) => string, amount: (i: number) => string, weight: (i: number) => number, single: string[]): OutlinePart[] =>
    issues.length ? issues.map((g, i) => ({ part: label(i), amount: amount(i), weight: weight(i), points: pts(g) })) : [{ part: label(0).replace(/ \d+$/, ''), amount: amount(0), weight: weight(0), points: single }];
  const generic = keywords.length >= 3 ? [`자료에 자주 나오는 ${keywords.slice(0, 3).map(quote).join(', ')}${particle(keywords[2], '을/를')} 중심으로 소주제 2~3개를 나누세요.`] : ['다룰 소주제를 2~3개로 나누고, 소주제마다 근거를 하나씩 붙이세요.'];

  if (t.type === 'PPT') {
    const slides = t.amount > 0 && t.unit === '장' ? t.amount : 0;
    const core = slides ? Math.max(n, slides - 3) : 0;
    const per = (i: number) => (slides ? Math.floor(core / n) + (i < core % n ? 1 : 0) : 0);
    return [
      { part: '도입', amount: slides ? '2장' : '15%', weight: slides ? 2 : 15, points: ['표지와 발표 목적 한 문장', issues.length ? `목차: 쟁점 ${issues.length}개를 질문 형태로` : '목차: 다룰 내용 2~3개'] },
      ...bodyParts(i => `본문 ${i + 1}`, i => (slides ? `${per(i)}장` : `${Math.round(70 / n)}%`), i => (slides ? per(i) : 70 / n), generic),
      { part: '마무리', amount: slides ? '1장' : '15%', weight: slides ? 1 : 15, points: ['쟁점별 결론을 한 장에 요약', '예상 질문 1~2개와 답 준비'] }
    ];
  }
  if (t.type === '문제풀이') {
    const need = needMinutes(t);
    const a = (r: number) => (need ? fmtNeed(need * r) : `${Math.round(r * 100)}%`);
    return [
      { part: '개념 정리', amount: a(0.15), weight: 15, points: issues.length ? issues.slice(0, 3).map(g => `${quote(stripQ(g.issue))} 정의와 공식을 한 줄로 정리`) : ['문제에 나오는 개념과 공식을 먼저 목록으로 적기'] },
      { part: '풀이', amount: a(0.7), weight: 70, points: ['쉬운 문제부터 풀고, 5분 넘게 막히면 표시하고 넘어가기', '풀이 과정을 단계별로 남기기'] },
      { part: '검토', amount: a(0.15), weight: 15, points: ['표시한 문제 다시 풀기', '단위·부호·계산 실수 확인'] }
    ];
  }
  const pages = t.amount > 0 && (t.unit === '쪽' || t.unit === '장') ? t.amount : 0;
  if (pages >= 4) {
    const edge = Math.max(1, Math.round(pages * 0.1));
    const body = pages - edge * 2;
    const per = (i: number) => Math.floor(body / n) + (i < body % n ? 1 : 0);
    return [
      { part: '서론', amount: `${edge}${t.unit}`, weight: edge, points: ['과제의 배경과 문제 제기', preview] },
      ...bodyParts(i => `본론 ${i + 1}`, i => `${per(i)}${t.unit}`, per, generic),
      { part: '결론', amount: `${edge}${t.unit}`, weight: edge, points: ['쟁점별 결론을 한 문장씩 정리', '한계와 앞으로의 과제'] }
    ];
  }
  return [
    { part: '서론', amount: '10%', weight: 10, points: ['과제의 배경과 문제 제기', preview] },
    ...bodyParts(i => `본론 ${i + 1}`, () => `${Math.round(80 / n)}%`, () => 80 / n, generic),
    { part: '결론', amount: '10%', weight: 10, points: ['쟁점별 결론을 한 문장씩 정리', '한계와 앞으로의 과제'] }
  ];
}

/* ---------- summary + checklist ---------- */

const TYPE_WORD: Record<string, string> = { '보고서': '보고서', 'PPT': '발표 자료', '문제풀이': '문제풀이 과제', '기타': '과제' };

export function summaryFor(t: Task, req: Requirements): string {
  const parts: string[] = [];
  const amount = req.amount || (t.amount > 0 ? `${t.amount}${t.unit}` : '');
  const what = TYPE_WORD[t.type] || '과제';
  parts.push(amount ? `${amount} 분량의 ${josa(what, '이에요/예요')}.` : `${josa(what, '이에요/예요')}.`);
  if (req.musts.length) { const m = req.musts.slice(0, 4); parts.push(`꼭 넣어야 할 것은 ${m.join(', ')}${particle(m[m.length - 1], '이에요/예요')}.`); }
  if (req.duration) parts.push(`발표 시간은 ${req.duration}이에요.`);
  if (req.format) parts.push(`서식은 ${req.format}에 맞춰요.`);
  if (req.citation) parts.push(`출처는 ${req.citation} 형식으로 달아요.`);
  if (req.criteria.length >= 2) parts.push(`평가에서는 ${req.criteria[0].name}(${req.criteria[0].pct}%) 비중이 가장 커요.`);
  else if (req.criteria.length === 1) parts.push(`평가 기준은 ${req.criteria[0].name}(${req.criteria[0].pct}%)예요.`);
  if (req.fileTypes.length) parts.push(`제출 파일은 ${req.fileTypes.join(' 또는 ')} 형식이에요.`);
  if (parts.length === 1) {
    const hint = '과제 안내문을 붙여 넣거나 파일로 올리면 분량·출처·평가 기준을 찾아 정리해요.';
    return amount ? `${parts[0]} ${hint}` : `아직 분량이나 요구사항 정보가 없어요. ${hint}`;
  }
  return parts.join(' ');
}

export function checklistFor(t: Task, req: Requirements): string[] {
  const out: string[] = [];
  const amount = req.amount || (t.amount > 0 ? `${t.amount}${t.unit}` : '');
  if (amount) out.push(`분량 ${amount}에 맞췄나요?`);
  for (const m of req.musts.slice(0, 4)) out.push(`${quote(m)}${particle(m, '을/를')} 넣었나요?`);
  for (const c of req.criteria.slice(0, 3)) out.push(`평가 항목 ${quote(c.name)}(${c.pct}%)에 해당하는 부분이 분명히 드러나나요?`);
  if (req.format) out.push(`서식(${req.format})을 맞췄나요?`);
  if (req.duration) out.push(`발표를 ${req.duration} 안에 마치도록 리허설했나요?`);
  if (t.type === '문제풀이') {
    if (!req.musts.some(m => m.includes('풀이'))) out.push('답마다 풀이 과정과 사용한 공식을 적었나요?');
    if (req.citation) out.push(`인용마다 ${req.citation} 형식으로 출처를 달았나요?`);
  } else {
    out.push(req.citation ? `인용마다 ${req.citation} 형식으로 출처를 달았나요?` : '인용한 자료마다 같은 형식으로 출처를 달았나요?');
    if ((t.issues || []).length) out.push('쟁점마다 근거와 예상 반론을 다뤘나요?');
  }
  if (req.fileTypes.length) out.push(`${req.fileTypes.join(' 또는 ')} 파일로 저장했나요?`);
  out.push(t.type === 'PPT' ? '슬라이드마다 전하는 메시지가 하나인가요?' : '제목, 이름(학번), 쪽 번호를 넣었나요?');
  out.push('제출 전에 파일을 다시 열어 깨진 곳이 없는지 확인했나요?');
  return [...new Set(out)].slice(0, 9);
}

/* ---------- the guide ---------- */

export function buildGuide(t: Task): Guide {
  const req = taskRequirements(t);
  const keywords: string[] = [];
  for (const f of t.files || []) for (const k of f.auto?.keywords || []) if (!keywords.includes(k)) keywords.push(k);
  const issues: IssueGuide[] = (t.issues || []).slice(0, 4).map(is => {
    const ev = findEvidence(t, is);
    if (t.type === '문제풀이') return { issue: is, ...frameFor(is, t.type), evidence: ev };
    const none = (t.files || []).some(f => f.auto && f.auto.reqLines.length < 2)
      ? '올린 자료에서 이 쟁점을 직접 다룬 문장을 찾지 못했어요. 이 쟁점을 다룬 통계·논문·기사를 하나 더 찾아 올려 주세요.'
      : '아직 올린 참고 자료가 없어요. 이 쟁점을 다룬 자료를 올리면 근거로 쓸 문장을 찾아 드려요.';
    return { issue: is, ...frameFor(is, t.type), evidence: ev.length ? ev : [{ point: none, source: '찾아야 할 자료', found: false }] };
  });
  const hasFiles = (t.files || []).some(f => f.auto && f.auto.reqLines.length < 2);
  const next = t.type === '문제풀이'
    ? (issues.length ? `개념 정리부터 시작하세요. ${quote(stripQ(issues[0].issue))}의 정의와 공식을 한 줄로 적어 두면 풀이가 빨라져요.` : '헷갈리는 개념을 쟁점 칸에 적어 두면 개념별 정리 방법이 나와요.')
    : !issues.length
    ? '과제에서 답해야 할 질문을 2~3개 골라 쟁점으로 추가하세요. 쟁점별로 쓰는 법과 근거 후보가 나와요.'
    : !hasFiles && !t.content && !(t.files || []).some(f => f.auto)
      ?'과제 안내문을 붙여 넣거나 참고 자료를 올리세요. 요구사항과 근거 후보를 찾아 드려요.'
      : !hasFiles
        ? '쟁점마다 참고 자료(기사·논문·통계)를 하나씩 찾아 올리세요. 근거로 쓸 문장을 찾아 드려요.'
      : issues.some(i => !i.evidence[0].found)
        ? '근거를 찾지 못한 쟁점부터 자료를 하나씩 더 찾아 올리세요.'
        : '구성안대로 소제목을 먼저 적고, 쟁점 1의 근거 문장을 붙여 넣는 것부터 시작하세요.';
  return { summary: summaryFor(t, req), issues, outline: outlineFor(t, issues, keywords), checklist: checklistFor(t, req), next, req };
}

/** Short, time-aware tips that do not repeat the guide. */
export function buildTips(t: Task, now = Date.now()): Tip[] {
  const tips: Tip[] = [];
  const need = needMinutes(t);
  if (need) {
    const left = t.due - now;
    if (left > 0 && left < need * MIN) {
      tips.push({ title: '시간이 모자라요', body: `남은 시간이 예상 소요 시간보다 ${fmtNeed((need * MIN - left) / MIN)} 짧아요. 줄일 수 있는 부분(사례 수, 부록 등)을 먼저 정하고 바로 시작하세요.` });
    } else if (left > 0) {
      // Plan over a sensible lead time (at least two days or three times the work), not the last possible hours.
      const start = Math.max(now, t.due - Math.max(48 * 60 * MIN, need * MIN * 3)), span = t.due - start;
      const at = (ms: number) => { const d = new Date(ms); d.setMinutes(0, 0, 0); if (d.getHours() < 9) { d.setDate(d.getDate() - 1); d.setHours(23); } return Math.max(now, d.getTime()); };
      const [a, b] = t.type === 'PPT' ? ['스토리라인', '슬라이드 제작'] : t.type === '문제풀이' ? ['개념 정리', '전체 풀이'] : ['자료 정리', '초안'];
      const [p1, p2] = t.type === '문제풀이' ? [0.15, 0.85] : [0.3, 0.8];
      tips.push({ title: '일정 나누기', body: `${a}${particle(a, '은/는')} ${fmtWhen(at(start + span * p1))}까지, ${b}${particle(b, '은/는')} ${fmtWhen(at(start + span * p2))}까지 끝내고 남은 시간은 검토에 쓰세요.` });
    }
  } else {
    tips.push({ title: '분량을 넣어 보세요', body: '분량과 단위당 시간을 입력하면 예상 소요 시간과 시작 마지노선을 계산해요.' });
  }
  if (t.type === 'PPT') tips.push({ title: '한 장에 메시지 하나', body: '슬라이드 제목을 결론 문장으로 쓰고, 본문 글은 3줄 이내로 줄이세요. 나머지는 발표 대본으로 옮기세요.' });
  if (t.type === '문제풀이') tips.push({ title: '푸는 순서', body: '전체를 훑어본 뒤 쉬운 문제부터 푸세요. 5분 넘게 막히면 표시만 하고 넘어가세요.' });
  if (t.type === '보고서' && (t.issues || []).length) tips.push({ title: '소제목에 쟁점을 쓰세요', body: '본론 소제목을 쟁점 문장 그대로 쓰면 채점하는 사람이 어디서 무엇을 다뤘는지 바로 찾을 수 있어요.' });
  const unread = (t.files || []).filter(f => f.kind === 'other');
  if (unread.length) tips.push({ title: `읽지 못한 자료 ${unread.length}개`, body: '파일 아래 안내대로 고쳐서 다시 올려 주세요. 그래도 안 되면 필요한 부분만 과제 내용 칸에 붙여 넣어도 돼요.' });
  if (!t.content && !(t.files || []).some(f => f.auto)) tips.push({ title: '안내문을 올려 주세요', body: '교수님 안내문이나 강의계획서의 과제 부분을 붙여 넣으면 분량·출처·평가 기준을 자동으로 찾아요.' });
  return tips;
}

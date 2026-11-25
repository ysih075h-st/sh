import { describe, expect, it } from 'vitest';
import { josa } from '../src/domain/josa';
import { analyzeText, extractRequirements, toSentences, words } from '../src/analysis/text';
import { buildGuide, buildTips } from '../src/analysis/guide';
import { CASES, NOW } from './fixtures';

describe('josa', () => {
  it('picks the particle from the final syllable', () => {
    expect(josa('보고서', '을/를')).toBe('보고서를');
    expect(josa('한계점', '을/를')).toBe('한계점을');
    expect(josa('발표 자료', '이에요/예요')).toBe('발표 자료예요');
    expect(josa('파일', '으로/로')).toBe('파일로');
    expect(josa('결과표', '은/는')).toBe('결과표는');
  });
});

describe('requirements', () => {
  const req = (t: string) => extractRequirements(toSentences(t)).req;
  it('reads amount, citation, criteria and musts from a numbered brief', () => {
    const r = req('1. 분량: A4 12쪽 내외\n2. 필수: 회귀분석 결과표, 가설 검정 해석, 한계점\n3. 출처 표기: APA 7판\n4. 평가: 분석 타당성 40%, 해석 30%');
    expect(r.amount).toBe('A4 12쪽 내외');
    expect(r.citation).toBe('APA 7판');
    expect(r.musts).toEqual(['회귀분석 결과표', '가설 검정 해석', '한계점']);
    expect(r.criteria[0]).toEqual({ name: '분석 타당성', pct: 40 });
  });
  it('does not read a textbook chapter as a page count', () => {
    expect(req('교재 5장 연습문제 1~20번을 풀 것.').amount).toBeUndefined();
  });
  it('keeps grading lines out of the must-include list', () => {
    const r = req('반드시 설문 또는 2차 자료를 포함할 것\n질의응답 5분\n평가 기준 - 내용 50%, 전달력 30%');
    expect(r.musts).toEqual(['설문 또는 2차 자료']);
    expect(r.criteria.map(c => c.name)).toEqual(['내용', '전달력']);
  });
  it('drops conditional fragments', () => {
    expect(req('표본이 부족하면 한계점에 반드시 적을 것.').musts).toEqual([]);
  });
  it('reads English briefs', () => {
    const r = req('Final Paper: 8-10 pages, double-spaced, APA 7th edition. Grading: Argument 40%, Evidence 35%.');
    expect(r.amount).toBe('8~10쪽');
    expect(r.citation).toBe('APA 7판');
    expect(r.format).toBe('double-spaced');
  });
});

describe('words', () => {
  it('strips particles and skips verb forms', () => {
    expect(words('배달앱 이용률에 영향을 주는 요인')).toEqual(['배달앱', '이용률', '영향', '요인']);
    expect(words('자율주행차는 누구를 보호해야 하는가', true)).toEqual(['자율주행차', '보호']);
  });
});

describe('guide output reads cleanly for every test assignment', () => {
  for (const { label, task } of CASES) {
    it(label, () => {
      const g = buildGuide(task);
      const all = [g.summary, g.next, ...g.checklist, ...g.issues.flatMap(i => [i.question, ...i.angles, ...i.evidence.map(e => e.point), i.counter, i.how]),
        ...g.outline.flatMap(o => [o.part, o.amount, ...o.points]), ...buildTips(task, NOW).flatMap(t => [t.title, t.body])];
      for (const s of all) {
        expect(s, s).not.toMatch(/undefined|NaN|null|\[object|\(를\)|\(는\)|\(가\)|‘’|“”|\s{2,}|\.\./);
        expect(s.trim(), 'empty line').not.toBe('');
      }
      expect(g.checklist.length).toBeLessThanOrEqual(9);
      // the assignment instructions never show up as "evidence"
      for (const i of g.issues) for (const e of i.evidence) expect(e.source).not.toBe('과제 내용');
    });
  }
});

describe('analyzeText', () => {
  it('finds topic keywords and prose key sentences', () => {
    const a = analyzeText(CASES[6].task.files![0].auto ? '최저임금 인상이 고용에 미치는 영향은 업종에 따라 다르다. 최저임금 인상으로 소상공인 부담이 커졌다. 정부는 소상공인 지원책을 검토한다. 고용 감소는 숙박업에서 나타났다.' : '');
    expect(a.keywords).toContain('최저임금');
    expect(a.summary.length).toBeGreaterThan(0);
  });
});

describe('statistics are not grading criteria', () => {
  it('ignores percentages outside a grading sentence', () => {
    const r = extractRequirements(toSentences('소득 상위 구간의 주 3회 이상 이용 비율은 41%로 하위 구간의 23%보다 높았다.')).req;
    expect(r.criteria).toEqual([]);
  });
});

describe('evidence quality', () => {
  it('never uses slide headings or checklist questions as evidence', () => {
    const t = CASES.find(c => c.label.startsWith('이유·절차형'))!.task;
    const g = buildGuide(t);
    const points = g.issues.flatMap(i => i.evidence.map(e => e.point)).join(' ');
    expect(points).not.toContain('절차 6');
    expect(points).not.toContain('3개 이상인가');
    expect(points).toContain('제외 범위를 정해 두면');
  });
});

describe('sample data', () => {
  it('finds evidence in the sample article, not in the brief', async () => {
    const { sampleTasks } = await import('../src/samples');
    const t = sampleTasks(1)[0];
    const g = buildGuide(t);
    const ev = g.issues.flatMap(i => i.evidence);
    expect(ev.every(e => !e.found || e.source === '배달앱 이용 실태 기사.txt')).toBe(true);
    expect(ev.some(e => e.found && e.point.includes('표본 312명'))).toBe(true);
    expect(ev.some(e => e.found && e.point.includes('소득이 높을수록'))).toBe(true);
    expect(g.summary).toContain('APA 7판');
  });
});

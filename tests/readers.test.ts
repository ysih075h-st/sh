import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { readSource, UNREADABLE_MESSAGE } from '../src/analysis/readers';
import { acceptReread, fixOcr, joinParagraph, lineText, suspicious, UNSURE } from '../src/analysis/ocr';
import { analyzeText } from '../src/analysis/text';

const file = (path: string, name = path.split('/').pop()!) => new File([readFileSync(path)], name);

describe('legacy Office files', () => {
  test('.doc keeps paragraphs and table cells', async () => {
    const r = await readSource(file('tests/files/notice.doc'));
    expect(r.kind).toBe('text');
    expect(r.auto!.req.amount).toBe('A4 8쪽 이상');
    expect(r.auto!.req.citation).toBe('APA');
    expect(r.auto!.sentences).toContain('구독 서비스가 충동구매를 늘린다는 연구 결과가 최근 여러 차례 보고되었다.');
  });
  test('.ppt reads slide text and text boxes but not master placeholders', async () => {
    const r = await readSource(file('tests/files/deck.ppt'));
    const all = r.auto!.sentences.join('\n');
    expect(all).toContain('국내 구독 서비스 시장은 2020년 이후 매년 20% 넘게 성장했다.');
    expect(all).toContain('정기 결제는 소비자가 지출을 덜 의식하게 만든다는 지적이 있다.');
    expect(all).not.toMatch(/마스터|Click to edit|^\*$/m);
  });
});

// .hwp samples come from the test fixtures of pyhwp (github.com/mete0r/pyhwp) and hwp.js
// (github.com/hahnlee/hwp.js). Copy sample-5017.hwp, viewtext.hwp, password-12345.hwp and
// basicsReport.hwp into tests/files/third-party/ to run these.
const hwp = (n: string) => `tests/files/third-party/${n}`;
describe.skipIf(!existsSync(hwp('sample-5017.hwp')))('한글 .hwp', () => {
  test('body, tables, footnotes and the 한/글 logo character', async () => {
    const r = await readSource(file(hwp('sample-5017.hwp')));
    const all = r.auto!.sentences.join('\n');
    expect(all).toContain('본 문서는 한글 워드 프로세서의 파일 저장 형식 중');
    expect(all).not.toMatch(/[-]/);
  });
  test('배포용 문서 is decrypted', async () => {
    const r = await readSource(file(hwp('viewtext.hwp')));
    expect(r.kind).toBe('text');
    expect(r.auto!.sentences.join('')).toContain('배포 문서 예제입니다');
  });
  test('password-protected file explains what to do', async () => {
    const r = await readSource(file(hwp('password-12345.hwp')));
    expect(r).toMatchObject({ kind: 'other', why: 'password' });
    expect(UNREADABLE_MESSAGE.password).toContain('암호');
  });
  test('a real report template', async () => {
    const r = await readSource(file(hwp('basicsReport.hwp')));
    expect(r.kind).toBe('text');
    expect(r.auto!.chars).toBeGreaterThan(1000);
  });
});

describe('character recognition clean-up', () => {
  const words = (s: string, low: string[] = []) => s.split(' ').map(text => ({ text, confidence: low.includes(text) ? 20 : 92 }));
  test('unsure words become one mark, sure text is kept', () => {
    const l = { text: '최근 조사에 따르면 20대의 HEY 이용률은 높게 나타났다.', confidence: 88, words: words('최근 조사에 따르면 20대의 HEY 이용률은 높게 나타났다.', ['HEY']) };
    expect(lineText(l)).toBe(`최근 조사에 따르면 20대의 ${UNSURE} 이용률은 높게 나타났다.`);
    const l2 = { text: '6. 제출: LMSO| PDF2 제출', confidence: 70, words: words('6. 제출: LMSO| PDF2 제출', ['LMSO|', 'PDF2']) };
    expect(lineText(l2)).toBe(`6. 제출: ${UNSURE} 제출`);
  });
  test('a line the recognizer doubts as a whole is marked', () => {
    const l = { text: '소득 수준과 이용 빈도 사이의 관계', confidence: 40, words: words('소득 수준과 이용 빈도 사이의 관계') };
    expect(lineText(l).startsWith(UNSURE)).toBe(true);
  });
  test('common misreads in notices are fixed, others left alone', () => {
    expect(fixOcr('2. 분량: &4 10쪽 내외')).toBe('2. 분량: A4 10쪽 내외');
    expect(fixOcr('분량: 64 용지 5매')).toBe('분량: A4 용지 5매');
    expect(fixOcr('분석 타당성 40%, 해석 3096, 형식 10%')).toBe('분석 타당성 40%, 해석 30%, 형식 10%');
    expect(fixOcr('표본 3096명을 조사했다')).toBe('표본 3096명을 조사했다');
    expect(fixOcr('2023년 64개 기관')).toBe('2023년 64개 기관');
    expect(fixOcr('분석 타당성 40%, 해석 3096, 구성 209, 형식 10%')).toBe('분석 타당성 40%, 해석 30%, 구성 20%, 형식 10%');
    expect(fixOcr('응답자 209명 중 40%가')).toBe('응답자 209명 중 40%가');
    expect(fixOcr('주제: 배달앰 이용률')).toBe('주제: 배달앱 이용률');
    expect(fixOcr('모바일앰을 쓰는 비율')).toBe('모바일앱을 쓰는 비율');
    expect(fixOcr('앰프와 앰뷸런스')).toBe('앰프와 앰뷸런스');
  });
  test('marked items never become requirements; sentences with two marks or a doubtful line are left out', () => {
    const text = [`평가 기준: 분석 40%, 해석 ${UNSURE}, 형식 10%`, '분량: A4 10쪽 내외', `필수 포함: 회귀분석 결과표, ${UNSURE}, 한계점`,
      `최근 조사에 따르면 20대의 ${UNSURE} 이용률은 다른 연령대보다 높게 나타났다.`,
      `연구진은 ${UNSURE} 근무 시간과 ${UNSURE} 형태가 이용률을 더 잘 설명한다고 분석했다.`,
      `${UNSURE} 다만 이번 조사는 수도권 거주자만 대상으로 해 지역 간 차이를 반영하지 못했다.`,
      '소득 수준과 이용 빈도 사이에는 약한 양의 상관관계가 확인되었다.'].join('\n');
    const a = analyzeText(text, UNSURE);
    expect(a.req.amount).toBe('A4 10쪽 내외');
    expect(a.req.criteria.map(c => c.name)).toEqual(['분석', '형식']);
    expect(a.req.musts).toEqual(['회귀분석 결과표', '한계점']);
    expect(a.sentences).toContain(`최근 조사에 따르면 20대의 ${UNSURE} 이용률은 다른 연령대보다 높게 나타났다.`);
    expect(a.sentences.some(s => s.startsWith('연구진은') || s.includes('수도권'))).toBe(false);
  });
  test('Latin-looking words in Korean lines are re-read; real acronyms are kept', () => {
    const line = (text: string) => ({ text, confidence: 90, words: [] });
    const l = line('6. 제출: 12월 15일(화) 23:59까지 LMS에 PDF로 제출');
    expect(suspicious({ text: 'HIE', confidence: 69 }, l)).toBe(true);
    expect(suspicious({ text: 'WEE', confidence: 68 }, l)).toBe(true);
    expect(suspicious({ text: 'LMS에', confidence: 80 }, l)).toBe(false);
    expect(suspicious({ text: 'APA', confidence: 60 }, l)).toBe(false);
    expect(suspicious({ text: 'LMSO|', confidence: 21 }, l)).toBe(true);
    expect(suspicious({ text: 'Excel', confidence: 90 }, line('Excel'))).toBe(false);
    expect(acceptReread('제출', 96)).toBe('제출');
    expect(acceptReread('빈 도 는', 89)).toBe('빈도는');
    expect(acceptReread('배달앰', 62)).toBe(UNSURE);
    expect(acceptReread('ㄴ15에', 51)).toBe(UNSURE);
    expect(acceptReread('PoF 로', 90)).toBe(UNSURE);
  });
});

describe('recognized notices keep their lines apart', () => {
  test('numbered items without a space are separate lines', () => {
    expect(fixOcr('6.제출: 12월 15일까지')).toBe('6. 제출: 12월 15일까지');
    const a = analyzeText(['5. 평가 기준: 분석 타당성 40%, 해석 30%, 구성 20%, 형식 10%', '6.제출: 12월 15일(화) 23:59까지 제출', '최근 조사에 따르면 20대의 배달앱 이용률은 다른 연령대보다 높게 나타났다.'].join('\n'), UNSURE);
    expect(a.sentences).toContain('최근 조사에 따르면 20대의 배달앱 이용률은 다른 연령대보다 높게 나타났다.');
  });
  test('a misread English-looking word never becomes a required item', () => {
    const a = analyzeText('필수 포함: 회귀분석 결과표, HIE, 한계점', UNSURE);
    expect(a.req.musts).toEqual(['회귀분석 결과표', '한계점']);
  });
});

test('wrapped lines of a recognized paragraph become one sentence; list items stay apart', () => {
  expect(joinParagraph(['월 소득이 높을수록 이용 빈도가 다소 늘어나는 경향은 있었지만,', '그 차이는 통계적으로 크지 않았다.', '연구진은 소득보다 근무 시간과 가구 형태가', '더 잘 설명한다고 분석했다.']))
    .toBe('월 소득이 높을수록 이용 빈도가 다소 늘어나는 경향은 있었지만, 그 차이는 통계적으로 크지 않았다.\n연구진은 소득보다 근무 시간과 가구 형태가 더 잘 설명한다고 분석했다.');
  expect(joinParagraph(['1. 주제: 배달앱 이용률', '2. 분량: A4 10쪽 내외', '3. 출처 표기: APA 7판 형식'])).toBe('1. 주제: 배달앱 이용률\n2. 분량: A4 10쪽 내외\n3. 출처 표기: APA 7판 형식');
});

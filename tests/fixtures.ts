import type { Task } from '../src/domain/types';
import { analyzeText } from '../src/analysis/text';

const H = 3600000;
const base = (over: Partial<Task>): Task => ({
  id: 1, type: '보고서', subject: '', name: '과제', due: Date.parse('2026-12-01T23:59:00+09:00'), amount: 0, unit: '쪽', per: 0,
  done: false, created: Date.parse('2026-11-20T09:00:00+09:00'), issues: [], files: [], ...over
});
const file = (name: string, text: string) => ({ name, size: text.length, kind: 'text' as const, auto: analyzeText(text) });

export const NOW = Date.parse('2026-11-28T14:00:00+09:00');

export const CASES: { label: string; task: Task }[] = [
  {
    label: '경영통계 팀플 보고서 (번호 매긴 안내문 + 쟁점 2개)',
    task: base({
      name: '경영통계 팀플 보고서', subject: '경영통계', amount: 12, per: 30,
      content: '국내 배달앱 이용률 설문 데이터를 회귀분석한다.',
      issues: ['표본 크기가 충분한가', '이용률과 소득의 상관관계'],
      files: [file('조교 안내 공지.txt', '[경영통계 팀플 보고서 안내]\n1. 주제: 배달앱 이용률에 영향을 주는 요인 분석\n2. 분량: A4 12쪽 내외, 표와 그림 포함\n3. 필수: 회귀분석 결과표, 가설 검정 해석, 한계점\n4. 출처 표기: APA 7판\n5. 평가: 분석 타당성 40%, 해석 30%, 구성 20%, 형식 10%\n6. 설문 표본은 최소 100명 이상 확보할 것. 표본이 부족하면 한계점에 반드시 적을 것.\n7. 소득 구간별 이용률 차이를 표로 제시하면 가산점이 있습니다.')]
    })
  },
  {
    label: '윤리 기말 리포트 (한 문단 안내문, 비교 쟁점)',
    task: base({
      name: '현대사회와 윤리 기말 리포트', subject: '현대사회와 윤리', amount: 5, per: 50,
      content: '공리주의와 의무론의 관점에서 자율주행차의 사고 딜레마를 비교·분석하시오. 분량은 A4 5매 이상(표지 제외), 글꼴 11pt, 줄간격 160%로 작성합니다. 참고문헌은 MLA 형식으로 표기하고, 한글 파일 또는 PDF로 제출하세요. 평가: 논리 전개 40%, 자료 활용 30%, 형식 20%, 독창성 10%.',
      issues: ['자율주행차는 누구를 보호해야 하는가', '공리주의와 의무론의 차이']
    })
  },
  {
    label: '조별 발표 PPT (대시 구분 평가 기준)',
    task: base({
      type: 'PPT', unit: '장', name: 'MZ세대 소비 트렌드 발표', subject: '소비자행동론', amount: 15, per: 20,
      content: '조별 발표: 국내 MZ세대 소비 트렌드 분석\n발표 시간 10분, 슬라이드 15장 내외\n반드시 설문 또는 2차 자료를 포함할 것\n질의응답 5분\n평가 기준 - 내용 50%, 전달력 30%, 시간 준수 20%',
      issues: ['구독 경제가 소비 습관에 미치는 영향']
    })
  },
  {
    label: '미시경제 문제풀이 (짧은 안내)',
    task: base({
      type: '문제풀이', unit: '문제', name: '미시경제 과제 3', subject: '미시경제학', amount: 20, per: 6,
      content: '교재 5장 연습문제 1~20번. 풀이 과정을 반드시 적을 것. 손글씨 스캔 PDF 제출 가능.',
      issues: ['가격탄력성 계산']
    })
  },
  {
    label: '영어 안내문 (APA, 영어 쟁점)',
    task: base({
      name: 'Final Paper', subject: 'Media Studies', amount: 10, per: 60,
      content: 'Final Paper Guidelines: 8-10 pages, double-spaced, APA 7th edition. Must include at least 5 peer-reviewed sources. Grading: Argument 40%, Evidence 35%, Writing 25%.\n제출은 LMS에 PDF로 업로드하세요.',
      issues: ['Is social media harmful to teenagers?']
    })
  },
  {
    label: '정보가 거의 없는 과제 (기타, 쟁점 1개만)',
    task: base({ type: '기타', unit: '개', name: '교양 감상문', issues: ['기후변화'] })
  },
  {
    label: '긴 참고 기사 + 문제 해결형 쟁점',
    task: base({
      name: '최저임금 정책 보고서', subject: '경제학원론', amount: 6, per: 40,
      issues: ['최저임금 인상이 고용에 미치는 영향', '소상공인 부담 문제 해결 방안'],
      files: [file('최저임금 기사.txt', '최저임금위원회는 내년도 최저임금을 시간당 10,030원으로 결정했다. 이는 올해보다 1.7% 오른 수준이다.\n경영계는 최저임금 인상이 소상공인의 인건비 부담을 키워 고용을 줄일 수 있다고 주장했다. 실제로 일부 편의점주는 아르바이트 근무 시간을 줄이고 직접 근무하는 시간을 늘렸다고 밝혔다.\n노동계는 물가 상승률을 고려하면 실질 임금은 오히려 줄었다며 인상 폭이 너무 작다고 반발했다.\n한국노동연구원의 분석에 따르면 최저임금 인상 이후 고용에 미친 영향은 업종과 사업체 규모에 따라 다르게 나타났다. 숙박·음식점업에서는 고용 감소가 관찰됐지만 제조업에서는 뚜렷한 변화가 없었다.\n정부는 소상공인 부담을 덜기 위해 일자리 안정자금과 카드 수수료 인하 같은 지원책을 함께 검토하고 있다.')]
    })
  },
  {
    label: '이유·절차형 쟁점 + 슬라이드형 자료',
    task: base({
      name: 'PRD 작성 리포트', amount: 4, per: 40,
      issues: ['PRD 작성 절차', '제외 범위를 정하는 이유'],
      files: [file('강의록.txt', '절차 6 : 제외 범위 확정하기\n제외 범위가 3개 이상인가?\n제외 범위를 정해 두면 AI가 요청하지 않은 기능까지 만들어 프로젝트가 커지는 것을 막을 수 있습니다.\n절차 7 : PRD 통합하기\nPRD는 프로젝트 개요, 주요 타겟, 핵심 기능, 사용자 흐름, 입력과 출력, 제외 범위의 순서로 작성합니다.')]
    })
  },
  {
    label: '쟁점 없이 자료만 올린 보고서',
    task: base({
      name: '환경경제 리포트', amount: 3, per: 40,
      files: [file('강의자료.txt', '탄소세는 탄소 배출량에 비례해 세금을 매기는 제도이다. 배출권 거래제는 기업이 배출할 수 있는 양을 정하고 남거나 모자란 배출권을 사고팔게 한다. 탄소세는 가격을 고정하고 배출권 거래제는 배출량을 고정한다는 점에서 다르다. 두 제도 모두 탄소 배출에 가격을 매겨 기업의 행동을 바꾸려는 정책이다. 탄소세 수입은 저소득층 지원에 다시 쓰일 수 있다.')]
    })
  }
];

export { H };

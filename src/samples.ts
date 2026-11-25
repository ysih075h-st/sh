import type { Task } from './domain/types';
import { analyzeText } from './analysis/text';

const H = 3600000;

/** Example tasks for a first look; times are relative to now so the demo always shows every state. */
export function sampleTasks(startId: number, now = Date.now()): Task[] {
  const brief = '[경영통계 팀플 보고서 안내]\n1. 주제: 배달앱 이용률에 영향을 주는 요인 분석\n2. 분량: A4 12쪽 내외, 표와 그림 포함\n3. 필수: 회귀분석 결과표, 가설 검정 해석, 한계점\n4. 출처 표기: APA 7판\n5. 평가: 분석 타당성 40%, 해석 30%, 구성 20%, 형식 10%\n6. 설문 표본은 최소 100명 이상 확보할 것.\n7. 소득 구간별 이용률 차이를 표로 제시하면 가산점이 있습니다.';
  const article = '20대의 배달앱 이용률은 월평균 소득이 높을수록 높게 나타났다. 소득 상위 구간의 주 3회 이상 이용 비율은 41%로 하위 구간의 23%보다 높았다. 다만 1인 가구 여부를 함께 고려하면 소득과 이용률의 관계는 약해졌다. 연구진은 표본 312명 중 1인 가구가 58%를 차지해 결과를 일반화하기 어렵다고 밝혔다.';
  const list: Omit<Task, 'id'>[] = [
    { type: '보고서', subject: '경영통계', name: '배달앱 이용률 팀플 보고서', due: now + 9 * H, amount: 12, unit: '쪽', per: 30, done: false, created: now - 72 * H,
      issues: ['이용률과 소득의 상관관계', '표본 크기가 충분한가'],
      files: [{ name: '조교 안내 공지.txt', size: brief.length, kind: 'text', auto: analyzeText(brief) }, { name: '배달앱 이용 실태 기사.txt', size: article.length, kind: 'text', auto: analyzeText(article) }] },
    { type: 'PPT', subject: '소비자행동론', name: 'MZ세대 소비 트렌드 발표', due: now + 30 * H, amount: 15, unit: '장', per: 20, done: false, created: now - 48 * H,
      content: '조별 발표: 국내 MZ세대 소비 트렌드 분석\n발표 시간 10분, 슬라이드 15장 내외\n반드시 설문 또는 2차 자료를 포함할 것\n평가 기준 - 내용 50%, 전달력 30%, 시간 준수 20%', issues: ['구독 경제가 소비 습관에 미치는 영향'] },
    { type: '문제풀이', subject: '미시경제학', name: '미시경제 과제 3', due: now + 62 * H, amount: 20, unit: '문제', per: 6, done: false, created: now - 24 * H, issues: ['가격탄력성 계산'] },
    { type: '보고서', subject: '현대사회와 윤리', name: '자율주행차 윤리 리포트', due: now + 190 * H, amount: 5, unit: '쪽', per: 50, done: false, created: now - 12 * H },
    { type: '기타', subject: '세계사의 이해', name: '영화 감상문', due: now - 3 * H, amount: 0, unit: '개', per: 0, done: false, created: now - 100 * H },
    { type: '문제풀이', subject: '미시경제학', name: '미시경제 과제 2', due: now - 30 * H, amount: 15, unit: '문제', per: 10, done: true, doneAt: now - 41 * H, created: now - 200 * H },
    { type: 'PPT', subject: '소비자행동론', name: '중간 발표 슬라이드', due: now - 50 * H, amount: 10, unit: '장', per: 20, done: true, doneAt: now - 52 * H, created: now - 220 * H },
    { type: '보고서', subject: '경영통계', name: '기술통계 과제', due: now - 80 * H, amount: 6, unit: '쪽', per: 25, done: true, doneAt: now - 77 * H, created: now - 240 * H }
  ];
  return list.map((t, i) => ({ ...t, id: startId + i, sample: true, issues: t.issues || [], files: t.files || [], checks: {}, notified: {} }));
}

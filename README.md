# 과제 타이머

**사이트: https://sh-jcgm.vercel.app**

마감이 다가올수록 HP가 줄어드는 대학생용 과제 관리 웹앱입니다. 남은 시간에서 예상 작업 시간을 뺀 **여유 시간**으로 급한 정도를 보여 주고, 언제까지 시작해야 하는지 알려 줍니다.

## 주요 기능

- **HP 대시보드**: 시작 마지노선(마감 − 예상 소요 시간) 순으로 정렬, 여유 24시간 안이면 깜빡이고 6시간 안이면 흔들림
- **지금 시작해야 할 과제**: 여유 3시간 이하인 과제를 맨 위에 모아 보여 줌
- **등록·수정**: 유형별 기본 시간, 과목, 마감 빠른 선택(오늘·내일·금요일 23:59, 일주일 뒤)
- **자료·작성 가이드**: PDF·한글(.hwp/.hwpx, 배포용 포함)·워드·PPT(예전 .doc/.ppt 포함)·엑셀·텍스트·사진·스캔 PDF를 브라우저 안에서 읽어 분량·출처 형식·평가 기준·필수 항목을 정리하고, 쟁점별 분석·근거 문장·분량 배분·제출 전 체크리스트를 만들어 줌
- **알림과 캘린더**: 마감 24시간 전·시작 마지노선 무렵 브라우저 알림, 캘린더 파일(.ics) 내보내기
- **아카이브**: 생존율, 선택 삭제와 8초 되돌리기, GAME OVER 과제 처리
- **백업**: 브라우저 저장소(IndexedDB)에 저장하고 JSON 파일로 백업·복원, 홈 화면 설치(PWA)와 오프라인 지원

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm test         # 테스트 (긴급도 계산, 자동 분석 문장 품질, 백업, 캘린더)
npm run build    # dist/ 에 배포용 파일 생성
```

`npm run dev`와 `npm run build`는 먼저 `scripts/copy-assets.mjs`로 pdf.js 글꼴 지도와 글자 인식 도구(tesseract.js, 한국어·영어 데이터)를 `public/`에 복사합니다. 이 파일들은 저장소에 올리지 않습니다.

한글(.hwp) 테스트는 공개 저장소의 예제 파일을 씁니다. [pyhwp](https://github.com/mete0r/pyhwp)의 `tests/hwp5_tests/fixtures/`에서 `sample-5017.hwp`, `viewtext.hwp`, `password-12345.hwp`를, [hwp.js](https://github.com/hahnlee/hwp.js)의 `packages/parser/src/__tests__/data/basicsReport.hwp`를 `tests/files/third-party/`에 넣으면 실행되고, 없으면 건너뜁니다.

자동 분석이 실제 과제에서 어떤 문장을 만드는지 한눈에 보려면:

```bash
npx vite-node scripts/eval.ts
```

## 배포 (Vercel)

저장소를 Vercel에서 가져오면 Vite 프로젝트로 자동 인식됩니다. 빌드 명령 `npm run build`, 출력 폴더 `dist`이며 별도 설정은 필요 없습니다.

## 자료 읽기

| 형식 | 방법 |
| --- | --- |
| PDF | pdf.js로 글자 층을 읽고, 글자가 없는 쪽(스캔)은 그림으로 그려 글자 인식 (최대 20쪽) |
| 한글 .hwp | 문서 안의 본문 레코드를 직접 해석. 표·각주 포함, 배포용 문서는 복호화. 암호 문서는 안내 |
| 한글 .hwpx, .docx, .pptx, .xlsx | 압축을 풀어 본문 XML 읽기 |
| 예전 .doc, .ppt | 문서 구조(조각 테이블, 텍스트 레코드)를 직접 읽기 |
| 사진 | tesseract.js로 한국어·영어 인식. 한국어 줄 속 영문처럼 보이는 낱말은 한국어로 다시 읽고, 그래도 확실하지 않으면 ▢로 표시 |

글자 인식 결과는 근거로 쓸 때 출처에 "사진에서 읽음"을 붙이고, ▢가 두 개 이상인 문장은 근거로 쓰지 않습니다.

## 구조

```
src/
  domain/    과제 타입, 긴급도(HP·시작 마지노선), 저장·백업, 캘린더, 날짜 형식, 조사 처리
  analysis/  자료 읽기(pdf.js, hwp, doc/ppt, docx·pptx·xlsx·hwpx, 글자 인식), 문장·요구사항 추출, 작성 가이드
  ui/        화면 조각(카드, 폼)과 화면(대시보드, 작성 가이드, 아카이브, 설정)
  main.ts    상태, 화면 전환, 이벤트, 알림
tests/       단위 테스트와 실제 과제 예시
docs/        PRD, 디자인 가이드
```

## 문서

- [PRD](docs/PRD.md)
- [디자인 가이드](docs/DESIGN.md)

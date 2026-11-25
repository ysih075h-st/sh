import type { Task } from '../domain/types';
import { fmtLeft, fmtNeed, fmtWhen, MIN, H } from '../domain/format';
import { emergencies, sortActive, status } from '../domain/urgency';
import { buildGuide, buildTips, type Guide } from '../analysis/guide';
import { UNREADABLE_MESSAGE } from '../analysis/readers';
import { particle } from '../domain/josa';
import { card, COLORS, esc, formFields, hpBar, typeTag, type FormData } from './parts';

export interface ViewState {
  tasks: Task[];
  now: number;
  filter: string;
  quick: FormData;
  sel: Record<number, boolean>;
  reading: Record<number, number>;
  readingMsg: Record<number, string>;
  notify: { enabled: boolean; permission: NotificationPermission | 'unsupported' };
  confirm: '' | 'wipe' | 'import';
  importNote: string;
  installable: boolean;
}

export const subjectsOf = (tasks: Task[]) => [...new Set(tasks.map(t => t.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));

/* ---------- dashboard ---------- */

export function dashboard(v: ViewState): string {
  const { now } = v;
  const subjects = subjectsOf(v.tasks);
  const inFilter = (t: Task) => !v.filter || t.subject === v.filter;
  const active = sortActive(v.tasks.filter(inFilter), now);
  const live = active.filter(t => status(t, now).level !== 'over');
  const emg = emergencies(v.tasks.filter(inFilter), now);
  const samples = v.tasks.filter(t => t.sample).length;
  const workLeft = live.reduce((s, t) => s + status(t, now).needMs, 0);
  const in24 = live.filter(t => status(t, now).left <= 24 * H).length;

  if (!v.tasks.length) {
    return `<section class="band"><div class="wrap"><div class="empty" style="padding:56px 20px">
      <strong>아직 등록된 과제가 없어요</strong>
      <span>과제 이름, 마감, 분량을 넣으면 남은 시간을 HP로 보여 주고 언제까지 시작해야 하는지 알려 줘요.</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn primary" type="button" data-act="new">첫 과제 추가</button><button class="btn" type="button" data-act="loadSamples">예시 과제로 둘러보기</button></div>
    </div></div></section>`;
  }

  const nearest = live[0];
  const emgHTML = emg.length
    ? `<div class="emg"><div class="emg-head"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg><h2>지금 시작해야 할 과제</h2></div><div class="emg-grid">${emg.map(e => {
      const s = status(e.task, now);
      return `<a class="emg-item" href="#guide-${e.task.id}"><div class="c-top">${typeTag(e.task)}<h3>${esc(e.task.name)}</h3></div><span class="why">${esc(e.why)}</span>${hpBar(s)}<span class="meta">마감 ${fmtWhen(e.task.due)}${s.hasNeed ? `, 예상 소요 ${fmtNeed(s.needMs / MIN)}` : ''}</span></a>`;
    }).join('')}</div></div>`
    : `<div class="emg calm"><div class="emg-head"><h2>지금 당장 시작할 과제는 없어요</h2></div><p class="muted" style="margin:0">${nearest ? (status(nearest, now).hasNeed ? `다음 과제 ${esc(nearest.name)}${particle(nearest.name, '은/는')} ${fmtWhen(status(nearest, now).zero)}까지 시작하면 돼요.` : `다음 마감은 ${esc(nearest.name)}, ${esc(fmtLeft(nearest.due - now))}이에요.`) : '진행 중인 과제가 없어요.'}</p></div>`;

  const filters = subjects.length ? `<div class="filters" role="group" aria-label="과목으로 거르기"><button type="button" data-filter="" aria-pressed="${!v.filter}">전체</button>${subjects.map(s => `<button type="button" data-filter="${esc(s)}" aria-pressed="${v.filter === s}">${esc(s)}</button>`).join('')}</div>` : '';

  return `<section class="band"><div class="wrap"><div class="head-row"><h1>지금 무엇부터 할까요</h1><div class="stats"><span class="stat">진행 중<b>${live.length}</b></span><span class="stat">24시간 안 마감<b>${in24}</b></span><span class="stat">남은 작업<b>${workLeft ? fmtNeed(workLeft / MIN) : '0분'}</b></span></div></div>${emgHTML}</div></section>`
    + `<section class="band tight" id="quickBand"><div class="wrap"><h2 style="margin-bottom:10px">빠른 등록</h2><form class="quick" id="quick" novalidate>${formFields('q', v.quick, subjects, false)}</form></div></section>`
    + `<section class="band tight"><div class="wrap"><div class="head-row" style="margin-bottom:10px"><h2>진행 중인 과제</h2><span class="muted small">시작해야 하는 순서대로, 1분마다 갱신</span></div>`
    + (samples ? `<div class="note"><span>예시 과제 ${samples}개가 들어 있어요. 내 과제를 등록하기 전에 지워도 돼요.</span><button class="btn sm" type="button" data-act="clearSamples">예시 지우기</button></div>` : '')
    + filters
    + (active.length ? `<div class="list">${active.map(t => card(t, now)).join('')}</div>` : `<div class="empty"><span>${v.filter ? `${esc(v.filter)} 과목의 진행 중인 과제가 없어요.` : '진행 중인 과제가 없어요. 새 과제를 추가해 보세요.'}</span></div>`)
    + `</div></section>`
    + `<footer class="band"><div class="wrap legend"><span style="--c:var(--safe)"><i></i>HP 50% 초과, 여유 있어요</span><span style="--c:var(--warn)"><i></i>HP 20~50%, 계획을 세울 때</span><span style="--c:var(--crit)"><i></i>HP 20% 미만, 여유 24시간 안이면 깜빡이고 6시간 안이면 흔들려요</span><span style="--c:var(--over)"><i></i>GAME OVER, 기한이 지났어요</span><span>HP는 남은 시간에서 예상 소요 시간을 뺀 여유를 7일 기준으로 나타내요.</span></div></footer>`;
}

/* ---------- archive ---------- */

export function archive(v: ViewState): string {
  const { now } = v;
  const done = v.tasks.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const over = v.tasks.filter(t => !t.done && t.due <= now);
  const onTime = done.filter(t => !t.doneAt || t.doneAt <= t.due);
  const late = done.length - onTime.length;
  const total = done.length + over.length;
  const rate = total ? Math.round((onTime.length / total) * 100) : 0;
  const saved = onTime.reduce((s, t) => s + Math.max(0, t.due - (t.doneAt || t.due)), 0);
  const C = 2 * Math.PI * 42;
  const selN = done.filter(t => v.sel[t.id]).length;
  const allSel = done.length > 0 && selN === done.length;
  const row = (t: Task) => {
    const isLate = !!t.doneAt && t.doneAt > t.due;
    const gap = t.doneAt ? Math.abs(t.due - t.doneAt) : 0;
    return `<label class="row${v.sel[t.id] ? ' sel' : ''}"><input type="checkbox" data-sel="${t.id}"${v.sel[t.id] ? ' checked' : ''} aria-label="${esc(t.name)} 선택"><span><span class="c-top">${typeTag(t)}<b>${esc(t.name)}</b><span class="badge ${isLate ? 'b-warn">늦은 클리어' : 'b-clear">CLEAR!'}</span></span><span class="when">${t.subject ? esc(t.subject) + ', ' : ''}${t.doneAt ? `완료 ${fmtWhen(t.doneAt)}, 마감보다 ${fmtNeed(gap / MIN)} ${isLate ? '늦게' : '일찍'}` : ''}</span></span><button class="btn sm ghost" type="button" data-act="undone" data-id="${t.id}">진행 중으로</button></label>`;
  };
  return `<section class="band"><div class="wrap"><h1>완료 과제 아카이브</h1><div class="arc"><div class="donut"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="#31394d" stroke-width="10"/><circle cx="50" cy="50" r="42" fill="none" stroke="var(--clear)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * rate) / 100} ${C}"/></svg><div><b>${total ? rate + '%' : '—'}</b><span class="muted small">생존율</span></div></div>`
    + `<dl class="meta" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><dt>기한 안에 클리어</dt><dd>${onTime.length}개</dd></div><div><dt>늦은 클리어·GAME OVER</dt><dd>${late + over.length}개</dd></div><div><dt>마감 전에 남긴 시간</dt><dd>${fmtNeed(saved / MIN)}</dd></div></dl></div></div></section>`
    + `<section class="band tight"><div class="wrap"><div class="toolbar"><h2>CLEAR! 목록</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" type="button" data-act="selAll"${done.length ? '' : ' disabled'}>${allSel ? '선택 해제' : '전체 선택'}</button><button class="btn sm danger" type="button" data-act="delSel"${selN ? '' : ' disabled'}>선택 삭제 (${selN})</button></div></div>`
    + (done.length ? done.map(row).join('') : '<div class="empty">아직 완료한 과제가 없어요. 과제 카드에서 완료를 누르면 여기로 옮겨져요.</div>') + `</div></section>`
    + `<section class="band tight"><div class="wrap"><h2 style="margin-bottom:12px">GAME OVER</h2>`
    + (over.length ? over.map(t => `<div class="row"><span>${typeTag(t)}</span><span><b>${esc(t.name)}</b><span class="when">마감 ${fmtWhen(t.due)}, ${fmtNeed((now - t.due) / MIN)} 지남</span></span><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" type="button" data-act="edit" data-id="${t.id}">마감 미루기</button><button class="btn sm" type="button" data-act="done" data-id="${t.id}">뒤늦게 완료</button><button class="btn sm danger" type="button" data-act="del" data-id="${t.id}">삭제</button></span></div>`).join('') : '<div class="empty">기한을 넘긴 과제가 없어요.</div>') + `</div></section>`;
}

/* ---------- workspace ---------- */

export function workspaceShell(t: Task): string {
  return `<section class="band"><div class="wrap"><a class="back" href="#dashboard">대시보드로</a><div class="c-top">${typeTag(t)}<h1>${esc(t.name)}</h1></div>${t.subject ? `<p class="muted" style="margin:4px 0 0">${esc(t.subject)}</p>` : ''}<div class="ws-hud" id="wsHud"></div></div></section>`
    + `<section class="band tight"><div class="wrap ws"><div class="panel"><h2>과제 정보와 자료</h2>`
    + `<label class="f">과제 내용·안내문<textarea id="wContent" rows="5" placeholder="교수님 안내문이나 강의계획서의 과제 부분을 붙여 넣으세요. 분량, 출처 형식, 평가 기준을 찾아 정리해요.">${esc(t.content || '')}</textarea></label>`
    + `<div style="display:flex;flex-direction:column;gap:6px"><label class="f" for="wIssue">주요 쟁점</label><div class="issue-in"><input type="text" id="wIssue" maxlength="80" placeholder="예: 표본 크기가 충분한가"><button class="btn" type="button" data-act="addIssue">추가</button></div><div class="chips" id="wIssues"></div></div>`
    + `<label class="drop" id="drop"><input type="file" id="wFile" multiple accept=".pdf,.hwp,.hwpx,.docx,.doc,.pptx,.ppt,.xlsx,.txt,.md,.csv,image/*">참고 자료를 끌어다 놓거나 눌러서 고르세요<span class="small muted" style="display:block;margin-top:4px">PDF, 한글, 워드, PPT, 엑셀, 텍스트, 안내문 사진이나 스캔본도 돼요. 파일은 이 기기 밖으로 보내지 않고 브라우저 안에서 읽어요.</span></label>`
    + `<div id="wFiles" style="display:flex;flex-direction:column;gap:8px"></div><h3>일정·분량 팁</h3><div id="wTips" style="display:flex;flex-direction:column;gap:8px"></div></div>`
    + `<div class="panel" id="wGuide"></div></div></section>`;
}

export function workspaceHud(t: Task, now: number): string {
  const s = status(t, now), C = 2 * Math.PI * 42, c = COLORS[s.level];
  const buf = s.hasNeed ? s.slack : null;
  const bufColor = buf == null ? 'var(--sub)' : buf < 0 ? 'var(--crit)' : buf <= 3 * H ? 'var(--warn)' : 'var(--safe)';
  return `<div class="dial"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="#31394d" stroke-width="9"/><circle cx="50" cy="50" r="42" fill="none" stroke="${c}" stroke-width="9" stroke-dasharray="${(C * s.hp) / 100} ${C}"/></svg><div><b style="color:${c}">${s.hp}%</b><span>HP</span></div></div>`
    + `<dl class="meta"><div><dt>남은 시간</dt><dd>${s.level === 'over' ? '기한 지남' : t.done ? '완료' : fmtLeft(s.left).replace(' 남음', '')}</dd></div><div><dt>예상 소요</dt><dd>${s.hasNeed ? fmtNeed(s.needMs / MIN) : '분량 미입력'}</dd></div><div><dt>여유 시간</dt><dd style="color:${bufColor}">${buf == null ? '—' : (buf < 0 ? '−' : '') + fmtNeed(Math.abs(buf) / MIN)}</dd></div><div><dt>시작 마지노선</dt><dd>${s.hasNeed ? fmtWhen(s.zero) : '—'}</dd></div></dl>`;
}

export function workspaceSources(t: Task, v: ViewState): string {
  const reading = v.reading[t.id] ? `<p class="status" role="status" id="readStatus">${esc(v.readingMsg[t.id] || `자료 ${v.reading[t.id]}개를 읽는 중이에요.`)}</p>` : '';
  return reading + (t.files || []).map((f, i) => {
    const a = f.auto;
    const note = f.kind === 'other' ? UNREADABLE_MESSAGE[f.why || 'type'] : '';
    const reqs = a ? a.reqLines.slice(0, 4) : [];
    return `<div class="file"><div class="file-h"><b title="${esc(f.name)}">${esc(f.name)}</b><button class="btn sm ghost" type="button" data-act="rmFile" data-i="${i}" aria-label="${esc(f.name)} 삭제">삭제</button></div>`
      + (note ? `<p class="status w">${esc(note)}</p>` : '')
      + (f.ocr ? '<p class="status">사진이나 스캔에서 글자 인식으로 읽었어요. 확실히 읽지 못한 낱말은 ▢로 표시했어요. 근거로 쓸 때는 원본과 대조해 주세요.</p>' : '')
      + (f.note ? `<p class="status">${esc(f.note)}</p>` : '')
      + (a && a.keywords.length ? `<div class="kw" aria-label="핵심어">${a.keywords.slice(0, 6).map(w => `<span>${esc(w)}</span>`).join('')}</div>` : '')
      + (reqs.length ? `<div><span class="small muted">요구사항으로 보이는 문장</span><ul class="req">${reqs.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : '')
      + (a && a.summary.length ? `<details><summary>핵심 문장 ${a.summary.length}개 보기</summary><ul class="req">${a.summary.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '')
      + (a && !a.summary.length && !reqs.length ? '<p class="status">문장이 짧거나 표 위주라 핵심 문장을 고르지 못했어요. 쟁점 근거 찾기에는 그대로 쓰여요.</p>' : '')
      + '</div>';
  }).join('');
}

export function workspaceTips(t: Task, now: number): string {
  return buildTips(t, now).map(x => `<div class="tip"><b>${esc(x.title)}</b><span>${esc(x.body)}</span></div>`).join('');
}

export function workspaceIssues(t: Task): string {
  return (t.issues || []).map((is, i) => `<span class="chip">${esc(is)}<button type="button" data-act="rmIssue" data-i="${i}" aria-label="${esc(is)} 쟁점 삭제">×</button></span>`).join('')
    || '<span class="small muted">과제에서 답해야 할 질문을 2~3개 적으면 쟁점마다 쓰는 법과 근거 후보가 나와요.</span>';
}

export function workspaceGuide(t: Task): { html: string; guide: Guide } {
  const g = buildGuide(t);
  const checks = t.checks || {};
  const counterLabel = t.type === '문제풀이' ? '주의할 점' : '예상 반론';
  const maxW = Math.max(1, ...g.outline.map(o => o.weight));
  const issues = g.issues.length
    ? g.issues.map((x, n) => `<article class="issue"><h4>쟁점 ${n + 1}. ${esc(x.issue)}</h4><p class="q" style="margin:0">${esc(x.question)}</p><dl>`
      + `<dt>분석 관점</dt><dd><ul>${x.angles.map(a => `<li>${esc(a)}</li>`).join('')}</ul></dd>`
      + (x.evidence.length ? `<dt>근거 후보</dt><dd>${x.evidence.map(e => `<div class="ev${e.found ? '' : ' missing'}">${esc(e.point)}${e.found ? `<span class="src">${esc(e.source)}</span>` : ''}</div>`).join('')}</dd>` : '')
      + `<dt>${counterLabel}</dt><dd>${esc(x.counter)}</dd><dt>이렇게 쓰세요</dt><dd>${esc(x.how)}</dd></dl></article>`).join('')
    : '<p class="status">왼쪽에 쟁점을 추가하면 쟁점마다 핵심 질문, 분석 관점, 근거 후보가 나와요.</p>';
  const html = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2>작성 가이드</h2><span class="small muted">과제 정보와 올린 자료를 바탕으로 자동으로 정리해요</span></div>`
    + `<div class="need"><b>이 과제가 요구하는 것</b>${esc(g.summary)}</div>`
    + `<h3>${t.type === '문제풀이' ? '헷갈리는 개념 정리' : '쟁점별 분석'}</h3>${issues}`
    + `<h3>권장 분량 배분</h3><div class="alloc">${g.outline.map(o => `<div><div><b>${esc(o.part)}</b><div class="abar" style="width:${Math.round((o.weight / maxW) * 100)}%"></div></div><span class="amount">${esc(o.amount)}</span><ul>${o.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}</div>`
    + `<h3>제출 전 감점 방지 체크</h3><div>${g.checklist.map((c, i) => `<label class="check${checks[c] ? ' done' : ''}"><input type="checkbox" data-check="${i}"${checks[c] ? ' checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div>`
    + `<div class="next"><b>지금 바로 할 일</b>${esc(g.next)}</div>`;
  return { html, guide: g };
}

/* ---------- settings ---------- */

export function settings(v: ViewState): string {
  const n = v.tasks.length;
  const perm = v.notify.permission;
  const notifyText = perm === 'unsupported' ? '이 브라우저는 알림을 지원하지 않아요. 아래 캘린더 파일로 알림을 받으세요.'
    : perm === 'denied' ? '브라우저에서 알림이 차단되어 있어요. 브라우저 사이트 설정에서 알림을 허용한 뒤 다시 켜 주세요.'
    : v.notify.enabled && perm === 'granted' ? '알림이 켜져 있어요. 마감 24시간 전, 시작 마지노선 3시간 전, 마지노선이 지났을 때 알려 드려요.'
    : '알림을 켜면 마감 24시간 전, 시작 마지노선 3시간 전, 마지노선이 지났을 때 알려 드려요.';
  return `<section class="band"><div class="wrap"><h1 style="margin-bottom:14px">설정</h1><div class="set">`
    + `<div class="panel"><h2>알림</h2><p>${notifyText}</p><p class="small">이 사이트가 열려 있거나 홈 화면에 설치한 앱이 실행 중일 때 알림이 와요. 앱을 닫아도 확실히 받으려면 캘린더에 추가하세요.</p><div class="acts">`
    + (perm === 'unsupported' ? '' : v.notify.enabled && perm === 'granted' ? '<button class="btn" type="button" data-act="notifyOff">알림 끄기</button><button class="btn ghost" type="button" data-act="notifyTest">알림 시험하기</button>' : `<button class="btn primary" type="button" data-act="notifyOn"${perm === 'denied' ? ' disabled' : ''}>알림 켜기</button>`)
    + `</div></div>`
    + `<div class="panel"><h2>캘린더에 추가</h2><p>진행 중인 과제를 캘린더 파일(.ics)로 저장해요. 휴대폰이나 구글 캘린더에서 열면 마감 24시간 전과 시작 마지노선에 캘린더가 알려 줘요.</p><div class="acts"><button class="btn" type="button" data-act="ics">캘린더 파일 저장</button></div></div>`
    + `<div class="panel"><h2>백업과 복원</h2><p>과제는 이 기기의 브라우저에만 저장돼요. 다른 기기로 옮기거나 브라우저 기록을 지우기 전에 백업 파일을 저장해 두세요.</p><div class="acts"><button class="btn" type="button" data-act="export"${n ? '' : ' disabled'}>백업 파일 저장 (${n}개)</button><label class="btn" style="position:relative">백업에서 불러오기<input type="file" id="importFile" accept=".json,application/json" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>`
    + (v.confirm === 'import' ? `<div class="confirm" role="alert"><span>${esc(v.importNote)}</span><button class="btn sm" type="button" data-act="importMerge">지금 과제에 더하기</button><button class="btn sm danger" type="button" data-act="importReplace">지금 과제를 바꾸기</button><button class="btn sm ghost" type="button" data-act="cancelConfirm">취소</button></div>` : v.importNote ? `<p class="status w" role="status">${esc(v.importNote)}</p>` : '')
    + `</div>`
    + (v.installable ? '<div class="panel"><h2>앱으로 설치</h2><p>홈 화면에 설치하면 앱처럼 바로 열리고, 인터넷이 끊겨도 저장된 과제를 볼 수 있어요.</p><div class="acts"><button class="btn" type="button" data-act="install">설치하기</button></div></div>' : '')
    + `<div class="panel"><h2>데이터</h2><p>예시 과제를 다시 불러오거나 모든 과제를 지울 수 있어요.</p><div class="acts"><button class="btn" type="button" data-act="loadSamples">예시 과제 불러오기</button><button class="btn danger" type="button" data-act="askWipe"${n ? '' : ' disabled'}>모든 과제 지우기</button></div>`
    + (v.confirm === 'wipe' ? `<div class="confirm" role="alert"><span>과제 ${n}개를 모두 지워요. 백업이 없으면 되돌릴 수 없어요.</span><button class="btn sm danger" type="button" data-act="wipe">모두 지우기</button><button class="btn sm ghost" type="button" data-act="cancelConfirm">취소</button></div>` : '')
    + `</div></div></div></section>`;
}

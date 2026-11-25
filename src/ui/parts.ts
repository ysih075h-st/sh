import type { Task } from '../domain/types';
import { TYPES, UNITS } from '../domain/types';
import { fmtLeft, fmtNeed, fmtWhen, MIN, deadlinePresets } from '../domain/format';
import { status, type Status } from '../domain/urgency';

/** Every value that came from the user or a file goes through this before joining HTML. */
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const COLORS: Record<Status['level'], string> = { safe: 'var(--safe)', warn: 'var(--warn)', crit: 'var(--crit)', over: 'var(--over)', done: 'var(--clear)' };

export function typeTag(t: Pick<Task, 'type'>): string {
  const ty = TYPES[t.type] || TYPES['기타'];
  return `<span class="tag" style="--t:${ty.color}">${esc(t.type)}</span>`;
}

export function hpBar(s: Status): string {
  const c = COLORS[s.level];
  return `<div class="hp" style="--c:${c}"><span class="lbl">HP</span><div class="bar" role="progressbar" aria-label="남은 체력 ${s.hp}%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.hp}"><i style="width:${s.hp}%"></i></div><span class="pct">${s.hp}%</span></div>`;
}

export function card(t: Task, now: number): string {
  const s = status(t, now);
  const over = s.level === 'over';
  const cls = ['card', over ? 'over' : '', s.motion ? `crit ${s.motion}` : ''].join(' ').trim();
  const badges = (over ? '<span class="badge b-over">GAME OVER</span>' : s.motion === 'shake' ? '<span class="badge b-crit">긴급</span>' : s.motion === 'pulse' ? '<span class="badge b-crit">위험</span>' : '')
    + (s.short ? '<span class="badge b-crit">시간 부족</span>' : '') + (t.sample ? '<span class="badge b-mute">예시</span>' : '');
  const meta = over ? '' : s.hasNeed
    ? `<div class="c-meta"><span>예상 소요 <b>${fmtNeed(s.needMs / MIN)}</b></span><span>시작 마지노선 <b>${s.short ? '이미 지났어요' : fmtWhen(s.zero)}</b></span></div>`
    : '<div class="c-meta"><span>분량을 넣으면 시작 마지노선을 계산해요</span></div>';
  const acts = over
    ? `<button class="btn sm" data-act="edit" data-id="${t.id}">마감 미루기</button><button class="btn sm" data-act="done" data-id="${t.id}">뒤늦게 완료</button><button class="btn sm danger" data-act="del" data-id="${t.id}">삭제</button>`
    : `<a class="btn sm guide" href="#guide-${t.id}">자료·작성 가이드</a><button class="btn sm" data-act="edit" data-id="${t.id}">수정</button><button class="btn sm primary" data-act="done" data-id="${t.id}">완료</button>`;
  return `<article class="${cls}"><div class="c-top">${typeTag(t)}<h3>${esc(t.name)}</h3>${badges}</div>${t.subject ? `<div class="c-sub">${esc(t.subject)}</div>` : ''}`
    + `<div class="c-time">${over ? `마감 ${fmtWhen(t.due)}, 기한이 지났어요` : fmtLeft(s.left)}</div>${hpBar(s)}${meta}<div class="c-act">${acts}</div></article>`;
}

export interface FormData { type: Task['type']; subject: string; name: string; due: string; amount: string; unit: string; per: string }

/** The add/edit form. `p` prefixes ids so the quick bar and the sheet can coexist. */
export function formFields(p: 'q' | 'm', d: FormData, subjects: string[], editing: boolean): string {
  const ty = TYPES[d.type] || TYPES['보고서'];
  const presets = deadlinePresets().map(x => `<button type="button" data-preset="${x.ts}" data-p="${p}">${x.label}</button>`).join('');
  const typeBtns = (Object.keys(TYPES) as Task['type'][]).map(k => `<button type="button" data-type="${k}" aria-pressed="${d.type === k}" style="--t:${TYPES[k].color}">${k}</button>`).join('');
  return `<div class="row1 full"><div class="types" role="group" aria-label="과제 유형">${typeBtns}</div></div>`
    + `<label class="f">과제 이름<input type="text" id="${p}-name" maxlength="40" placeholder="예: 경영통계 팀플 보고서" value="${esc(d.name)}" autocomplete="off"><span class="err" id="${p}-name-e"></span></label>`
    + `<label class="f">과목<input type="text" id="${p}-subject" maxlength="30" list="subjects" placeholder="선택, 예: 경영통계" value="${esc(d.subject)}" autocomplete="off"><span class="err"></span></label>`
    + `<label class="f">마감 날짜와 시간<input type="datetime-local" id="${p}-due" value="${esc(d.due)}"><span class="err" id="${p}-due-e"></span></label>`
    + `<label class="f">분량<span class="amt"><input type="number" min="1" inputmode="numeric" id="${p}-amount" placeholder="12" value="${esc(d.amount)}"><select id="${p}-unit" aria-label="단위">${UNITS.map(u => `<option${u === d.unit ? ' selected' : ''}>${u}</option>`).join('')}</select></span><span class="err" id="${p}-amount-e"></span></label>`
    + `<label class="f">단위당 시간(분)<input type="number" min="1" inputmode="numeric" id="${p}-per" value="${esc(d.per)}"><span class="err"></span></label>`
    + `<button class="btn primary sub" type="submit">${editing ? '수정 저장' : '추가'}</button>`
    + `<div class="presets full" role="group" aria-label="마감 빠른 선택">${presets}</div>`
    + `<div class="calc full"><span><span id="${p}-hint">${esc(ty.hint)}</span> = 예상 소요 <b id="${p}-calc">—</b></span><span id="${p}-msg" role="status"></span></div>`
    + `<datalist id="subjects">${subjects.map(s => `<option value="${esc(s)}">`).join('')}</datalist>`;
}

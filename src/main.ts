import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './styles.css';

import type { Task } from './domain/types';
import { TYPES } from './domain/types';
import { fmtNeed, fmtWhen, toLocalInput, DAY } from './domain/format';
import { status } from './domain/urgency';
import { load, save, requestPersistence, exportBackup, parseBackup, type Saved } from './domain/store';
import { buildIcs } from './domain/ics';
import { readSource } from './analysis/readers';
import type { Guide } from './analysis/guide';
import { sampleTasks } from './samples';
import { askPermission, pendingReminders, permission, show } from './notify';
import { formFields, type FormData } from './ui/parts';
import * as V from './ui/views';

/* ---------- state ---------- */

let data: Saved = { version: 2, tasks: [], settings: { notify: false } };
const ui = {
  filter: '',
  quick: blankForm('보고서'),
  sheet: blankForm('보고서'),
  editing: null as number | null,
  sel: {} as Record<number, boolean>,
  reading: {} as Record<number, number>,
  confirm: '' as V.ViewState['confirm'],
  importNote: '',
  pendingImport: null as Task[] | null,
  undo: null as Task[] | null,
  viewKey: '',
  guide: null as Guide | null,
  durable: true,
  migrated: false,
  installEvent: null as any
};
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const byId = (id: number) => data.tasks.find(t => t.id === id);
const nextId = () => Math.max(0, ...data.tasks.map(t => t.id)) + 1;

function blankForm(type: Task['type']): FormData {
  return { type, subject: '', name: '', due: '', amount: '', unit: TYPES[type].unit, per: String(TYPES[type].per) };
}

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const ok = await save(data);
    if (!ok && ui.durable) { ui.durable = false; banners(); }
  }, 150);
}
function setTasks(tasks: Task[], quiet = false) { data.tasks = tasks; persist(); if (!quiet) render(); }
function patch(id: number, p: Partial<Task>, quiet = false) { setTasks(data.tasks.map(t => (t.id === id ? { ...t, ...p } : t)), quiet); }

function viewState(): V.ViewState {
  return { tasks: data.tasks, now: Date.now(), filter: ui.filter, quick: ui.quick, sel: ui.sel, reading: ui.reading,
    notify: { enabled: data.settings.notify, permission: permission() }, confirm: ui.confirm, importNote: ui.importNote, installable: !!ui.installEvent };
}

/* ---------- render ---------- */

type Route = { v: 'dashboard' | 'archive' | 'settings' } | { v: 'guide'; id: number };
function route(): Route {
  const h = location.hash.slice(1);
  const m = /^guide-(\d+)$/.exec(h);
  if (m && byId(Number(m[1]))) return { v: 'guide', id: Number(m[1]) };
  return { v: h === 'archive' ? 'archive' : h === 'settings' ? 'settings' : 'dashboard' };
}

function banners() {
  const out: string[] = [];
  if (!ui.durable) out.push('<div class="banner">이 창에서는 저장이 안 돼요(시크릿 모드 등). 새로고침하면 과제가 사라지니 설정에서 백업 파일을 저장해 두세요.</div>');
  if (ui.migrated) out.push('<div class="banner info">이전 버전에 저장된 과제를 옮겨 왔어요.</div>');
  $('#banners').innerHTML = out.join('');
}

function header(now: number) {
  const r = route();
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach(a => a.setAttribute('aria-current', a.dataset.nav === (r.v === 'guide' ? 'dashboard' : r.v) ? 'page' : 'false'));
  const live = data.tasks.filter(t => !t.done && status(t, now).level !== 'over');
  const urgent = live.filter(t => status(t, now).left <= 24 * 3600000).length;
  const next = [...live].sort((a, b) => status(a, now).zero - status(b, now).zero)[0];
  const u = $('#urgent');
  u.className = 'urgent' + (urgent ? '' : ' calm');
  u.textContent = urgent ? `24시간 안 마감 ${urgent}개` : next ? `다음 마감 D-${Math.max(0, Math.floor((next.due - now) / DAY))}` : '마감 없음';
  $('#clock').textContent = fmtWhen(now);
}

function render() {
  const now = Date.now();
  header(now);
  const r = route();
  document.body.dataset.view = r.v;
  const v = viewState();
  if (r.v === 'guide') {
    const t = byId(r.id)!;
    if (ui.viewKey !== `guide-${r.id}`) { $('#view').innerHTML = V.workspaceShell(t); ui.viewKey = `guide-${r.id}`; }
    $('#wsHud').innerHTML = V.workspaceHud(t, now);
    $('#wIssues').innerHTML = V.workspaceIssues(t);
    $('#wFiles').innerHTML = V.workspaceSources(t, v);
    $('#wTips').innerHTML = V.workspaceTips(t, now);
    const g = V.workspaceGuide(t);
    $('#wGuide').innerHTML = g.html;
    ui.guide = g.guide;
    return;
  }
  ui.viewKey = r.v;
  $('#view').innerHTML = r.v === 'archive' ? V.archive(v) : r.v === 'settings' ? V.settings(v) : V.dashboard(v);
  if (r.v === 'dashboard') calc('q');
}

/* ---------- forms ---------- */

function readForm(p: 'q' | 'm'): FormData {
  const g = (k: string) => (document.getElementById(`${p}-${k}`) as HTMLInputElement | null)?.value ?? '';
  return { type: (p === 'q' ? ui.quick : ui.sheet).type, subject: g('subject').trim(), name: g('name').trim(), due: g('due'), amount: g('amount').trim(), unit: g('unit'), per: g('per').trim() };
}

function calc(p: 'q' | 'm') {
  const el = document.getElementById(`${p}-calc`);
  if (!el) return;
  const f = readForm(p), a = Number(f.amount), per = Number(f.per);
  el.textContent = a > 0 && per > 0 ? fmtNeed(a * per) : '—';
}

function submit(p: 'q' | 'm') {
  const f = readForm(p);
  const e = { name: '', due: '', amount: '' };
  if (!f.name) e.name = '과제 이름을 입력해 주세요.';
  else if (f.name.length > 30) e.name = '과제 이름은 30자까지 입력할 수 있어요.';
  const due = f.due ? new Date(f.due).getTime() : NaN;
  if (!f.due || isNaN(due)) e.due = '마감 날짜와 시간을 선택해 주세요.';
  else if (due <= Date.now()) e.due = '이미 지난 시간이에요. 앞으로의 마감일을 골라 주세요.';
  const hasA = f.amount !== '', a = Number(f.amount), per = Number(f.per);
  if (hasA && !(a > 0 && per > 0)) e.amount = '분량과 단위당 시간을 1 이상의 숫자로 둘 다 입력해 주세요.';
  (Object.keys(e) as (keyof typeof e)[]).forEach(k => { const el = document.getElementById(`${p}-${k}-e`); if (el) el.textContent = e[k]; });
  const msg = document.getElementById(`${p}-msg`)!;
  if (e.name || e.due || e.amount) {
    msg.className = 'err';
    msg.textContent = '빨간 안내가 있는 칸을 확인해 주세요.';
    (document.getElementById(`${p}-${e.name ? 'name' : e.due ? 'due' : 'amount'}`) as HTMLElement)?.focus();
    return;
  }
  const fields = { type: f.type, subject: f.subject, name: f.name, due, amount: hasA ? a : 0, unit: f.unit, per: hasA ? per : 0 };
  if (p === 'm' && ui.editing != null) {
    const id = ui.editing;
    patch(id, { ...fields, sample: false, notified: {} });
    closeSheet();
    toast(`'${f.name}' 과제를 수정했어요.`, null);
    return;
  }
  setTasks([...data.tasks, { id: nextId(), done: false, created: Date.now(), issues: [], files: [], checks: {}, notified: {}, ...fields }], true);
  ui.quick = { ...blankForm(f.type), subject: p === 'q' ? f.subject : '' };
  if (p === 'm') closeSheet();
  render();
  const m2 = document.getElementById('q-msg');
  if (m2 && p === 'q') { m2.className = 'ok'; m2.textContent = `'${f.name}' 과제를 추가했어요.`; }
  if (p === 'm') toast(`'${f.name}' 과제를 추가했어요.`, null);
}

function openSheet(t: Task | null) {
  ui.editing = t ? t.id : null;
  ui.sheet = t
    ? { type: t.type, subject: t.subject, name: t.name, due: toLocalInput(t.due), amount: t.amount > 0 ? String(t.amount) : '', unit: t.unit, per: String(t.per > 0 ? t.per : TYPES[t.type].per) }
    : { ...blankForm('보고서'), subject: ui.filter };
  $('#sheetTitle').textContent = t ? '과제 수정' : '새 과제 등록';
  $('#sheetFields').innerHTML = `<div class="form-grid">${formFields('m', ui.sheet, V.subjectsOf(data.tasks), !!t)}</div>`;
  $('#sheet').hidden = false;
  calc('m');
  setTimeout(() => (document.getElementById('m-name') as HTMLInputElement | null)?.focus(), 30);
}
function closeSheet() {
  $('#sheet').hidden = true;
  ui.editing = null;
  (window.matchMedia('(max-width:600px)').matches ? $('#fab') : $('#newBtn')).focus();
}

/* ---------- toast + undo ---------- */

let toastTimer = 0;
function toast(text: string, items: Task[] | null) {
  clearTimeout(toastTimer);
  ui.undo = items;
  $('#toastText').textContent = text;
  $('#undoBtn').hidden = !items;
  const p = $('#toastProg');
  p.hidden = !items;
  p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
  $('#toast').hidden = false;
  toastTimer = window.setTimeout(() => { $('#toast').hidden = true; ui.undo = null; }, items ? 8000 : 3000);
}
function removeWithUndo(pred: (t: Task) => boolean, label: string) {
  const gone = data.tasks.filter(pred), keep = data.tasks.filter(t => !pred(t));
  if (!gone.length) return;
  ui.sel = {};
  setTasks(keep);
  toast(label, gone);
}

/* ---------- files ---------- */

async function addFiles(id: number, list: File[]) {
  if (!list.length || !byId(id)) return;
  ui.reading[id] = list.length;
  render();
  const results = [];
  for (const f of list) results.push(await readSource(f));
  delete ui.reading[id];
  const cur = byId(id);
  if (cur) patch(id, { files: [...(cur.files || []), ...results], sample: false });
  const unread = results.filter(r => r.kind === 'other').length;
  toast(unread ? `자료 ${results.length}개 중 ${unread}개는 읽지 못했어요. 파일 아래 안내를 확인해 주세요.` : `자료 ${results.length}개를 읽고 가이드에 반영했어요.`, null);
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', name);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- reminders ---------- */

async function checkReminders() {
  if (!data.settings.notify || permission() !== 'granted') return;
  const due = pendingReminders(data.tasks);
  if (!due.length) return;
  if (due.length > 2) await show(`과제 알림 ${due.length}개`, due.map(d => d.title).join('\n'), 'summary');
  else for (const d of due) await show(d.title, d.body, `${d.task.id}-${d.key}`);
  const sent = new Map<number, Record<string, boolean>>();
  for (const d of due) sent.set(d.task.id, { ...(sent.get(d.task.id) || d.task.notified || {}), [d.key]: true });
  setTasks(data.tasks.map(t => (sent.has(t.id) ? { ...t, notified: sent.get(t.id) } : t)), true);
}

/* ---------- events ---------- */

function addIssue(t: Task) {
  const inp = $<HTMLInputElement>('#wIssue'), v = inp.value.trim();
  if (!v) return;
  if ((t.issues || []).length >= 6) { toast('쟁점은 6개까지 적을 수 있어요.', null); return; }
  inp.value = '';
  patch(t.id, { issues: [...(t.issues || []), v], sample: false });
  $<HTMLInputElement>('#wIssue').focus();
}

document.addEventListener('click', async e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-type],[data-close],[data-filter],[data-preset]');
  if (!b) return;
  if (b.dataset.close !== undefined) { closeSheet(); return; }
  if (b.dataset.filter !== undefined) { ui.filter = b.dataset.filter; render(); return; }
  if (b.dataset.preset) {
    const p = b.dataset.p as 'q' | 'm';
    const inp = document.getElementById(`${p}-due`) as HTMLInputElement;
    inp.value = toLocalInput(Number(b.dataset.preset));
    (p === 'q' ? ui.quick : ui.sheet).due = inp.value;
    const err = document.getElementById(`${p}-due-e`); if (err) err.textContent = '';
    return;
  }
  if (b.dataset.type) {
    const form = b.closest('form')!, p: 'q' | 'm' = form.id === 'quick' ? 'q' : 'm', st = p === 'q' ? ui.quick : ui.sheet;
    const ty = TYPES[b.dataset.type as Task['type']];
    st.type = b.dataset.type as Task['type']; st.unit = ty.unit; st.per = String(ty.per);
    form.querySelectorAll('[data-type]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    (document.getElementById(`${p}-unit`) as HTMLSelectElement).value = ty.unit;
    (document.getElementById(`${p}-per`) as HTMLInputElement).value = String(ty.per);
    document.getElementById(`${p}-hint`)!.textContent = ty.hint;
    calc(p);
    return;
  }
  const act = b.dataset.act!, id = Number(b.dataset.id), r = route(), t = r.v === 'guide' ? byId(r.id) : undefined;
  switch (act) {
    case 'new': openSheet(null); break;
    case 'done': { const x = byId(id)!; patch(id, { done: true, doneAt: Date.now() }); toast(`'${x.name}' 클리어! 아카이브로 옮겼어요.`, null); break; }
    case 'undone': e.preventDefault(); patch(id, { done: false, doneAt: null }); break;
    case 'edit': openSheet(byId(id)!); break;
    case 'del': { const x = byId(id)!; removeWithUndo(y => y.id === id, `'${x.name}' 과제를 삭제했어요.`); if (r.v === 'guide') location.hash = 'dashboard'; break; }
    case 'clearSamples': { const n = data.tasks.filter(x => x.sample).length; removeWithUndo(x => !!x.sample, `예시 과제 ${n}개를 지웠어요.`); break; }
    case 'loadSamples': setTasks([...data.tasks.filter(x => !x.sample), ...sampleTasks(nextId())]); location.hash = 'dashboard'; render(); break;
    case 'selAll': { const done = data.tasks.filter(x => x.done); const all = done.every(x => ui.sel[x.id]); ui.sel = {}; if (!all) done.forEach(x => { ui.sel[x.id] = true; }); render(); break; }
    case 'delSel': { const n = data.tasks.filter(x => x.done && ui.sel[x.id]).length; removeWithUndo(x => x.done && !!ui.sel[x.id], `완료한 과제 ${n}개를 삭제했어요.`); break; }
    case 'addIssue': if (t) addIssue(t); break;
    case 'rmIssue': if (t) patch(t.id, { issues: (t.issues || []).filter((_, i) => i !== Number(b.dataset.i)) }); break;
    case 'rmFile': if (t) patch(t.id, { files: (t.files || []).filter((_, i) => i !== Number(b.dataset.i)) }); break;
    case 'notifyOn': {
      const p = await askPermission();
      data.settings.notify = p === 'granted';
      persist(); render();
      if (p === 'granted') { await show('알림이 켜졌어요', '마감 24시간 전과 시작 마지노선 무렵에 알려 드릴게요.', 'welcome'); checkReminders(); }
      break;
    }
    case 'notifyOff': data.settings.notify = false; persist(); render(); break;
    case 'notifyTest': await show('과제 타이머 알림 시험', '이렇게 알림이 와요.', 'test'); break;
    case 'ics': {
      const n = data.tasks.filter(x => !x.done && x.due > Date.now()).length;
      if (!n) { toast('캘린더에 넣을 진행 중인 과제가 없어요.', null); break; }
      download('과제타이머-마감.ics', buildIcs(data.tasks), 'text/calendar');
      toast(`과제 ${n}개를 캘린더 파일로 저장했어요. 파일을 열어 캘린더에 추가하세요.`, null);
      break;
    }
    case 'export': download(`과제타이머-백업-${toLocalInput(Date.now()).slice(0, 10)}.json`, exportBackup(data), 'application/json'); toast(`과제 ${data.tasks.length}개를 백업 파일로 저장했어요.`, null); break;
    case 'importMerge': case 'importReplace': {
      const list = ui.pendingImport || [];
      const base = act === 'importReplace' ? [] : data.tasks;
      let id = Math.max(0, ...base.map(x => x.id)) + 1;
      setTasks([...base, ...list.map(x => ({ ...x, id: id++ }))], true);
      ui.pendingImport = null; ui.confirm = ''; ui.importNote = `과제 ${list.length}개를 불러왔어요.`;
      render();
      break;
    }
    case 'cancelConfirm': ui.confirm = ''; ui.pendingImport = null; ui.importNote = ''; render(); break;
    case 'askWipe': ui.confirm = 'wipe'; render(); break;
    case 'wipe': ui.confirm = ''; setTasks([]); toast('모든 과제를 지웠어요.', null); break;
    case 'install': if (ui.installEvent) { ui.installEvent.prompt(); ui.installEvent = null; render(); } break;
  }
});

document.addEventListener('change', async e => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.sel) { ui.sel[Number(el.dataset.sel)] = el.checked; render(); return; }
  const r = route();
  if (el.dataset.check !== undefined && r.v === 'guide' && ui.guide) {
    const t = byId(r.id)!, c = ui.guide.checklist[Number(el.dataset.check)];
    patch(t.id, { checks: { ...(t.checks || {}), [c]: el.checked } });
    return;
  }
  if (el.id === 'wFile' && r.v === 'guide') { const files = Array.from(el.files || []); el.value = ''; addFiles(r.id, files); return; }
  if (el.id === 'importFile') {
    const f = el.files?.[0]; el.value = '';
    if (!f) return;
    try {
      ui.pendingImport = parseBackup(await f.text());
      ui.confirm = 'import';
      ui.importNote = `백업 파일에서 과제 ${ui.pendingImport.length}개를 찾았어요. 어떻게 불러올까요?`;
    } catch (err) {
      ui.confirm = ''; ui.importNote = (err as Error).message;
    }
    render();
  }
});

document.addEventListener('input', e => {
  const el = e.target as HTMLInputElement;
  const m = /^(q|m)-(name|subject|due|amount|unit|per)$/.exec(el.id || '');
  if (m) {
    (m[1] === 'q' ? ui.quick : ui.sheet)[m[2] as keyof FormData] = el.value as never;
    if (m[2] === 'amount' || m[2] === 'per') calc(m[1] as 'q' | 'm');
  }
  if (el.id === 'wContent') {
    const r = route();
    if (r.v !== 'guide') return;
    clearTimeout((window as any).__ct);
    (window as any).__ct = setTimeout(() => { patch(r.id, { content: el.value, sample: false }, true); render(); }, 500);
  }
});

document.addEventListener('keydown', e => {
  const el = e.target as HTMLElement;
  if (e.key === 'Enter' && el.id === 'wIssue') { e.preventDefault(); const r = route(); if (r.v === 'guide') addIssue(byId(r.id)!); }
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const id = (e.target as HTMLElement).id;
  if (id === 'quick') submit('q'); else if (id === 'sheetForm') submit('m');
});

['dragover', 'dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  const d = (e.target as HTMLElement).closest?.('#drop');
  if (!d) return;
  e.preventDefault();
  d.classList.toggle('on', ev === 'dragover');
  const r = route();
  if (ev === 'drop' && r.v === 'guide') addFiles(r.id, Array.from((e as DragEvent).dataTransfer?.files || []));
}));

$('#newBtn').addEventListener('click', () => openSheet(null));
$('#fab').addEventListener('click', () => openSheet(null));
$('#sheet').addEventListener('click', e => { if ((e.target as HTMLElement).id === 'sheet') closeSheet(); });
$('#undoBtn').addEventListener('click', () => {
  if (!ui.undo) return;
  clearTimeout(toastTimer);
  setTasks([...data.tasks, ...ui.undo]);
  ui.undo = null;
  $('#toast').hidden = true;
});
window.addEventListener('hashchange', () => { ui.viewKey = ''; ui.confirm = ''; render(); window.scrollTo(0, 0); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ui.installEvent = e; if (route().v === 'settings') render(); });

/* ---------- start ---------- */

function tick() {
  const a = document.activeElement as HTMLElement | null;
  const typing = !!a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('#view').contains(a);
  if (typing || !$('#sheet').hidden) header(Date.now());
  else render();
  checkReminders();
}

(async () => {
  const res = await load();
  data = res.data;
  ui.durable = res.durable;
  ui.migrated = res.migrated;
  banners();
  render();
  if (data.tasks.length) requestPersistence();
  setInterval(tick, 60000);
  setInterval(() => header(Date.now()), 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  checkReminders();
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();

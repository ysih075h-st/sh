import { get, set } from 'idb-keyval';
import type { Task, TaskFile, TaskType } from './types';
import { TYPES } from './types';
import { analyzeText } from '../analysis/text';

export interface Settings { notify: boolean }
export interface Saved { version: 2; tasks: Task[]; settings: Settings }

const KEY = 'assignment-timer-v2';
const LEGACY_KEYS = ['assignment-timer-site-v1', 'assignment-timer-tasks'];
const DEFAULT: Saved = { version: 2, tasks: [], settings: { notify: false } };

const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

function normalizeFile(raw: any): TaskFile | null {
  if (!raw || typeof raw !== 'object' || !raw.name) return null;
  const f: TaskFile = { name: str(raw.name, 200), size: num(raw.size), kind: raw.kind === 'text' ? 'text' : 'other' };
  if (raw.why) f.why = raw.why;
  if (raw.auto && raw.auto.req && Array.isArray(raw.auto.sentences)) f.auto = raw.auto;
  else if (typeof raw.text === 'string' && raw.text.length > 20) { f.auto = analyzeText(raw.text); f.kind = 'text'; } // first-draft format kept the raw text
  else if (f.kind === 'text') f.kind = 'other';
  return f;
}

/** Accepts tasks from this version, the first web draft and hand-edited backups; drops anything unusable. */
export function normalizeTask(raw: any, id: number): Task | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = str(raw.name, 60).trim();
  const due = typeof raw.due === 'string' ? Date.parse(raw.due) : num(raw.due, NaN);
  if (!name || !isFinite(due)) return null;
  const type: TaskType = (Object.keys(TYPES) as TaskType[]).includes(raw.type) ? raw.type : raw.type === 'PPT 발표' ? 'PPT' : '기타';
  return {
    id,
    type,
    subject: str(raw.subject, 40),
    name,
    due,
    amount: Math.max(0, num(raw.amount)),
    unit: str(raw.unit, 10) || TYPES[type].unit,
    per: Math.max(0, num(raw.per ?? raw.rate)),
    done: !!raw.done,
    doneAt: raw.done ? num(raw.doneAt ?? (raw.completedAt ? Date.parse(raw.completedAt) : NaN), Date.now()) : null,
    created: num(raw.created, Date.now()),
    content: str(raw.content, 20000) || undefined,
    issues: Array.isArray(raw.issues) ? raw.issues.map((x: unknown) => str(x, 80)).filter(Boolean).slice(0, 8) : [],
    files: Array.isArray(raw.files) ? raw.files.map(normalizeFile).filter(Boolean) as TaskFile[] : [],
    checks: raw.checks && typeof raw.checks === 'object' ? raw.checks : {},
    notified: raw.notified && typeof raw.notified === 'object' ? raw.notified : {},
    sample: !!raw.sample
  };
}

function normalizeAll(list: unknown[]): Task[] {
  const out: Task[] = [];
  list.forEach((raw, i) => { const t = normalizeTask(raw, i + 1); if (t) out.push(t); });
  return out;
}

export interface Loaded { data: Saved; durable: boolean; migrated: boolean }

export async function load(): Promise<Loaded> {
  try {
    const saved = await get<Saved>(KEY);
    if (saved && Array.isArray(saved.tasks)) return { data: { ...DEFAULT, ...saved, tasks: normalizeAll(saved.tasks) }, durable: true, migrated: false };
    for (const k of LEGACY_KEYS) {
      let raw: string | null = null;
      try { raw = localStorage.getItem(k); } catch { /* storage blocked */ }
      if (!raw) continue;
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length) {
        const data: Saved = { ...DEFAULT, tasks: normalizeAll(list.filter((t: any) => !t.sample)) };
        await set(KEY, data);
        return { data, durable: true, migrated: data.tasks.length > 0 };
      }
    }
    return { data: { ...DEFAULT }, durable: true, migrated: false };
  } catch {
    return { data: { ...DEFAULT }, durable: false, migrated: false };
  }
}

export async function save(data: Saved): Promise<boolean> {
  try { await set(KEY, data); return true; } catch { return false; }
}

/** Ask the browser not to evict our data under storage pressure (granted silently for installed apps). */
export async function requestPersistence(): Promise<boolean> {
  try { return !!(await navigator.storage?.persist?.()); } catch { return false; }
}

/* ---------- backup ---------- */

export function exportBackup(data: Saved): string {
  return JSON.stringify({ app: '과제 타이머', version: 2, exportedAt: new Date().toISOString(), tasks: data.tasks }, null, 2);
}

export function parseBackup(text: string): Task[] {
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new Error('백업 파일을 읽지 못했어요. 과제 타이머에서 저장한 .json 파일인지 확인해 주세요.'); }
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.tasks) ? raw.tasks : null;
  if (!list) throw new Error('이 파일에는 과제 목록이 없어요.');
  const tasks = normalizeAll(list);
  if (!tasks.length) throw new Error('불러올 수 있는 과제가 없어요. 과제마다 이름과 마감일이 있어야 해요.');
  return tasks;
}

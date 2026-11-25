import type { Task } from './types';
import { H, MIN, fmtNeed } from './format';

export const HORIZON = 168 * H;

export interface Status {
  left: number;      // ms until the deadline
  needMs: number;    // estimated work time in ms (0 when no amount was given)
  hasNeed: boolean;
  slack: number;     // left − needMs: the time you can still afford not to start
  zero: number;      // latest start time = due − needMs
  hp: number;        // 0..100, from slack over a 7-day horizon
  level: 'safe' | 'warn' | 'crit' | 'over' | 'done';
  motion: '' | 'pulse' | 'shake';
  short: boolean;    // even starting now is too late
}

export const needMinutes = (t: Pick<Task, 'amount' | 'per'>) => (t.amount > 0 && t.per > 0 ? t.amount * t.per : 0);

/**
 * HP is driven by slack, not by raw time left: a 40-hour report due in 3 days is in more danger
 * than a 1-hour quiz due tomorrow, and the bar should say so.
 */
export function status(t: Task, now = Date.now()): Status {
  const left = t.due - now;
  const needMs = needMinutes(t) * MIN;
  const slack = left - needMs;
  const zero = t.due - needMs;
  const over = !t.done && left <= 0;
  const hp = t.done ? 100 : over ? 0 : Math.max(0, Math.min(100, Math.round((slack / HORIZON) * 100)));
  const level: Status['level'] = t.done ? 'done' : over ? 'over' : hp > 50 ? 'safe' : hp >= 20 ? 'warn' : 'crit';
  const motion: Status['motion'] = t.done || over ? '' : slack <= 6 * H ? 'shake' : slack <= 24 * H ? 'pulse' : '';
  return { left, needMs, hasNeed: needMs > 0, slack, zero, hp, level, motion, short: !t.done && !over && needMs > 0 && slack < 0 };
}

/** Active tasks in the order they must be started (latest start time first), overdue last. */
export function sortActive(tasks: Task[], now = Date.now()): Task[] {
  return tasks
    .filter(t => !t.done)
    .map(t => ({ t, s: status(t, now) }))
    .sort((a, b) => Number(a.s.level === 'over') - Number(b.s.level === 'over') || a.s.zero - b.s.zero || a.t.due - b.t.due)
    .map(x => x.t);
}

export interface Emergency { task: Task; why: string; key: number }

/** Tasks to start right now: latest start within 3 hours, or due within 24 hours when the work size is unknown. */
export function emergencies(tasks: Task[], now = Date.now(), max = 3): Emergency[] {
  const out: Emergency[] = [];
  for (const t of tasks) {
    if (t.done) continue;
    const s = status(t, now);
    if (s.level === 'over') continue;
    if (s.hasNeed && s.slack <= 3 * H) {
      out.push({ task: t, key: s.slack, why: s.slack < 0 ? `지금 시작해도 ${fmtNeed(Math.ceil(-s.slack / MIN))} 모자라요` : `${fmtNeed(Math.max(1, Math.floor(s.slack / MIN)))} 안에 시작해야 해요` });
    } else if (!s.hasNeed && s.left <= 24 * H) {
      out.push({ task: t, key: s.left, why: `마감까지 ${fmtNeed(Math.floor(s.left / MIN))} 남았어요` });
    }
  }
  return out.sort((a, b) => a.key - b.key).slice(0, max);
}

import type { Task } from './domain/types';
import { status } from './domain/urgency';
import { fmtNeed, fmtWhen, H, MIN } from './domain/format';
import { particle } from './domain/josa';

export type Perm = NotificationPermission | 'unsupported';

export const permission = (): Perm => ('Notification' in window ? Notification.permission : 'unsupported');

export async function askPermission(): Promise<Perm> {
  if (!('Notification' in window)) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

export async function show(title: string, body: string, tag: string): Promise<void> {
  if (permission() !== 'granted') return;
  const opts: NotificationOptions = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch { /* fall back below */ }
  try { new Notification(title, opts); } catch { /* some mobile browsers only allow service-worker notifications */ }
}

export interface Pending { task: Task; key: 'd24' | 'h3' | 'zero'; title: string; body: string }

/** Reminders that are due now and have not been sent for this task yet. */
export function pendingReminders(tasks: Task[], now = Date.now()): Pending[] {
  const out: Pending[] = [];
  for (const t of tasks) {
    if (t.done || t.sample) continue;
    const s = status(t, now);
    if (s.left <= 0) continue;
    const sent = t.notified || {};
    const name = t.name;
    if (s.hasNeed && s.slack <= 0 && !sent.zero) out.push({ task: t, key: 'zero', title: `${name} 지금 시작해야 해요`, body: `시작 마지노선이 지났어요. 남은 ${fmtNeed(s.left / MIN)} 안에 ${fmtNeed(s.needMs / MIN)} 분량을 끝내야 해요.` });
    else if (s.hasNeed && s.slack <= 3 * H && !sent.h3 && !sent.zero) out.push({ task: t, key: 'h3', title: `${name} 곧 시작하세요`, body: `${fmtWhen(s.zero)}까지 시작해야 마감에 맞출 수 있어요.` });
    if (s.left <= 24 * H && !sent.d24) out.push({ task: t, key: 'd24', title: `${name}${particle(name, '은/는')} 내일 마감이에요`, body: `마감 ${fmtWhen(t.due)}, ${fmtNeed(s.left / MIN)} 남았어요.` });
  }
  return out;
}

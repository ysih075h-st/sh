import type { Task } from './types';
import { status } from './urgency';
import { fmtNeed, MIN } from './format';

const utc = (ts: number) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Lines longer than 75 octets must be folded (RFC 5545). */
const fold = (line: string) => {
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
};

/**
 * A calendar file with each deadline and two reminders (24 hours before, and at the latest start time),
 * so reminders reach the phone even when this site is closed.
 */
export function buildIcs(tasks: Task[], now = Date.now()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//assignment-timer//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:과제 타이머'];
  for (const t of tasks) {
    if (t.done || t.due <= now) continue;
    const s = status(t, now);
    const desc = [t.subject && `과목: ${t.subject}`, s.hasNeed && `예상 소요: ${fmtNeed(s.needMs / MIN)}`, s.hasNeed && '두 번째 알림은 시작 마지노선(마감 − 예상 소요)에 울려요.'].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:task-${t.id}-${t.created}@assignment-timer`, `DTSTAMP:${utc(now)}`, `DTSTART:${utc(t.due - 30 * MIN)}`, `DTEND:${utc(t.due)}`,
      `SUMMARY:${esc(`[마감] ${t.subject ? t.subject + ' · ' : ''}${t.name}`)}`, `DESCRIPTION:${esc(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${t.name} 마감 24시간 전`)}`, 'TRIGGER:-PT1410M', 'END:VALARM');
    if (s.hasNeed && s.zero - 3 * 60 * MIN > now) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${t.name} 지금 시작해야 해요`)}`, `TRIGGER;VALUE=DATE-TIME:${utc(s.zero)}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

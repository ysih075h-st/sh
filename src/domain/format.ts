export const MIN = 60000;
export const H = 60 * MIN;
export const DAY = 24 * H;

const pad = (n: number) => String(n).padStart(2, '0');
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 90 → "1시간 30분", 45 → "45분", 120 → "2시간" */
export function fmtNeed(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), r = m % 60;
  if (h && r) return `${h}시간 ${r}분`;
  if (h) return `${h}시간`;
  return `${r}분`;
}

/** Remaining time: "D-2 · 14시간 32분 남음" or "3시간 5분 남음" */
export function fmtLeft(ms: number): string {
  const m = Math.max(0, Math.floor(ms / MIN));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), r = m % 60;
  return d > 0 ? `D-${d} · ${h}시간 ${r}분 남음` : `${h}시간 ${r}분 남음`;
}

/** "11/5(목) 21:00" */
export function fmtWhen(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Deadline presets students use most: tonight, tomorrow night, this Friday night, a week from now. */
export function deadlinePresets(now = Date.now()): { label: string; ts: number }[] {
  const at2359 = (offsetDays: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offsetDays);
    d.setHours(23, 59, 0, 0);
    return d.getTime();
  };
  const today = new Date(now).getDay();
  let toFri = (5 - today + 7) % 7;
  if (toFri === 0 && at2359(0) <= now) toFri = 7;
  const out = [
    { label: '오늘 23:59', ts: at2359(0) },
    { label: '내일 23:59', ts: at2359(1) },
    { label: toFri === 0 ? '오늘(금) 23:59' : `금요일 23:59`, ts: at2359(toFri) },
    { label: '일주일 뒤', ts: at2359(7) }
  ];
  return out.filter((p, i) => p.ts > now && out.findIndex(q => q.ts === p.ts) === i);
}

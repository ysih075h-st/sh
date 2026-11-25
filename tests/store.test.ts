import { describe, expect, it } from 'vitest';
import { normalizeTask, parseBackup, exportBackup } from '../src/domain/store';
import { buildIcs } from '../src/domain/ics';

describe('backup', () => {
  it('round-trips and migrates first-draft tasks', () => {
    const old = { id: 7, type: 'PPT', name: '발표', due: Date.parse('2026-12-01T10:00:00Z'), amount: '10', unit: '장', per: 20, done: false,
      files: [{ name: 'a.txt', size: 10, kind: 'text', text: '탄소세는 탄소 배출량에 비례해 세금을 매기는 제도이다. 배출권 거래제는 배출량을 고정한다.' }] };
    const t = normalizeTask(old, 1)!;
    expect(t.amount).toBe(10);
    expect(t.subject).toBe('');
    expect(t.files![0].auto!.sentences.length).toBeGreaterThan(0);
    const back = parseBackup(exportBackup({ version: 2, tasks: [t], settings: { notify: false } }));
    expect(back[0].name).toBe('발표');
  });
  it('rejects files that are not backups, with a readable message', () => {
    expect(() => parseBackup('hello')).toThrow(/백업 파일을 읽지 못했어요/);
    expect(() => parseBackup('{"tasks":[{"name":""}]}')).toThrow(/불러올 수 있는 과제가 없어요/);
  });
});

describe('calendar export', () => {
  it('writes an event with reminders for each upcoming task', () => {
    const now = Date.parse('2026-11-28T00:00:00Z');
    const ics = buildIcs([normalizeTask({ name: '보고서, 최종', subject: '경제', due: Date.parse('2026-12-01T14:59:00Z'), amount: 6, per: 60 }, 1)!], now);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTEND:20261201T145900Z');
    expect(ics).toContain('보고서\\, 최종');
    expect(ics).toContain('TRIGGER;VALUE=DATE-TIME:20261201T085900Z');
    expect(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});

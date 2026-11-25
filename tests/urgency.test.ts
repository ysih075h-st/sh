import { describe, expect, it } from 'vitest';
import { emergencies, sortActive, status } from '../src/domain/urgency';
import type { Task } from '../src/domain/types';

const H = 3600000, NOW = Date.parse('2026-11-28T12:00:00+09:00');
const t = (o: Partial<Task>): Task => ({ id: 1, type: '보고서', subject: '', name: 'x', due: NOW + 24 * H, amount: 0, unit: '쪽', per: 0, done: false, created: NOW - H, ...o });

describe('status', () => {
  it('HP follows slack, not raw time left', () => {
    const big = status(t({ due: NOW + 72 * H, amount: 40, per: 60 }), NOW); // 40h of work, 72h left
    const small = status(t({ due: NOW + 24 * H, amount: 1, per: 60 }), NOW); // 1h of work, 24h left
    expect(big.slack).toBe(32 * H);
    expect(big.hp).toBe(19);
    expect(big.level).toBe('crit');
    expect(small.hp).toBe(14);
  });
  it('a task with no work size uses time left', () => {
    expect(status(t({ due: NOW + 84 * H }), NOW).hp).toBe(50);
  });
  it('overdue and short states', () => {
    expect(status(t({ due: NOW - H }), NOW).level).toBe('over');
    const s = status(t({ due: NOW + 2 * H, amount: 3, per: 60 }), NOW);
    expect(s.short).toBe(true);
    expect(s.motion).toBe('shake');
  });
});

describe('ordering', () => {
  it('sorts by latest start time and puts overdue last', () => {
    const a = t({ id: 1, name: 'a', due: NOW + 48 * H, amount: 40, per: 60 }); // start by now+8h
    const b = t({ id: 2, name: 'b', due: NOW + 20 * H });                      // start by now+20h
    const c = t({ id: 3, name: 'c', due: NOW - H });
    expect(sortActive([c, b, a], NOW).map(x => x.name)).toEqual(['a', 'b', 'c']);
  });
  it('emergency box: start within 3h, or due within 24h when size unknown', () => {
    const e = emergencies([
      t({ id: 1, name: 'soon', due: NOW + 5 * H, amount: 3, per: 60 }),   // slack 2h
      t({ id: 2, name: 'late', due: NOW + 2 * H, amount: 3, per: 60 }),   // slack −1h
      t({ id: 3, name: 'nosize', due: NOW + 10 * H }),
      t({ id: 4, name: 'fine', due: NOW + 100 * H, amount: 2, per: 60 })
    ], NOW);
    expect(e.map(x => x.task.name)).toEqual(['late', 'soon', 'nosize']);
    expect(e[0].why).toBe('지금 시작해도 1시간 모자라요');
  });
});

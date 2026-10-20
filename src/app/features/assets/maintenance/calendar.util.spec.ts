import { describe, it, expect } from 'vitest';
import { buildMonthGrid, gridRange } from './calendar.util';

describe('buildMonthGrid', () => {
  it('arma semanas completas de lunes a domingo que cubren el mes', () => {
    // Octubre 2026: el 1 es jueves y el 31 es sábado.
    const weeks = buildMonthGrid(new Date(2026, 9, 1), new Date(2026, 9, 17));

    expect(weeks.every(w => w.length === 7)).toBe(true);
    expect(weeks[0][0].date).toBe('2026-09-28');
    expect(weeks[0][3]).toMatchObject({ date: '2026-10-01', inMonth: true });
    expect(weeks[weeks.length - 1][6].date).toBe('2026-11-01');
    expect(gridRange(weeks)).toEqual({ from: '2026-09-28', to: '2026-11-01' });
  });

  it('marca el día de hoy y los días fuera del mes', () => {
    const days = buildMonthGrid(new Date(2026, 9, 1), new Date(2026, 9, 17)).flat();

    expect(days.filter(d => d.isToday).map(d => d.date)).toEqual(['2026-10-17']);
    expect(days.find(d => d.date === '2026-09-30')?.inMonth).toBe(false);
  });

  it('un mes que empieza en lunes no agrega días previos', () => {
    // Junio 2026 empieza en lunes.
    expect(buildMonthGrid(new Date(2026, 5, 1))[0][0].date).toBe('2026-06-01');
  });
});

import { toApiDate } from '../assets.models';

export interface CalendarDay {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

/**
 * Semanas (lunes a domingo) que cubren el mes de `month`, para pintar un
 * calendario mensual. Siempre devuelve semanas completas.
 */
export function buildMonthGrid(month: Date, today: Date = new Date()): CalendarDay[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const todayKey = toApiDate(today);

  // Lunes en o antes del día 1 y domingo en o después del último día.
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const end = new Date(last);
  end.setDate(last.getDate() + ((7 - last.getDay()) % 7));

  const weeks: CalendarDay[][] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (cursor.getDay() === 1) weeks.push([]);
    const key = toApiDate(cursor)!;
    weeks[weeks.length - 1].push({
      date: key,
      day: cursor.getDate(),
      inMonth: cursor.getMonth() === month.getMonth(),
      isToday: key === todayKey,
    });
  }

  return weeks;
}

/** Primer y último día (YYYY-MM-DD) visibles en la grilla del mes. */
export function gridRange(weeks: CalendarDay[][]): { from: string; to: string } {
  return { from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date };
}

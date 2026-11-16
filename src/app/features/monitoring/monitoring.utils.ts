import { CalibrationStatus, ZoneType } from './monitoring.service';

/** Condición que debe cumplir cada tipo de zona (se muestra en las tarjetas). */
export const ZONE_TYPE_META: Record<ZoneType, { label: string; condition: string; icon: string }> = {
  ambient:    { label: 'Ambiente',    condition: 'Temperatura ambiente',     icon: 'thermostat' },
  cold:       { label: 'Refrigerado', condition: 'Cadena de frío',           icon: 'ac_unit' },
  frozen:     { label: 'Congelado',   condition: 'Congelación',              icon: 'severe_cold' },
  controlled: { label: 'Controlado',  condition: 'Condiciones controladas',  icon: 'tune' },
};

export const SENSOR_TYPE_LABELS: Record<string, string> = {
  temperature: 'Temperatura',
  humidity: 'Humedad',
};

/** Unidad sugerida al elegir el tipo de equipo. */
export const DEFAULT_UNITS: Record<string, string> = {
  temperature: '°C',
  humidity: '%',
};

export const CALIBRATION_STATUS_META: Record<CalibrationStatus | 'replaced', { label: string; icon: string; css: string }> = {
  valid:    { label: 'Vigente',         icon: 'verified',        css: 'cal--valid' },
  expiring: { label: 'Por vencer',      icon: 'schedule',        css: 'cal--expiring' },
  expired:  { label: 'Vencido',         icon: 'error',           css: 'cal--expired' },
  missing:  { label: 'Sin certificado', icon: 'help_outline',    css: 'cal--missing' },
  replaced: { label: 'Reemplazado',     icon: 'history',         css: 'cal--replaced' },
};

interface ZoneRanges {
  temp_min: number | null; temp_max: number | null;
  humidity_min: number | null; humidity_max: number | null;
}

function range(min: number | null, max: number | null, unit: string): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${+min} – ${+max} ${unit}`;
  return min != null ? `≥ ${+min} ${unit}` : `≤ ${+max!} ${unit}`;
}

export function tempRange(z: ZoneRanges): string | null {
  return range(z.temp_min, z.temp_max, '°C');
}

export function humidityRange(z: ZoneRanges): string | null {
  return range(z.humidity_min, z.humidity_max, '%HR');
}

/** Rango aplicable a un tipo de equipo (temperatura o humedad). */
export function rangeForType(z: ZoneRanges | null | undefined, type: string): string | null {
  if (!z) return null;
  return type === 'humidity' ? humidityRange(z) : tempRange(z);
}

/** Texto corto de días restantes del certificado. */
export function daysLeftLabel(days: number | null | undefined): string {
  if (days == null) return '';
  if (days < 0) return `venció hace ${Math.abs(days)} día(s)`;
  if (days === 0) return 'vence hoy';
  return `vence en ${days} día(s)`;
}

/** Fecha LOCAL en formato YYYY-MM-DD (no UTC). */
export function localDateStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Mensajes de error de una respuesta HTTP (422 o 409). */
export function httpErrors(err: { status?: number; error?: { errors?: Record<string, string[]>; message?: string } }): string[] {
  if (err.status === 422 && err.error?.errors) return Object.values(err.error.errors).flat();
  return [err.error?.message || 'No fue posible completar la operación.'];
}

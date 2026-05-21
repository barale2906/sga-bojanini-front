import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'dateFormat',
  standalone: true,
})
export class DateFormatPipe implements PipeTransform {
  transform(value: string | null | undefined, format: 'date' | 'datetime' | 'relative' = 'date'): string {
    if (!value) return '—';

    const date = new Date(value);
    if (isNaN(date.getTime())) return value;

    const options: Intl.DateTimeFormatOptions =
      format === 'datetime'
        ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: '2-digit', year: 'numeric' };

    if (format === 'relative') {
      return this.toRelative(date);
    }

    return date.toLocaleDateString('es-CO', options);
  }

  private toRelative(date: Date): string {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Ahora mismo';
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `Hace ${days} días`;
    return date.toLocaleDateString('es-CO');
  }
}

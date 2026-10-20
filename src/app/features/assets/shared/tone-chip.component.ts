import { Component, Input } from '@angular/core';
import { StatusTone } from '../assets.models';

/** Chip de estado con color semántico. */
@Component({
  selector: 'app-tone-chip',
  standalone: true,
  template: `<span class="chip chip--{{ tone }}">{{ label }}</span>`,
  styles: [`
    .chip { display:inline-flex; align-items:center; padding:0.15rem 0.6rem; border-radius:9999px;
            font-size:0.75rem; font-weight:600; white-space:nowrap; }
    .chip--ok    { background:#c6f6d5; color:#276749; }
    .chip--warn  { background:#feebc8; color:#9c4221; }
    .chip--bad   { background:#fed7d7; color:#c53030; }
    .chip--info  { background:#bee3f8; color:#2c5282; }
    .chip--muted { background:#e2e8f0; color:#4a5568; }
  `],
})
export class ToneChipComponent {
  @Input({ required: true }) label = '';
  @Input() tone: StatusTone = 'muted';
}

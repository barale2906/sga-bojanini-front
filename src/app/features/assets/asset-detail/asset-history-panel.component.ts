import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AssetsService } from '../assets.service';
import { AssetLocationSegment, AssetMovement } from '../assets.models';

/** Historial de ubicaciones (tramos) y bitácora de eventos del activo. */
@Component({
  selector: 'app-asset-history-panel',
  standalone: true,
  imports: [DatePipe, MatIconModule, MatButtonModule],
  template: `
    <div class="history-grid">
      <section>
        <h3><mat-icon>place</mat-icon> Historial de ubicaciones</h3>
        <ol class="timeline">
          @for (s of locations(); track s.id) {
            <li [class.current]="s.is_current" [class.off]="s.is_off_premises">
              <div class="t-title">{{ s.location }} @if (s.is_current) { <span class="now">Actual</span> }</div>
              <div class="t-meta">
                {{ s.from_date | date:'dd/MM/yyyy HH:mm' }} → {{ s.to_date ? (s.to_date | date:'dd/MM/yyyy HH:mm') : 'hoy' }}
                · {{ s.transfer_label ?? 'Registro inicial' }} · {{ s.assigned_by?.name }}
              </div>
            </li>
          }
        </ol>
      </section>
      <section>
        <h3><mat-icon>history</mat-icon> Bitácora</h3>
        <ol class="timeline">
          @for (m of movements(); track m.id) {
            <li>
              <div class="t-title">{{ m.type_label }}
                @if (m.to_status_label) { <span class="status-change">{{ m.from_status_label ?? '—' }} → {{ m.to_status_label }}</span> }
              </div>
              @if (m.description) { <div class="t-desc">{{ m.description }}</div> }
              <div class="t-meta">{{ m.created_at | date:'dd/MM/yyyy HH:mm' }} · {{ m.user?.name }}</div>
            </li>
          }
        </ol>
        @if (hasMore()) {
          <button mat-button color="primary" (click)="loadMovements(page() + 1)">Ver más</button>
        }
      </section>
    </div>
  `,
  styles: [`
    .history-grid { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; }
    @media (max-width: 960px) { .history-grid { grid-template-columns:1fr; } }
    h3 { display:flex; align-items:center; gap:0.4rem; margin:0 0 0.75rem; font-size:1rem; color:#2d3748; }
    h3 mat-icon { color:#C02F86; }
    .timeline { list-style:none; margin:0; padding:0 0 0 1rem; border-left:2px solid #e2e8f0; }
    .timeline li { position:relative; padding:0 0 0.9rem 0.75rem; }
    .timeline li::before { content:''; position:absolute; left:-1.42rem; top:0.3rem; width:10px; height:10px; border-radius:50%; background:#cbd5e0; }
    .timeline li.current::before { background:#C02F86; }
    .timeline li.off::before { background:#dd6b20; }
    .t-title { font-weight:600; color:#2d3748; font-size:0.88rem; }
    .t-desc { font-size:0.82rem; color:#4a5568; margin-top:0.1rem; }
    .t-meta { font-size:0.75rem; color:#718096; margin-top:0.15rem; }
    .now { background:#fdf2f8; color:#97266d; border-radius:9999px; padding:0 0.5rem; font-size:0.7rem; margin-left:0.3rem; }
    .status-change { font-weight:400; font-size:0.78rem; color:#4a5568; margin-left:0.4rem; }
  `],
})
export class AssetHistoryPanelComponent implements OnInit {
  private svc = inject(AssetsService);

  @Input({ required: true }) assetId!: number;

  locations = signal<AssetLocationSegment[]>([]);
  movements = signal<AssetMovement[]>([]);
  page = signal(1);
  hasMore = signal(false);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.svc.locationHistory(this.assetId).subscribe({ next: res => this.locations.set(res.data) });
    this.movements.set([]);
    this.loadMovements(1);
  }

  loadMovements(page: number): void {
    this.svc.movements(this.assetId, page).subscribe({
      next: res => {
        this.movements.update(list => (page === 1 ? res.data : [...list, ...res.data]));
        this.page.set(res.meta.current_page);
        this.hasMore.set(res.meta.current_page < res.meta.last_page);
      },
    });
  }
}

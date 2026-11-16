import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LastReading, MonitoringService, Sensor } from '../monitoring.service';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';
import { rangeForType } from '../monitoring.utils';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

/**
 * Retorna la fecha/hora LOCAL del navegador en formato YYYY-MM-DDTHH:mm
 * compatible con input[type=datetime-local].
 * NO usa toISOString() porque ese método devuelve UTC, lo que causa
 * que el campo muestre 5 horas más en Colombia (UTC-5).
 */
function localDatetimeString(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

@Component({
  selector: 'app-reading-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, FormErrorsComponent, DateFormatPipe],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>add_chart</mat-icon>
      Registrar Lectura — {{ data.sensor.name }}
    </h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>

      @if (alerts().length > 0) {
        <div class="alerts-box">
          <strong>⚠️ ¡Alertas generadas!</strong>
          @for (a of alerts(); track a.message) {
            <div class="alert-item" [class.critical]="a.severity === 'critical'">
              <mat-icon>{{ a.severity === 'critical' ? 'error' : 'warning' }}</mat-icon>
              <span>{{ a.message }}</span>
            </div>
          }
        </div>
      }

      <!-- Último registro del equipo -->
      <div class="last" [class.last--none]="!loadingLast() && !last()">
        <mat-icon>history</mat-icon>
        @if (loadingLast()) {
          <span>Consultando último registro…</span>
        } @else if (last(); as l) {
          <span>
            Último registro: <strong>{{ l.recorded_at | dateFormat:'datetime' }}</strong>
            · {{ l.value }} {{ data.sensor.unit }}
            @if (l.user_name) { · por {{ l.user_name }} }
            @if (l.reading_source === 'iot') { · automático (IoT) }
            <br><small>{{ l.recorded_at | dateFormat:'relative' }}</small>
          </span>
        } @else {
          <span>Este equipo aún no tiene registros.</span>
        }
      </div>

      @if (range) {
        <p class="range">Rango permitido de la zona: <strong>{{ range }}</strong></p>
      }

      <form [formGroup]="form" class="df">
        <mat-form-field appearance="outline" class="w">
          <mat-label>Valor * ({{ data.sensor.unit }})</mat-label>
          <input matInput type="number" formControlName="value" step="0.1" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="w">
          <mat-label>Fecha y hora *</mat-label>
          <input matInput type="datetime-local" formControlName="recorded_at" />
          <mat-hint>Hora local Colombia (UTC-5)</mat-hint>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [disabled]="closing()" (click)="cancel()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving() || closing()">
        @if (saving()) { <mat-spinner diameter="18"></mat-spinner> } Registrar
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `.df { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem 0; }
     .w { width:100%; }`,
    `.alerts-box { background:#fff5f5; border:1px solid #fc8181; border-radius:8px;
       padding:0.75rem; margin-bottom:1rem; font-size:0.875rem; }`,
    `.alert-item { display:flex; gap:0.5rem; align-items:center; margin-top:0.4rem;
       color:#c53030; }`,
    `h2 mat-icon { vertical-align:middle; margin-right:0.5rem; }`,
    `.last { display:flex; gap:0.6rem; align-items:flex-start; padding:0.65rem 0.85rem; margin-bottom:0.75rem;
       border-radius:8px; background:#ebf8ff; color:#2c5282; font-size:0.85rem; line-height:1.35; }
     .last mat-icon { font-size:20px; width:20px; height:20px; flex-shrink:0; }
     .last small { opacity:0.8; }
     .last--none { background:#f7fafc; color:#718096; }
     .range { margin:0 0 0.75rem; font-size:0.8rem; color:#4a5568; }`,
  ],
})
export class ReadingFormDialogComponent implements OnInit {
  data: { sensor: Sensor; monitoringSvc: MonitoringService } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ReadingFormDialogComponent>);
  private fb = inject(FormBuilder);

  saving  = signal(false);
  closing = signal(false);
  errors  = signal<string[]>([]);
  alerts  = signal<any[]>([]);
  last    = signal<LastReading | null>(null);
  loadingLast = signal(true);
  readonly range = rangeForType(this.data.sensor.zone, this.data.sensor.type);

  ngOnInit(): void {
    // Se consulta al abrir (no se usa el dato del listado) para mostrar el
    // registro más reciente aunque otro usuario haya registrado después.
    this.data.monitoringSvc.getLatestReading(this.data.sensor.id).subscribe({
      next: r => { this.last.set(r.data ?? null); this.loadingLast.set(false); },
      error: () => { this.last.set(this.data.sensor.last_reading ?? null); this.loadingLast.set(false); },
    });
  }

  form = this.fb.group({
    value: [null as number | null, [Validators.required]],
    // Hora LOCAL del navegador — no UTC — para que coincida con Colombia (UTC-5)
    recorded_at: [localDatetimeString(), Validators.required],
  });

  cancel(): void {
    if (this.closing()) return;
    this.ref.close(false);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const v = this.form.value;

    // Enviamos la hora local con segundos (YYYY-MM-DDTHH:mm:ss)
    // El backend está configurado con timezone America/Bogota, así que
    // interpreta este string como hora colombiana.
    this.data.monitoringSvc
      .createReading(this.data.sensor.id, {
        value: v.value!,
        reading_source: 'manual',
        recorded_at: v.recorded_at! + ':00',
      })
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          if (r.data.alerts?.length) {
            this.alerts.set(r.data.alerts);
            this.closing.set(true);
            setTimeout(() => this.ref.close(true), 3000);
          } else {
            this.ref.close(true);
          }
        },
        error: (err) => {
          this.saving.set(false);
          this.errors.set(err.status === 422
            ? Object.values(err.error?.errors || {}).flat() as string[]
            : [err.error?.message || 'No fue posible registrar la lectura.']);
        },
      });
  }
}

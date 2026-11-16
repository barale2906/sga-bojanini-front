import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CalibrationCertificate, MonitoringService, Sensor } from '../monitoring.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';
import { CALIBRATION_STATUS_META, daysLeftLabel, httpErrors, localDateStr } from '../monitoring.utils';

/**
 * Certificados de calibración de un equipo: el vigente, el historial de
 * los reemplazados y la carga de uno nuevo (el anterior pasa al historial).
 * Se cierra con `true` si hubo cambios para refrescar el listado.
 */
@Component({
  selector: 'app-calibration-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatTooltipModule, MatProgressSpinnerModule,
    FormErrorsComponent, PermissionDirective, DateFormatPipe,
  ],
  templateUrl: './calibration-dialog.component.html',
  styleUrl: './calibration-dialog.component.scss',
})
export class CalibrationDialogComponent implements OnInit {
  data: { sensor: Sensor } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<CalibrationDialogComponent, boolean>);
  private svc = inject(MonitoringService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  readonly meta = CALIBRATION_STATUS_META;
  readonly daysLeftLabel = daysLeftLabel;
  readonly today = localDateStr();

  certificates = signal<CalibrationCertificate[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  errors = signal<string[]>([]);
  file = signal<File | null>(null);
  private changed = false;

  form = this.fb.group({
    expires_at: ['', Validators.required],
    calibrated_at: [''],
    certificate_number: ['', Validators.maxLength(100)],
    laboratory: ['', Validators.maxLength(150)],
    notes: ['', Validators.maxLength(1000)],
  });

  current = () => this.certificates().find(c => c.is_current) ?? null;
  history = () => this.certificates().filter(c => !c.is_current);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getCalibrations(this.data.sensor.id).subscribe({
      next: r => {
        this.certificates.set(r.data ?? []);
        this.loading.set(false);
        if (!this.current()) this.showForm.set(true);
      },
      error: () => this.loading.set(false),
    });
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
    input.value = '';
  }

  upload(): void {
    const file = this.file();
    if (this.form.invalid || !file || this.saving()) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errors.set([]);
    const v = this.form.getRawValue();
    this.svc.uploadCalibration(this.data.sensor.id, {
      file,
      expires_at: v.expires_at!,
      calibrated_at: v.calibrated_at || null,
      certificate_number: v.certificate_number?.trim() || null,
      laboratory: v.laboratory?.trim() || null,
      notes: v.notes?.trim() || null,
    }).subscribe({
      next: () => {
        this.changed = true;
        this.saving.set(false);
        this.showForm.set(false);
        this.file.set(null);
        this.form.reset({ expires_at: '', calibrated_at: '', certificate_number: '', laboratory: '', notes: '' });
        this.snack.open('Certificado cargado', 'OK', { duration: 3000 });
        this.load();
      },
      error: err => { this.saving.set(false); this.errors.set(httpErrors(err)); },
    });
  }

  download(c: CalibrationCertificate): void {
    this.svc.downloadCalibration(c).subscribe({
      error: err => this.snack.open(httpErrors(err)[0], 'OK', { duration: 4000, panelClass: 'snack-error' }),
    });
  }

  remove(c: CalibrationCertificate): void {
    const message = c.is_current
      ? `¿Retirar el certificado vigente${c.certificate_number ? ' ' + c.certificate_number : ''}? Úselo solo si se cargó por error: el certificado anterior volverá a quedar como vigente.`
      : '¿Retirar este certificado del historial? Úselo solo si se cargó por error.';
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Retirar certificado', message, confirmColor: 'warn' }, width: '440px' })
      .afterClosed().subscribe(ok => {
        if (!ok) return;
        this.svc.deleteCalibration(c.id).subscribe({
          next: () => { this.changed = true; this.snack.open('Certificado retirado', 'OK', { duration: 3000 }); this.load(); },
          error: err => this.snack.open(httpErrors(err)[0], 'OK', { duration: 4000 }),
        });
      });
  }

  close(): void { this.ref.close(this.changed); }

  formatSize(bytes: number): string {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
}

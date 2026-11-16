import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CalibrationPayload, MonitoringService, Sensor, SensorPayload } from '../monitoring.service';
import { Warehouse, Zone } from '../../warehouse/warehouse.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';
import {
  CALIBRATION_STATUS_META, DEFAULT_UNITS, ZONE_TYPE_META,
  daysLeftLabel, httpErrors, humidityRange, localDateStr, tempRange,
} from '../monitoring.utils';

export interface SensorFormDialogData {
  sensor: Sensor | null;
  zones: Zone[];
  warehouses: Warehouse[];
}

/**
 * Crear / editar un equipo de monitoreo.
 *
 * Paso 1: se elige el almacén y se despliegan sus zonas como
 * tarjetas con las condiciones que deben cumplir. Paso 2: datos del equipo.
 * Al crear se puede adjuntar el certificado de calibración (opcional: si
 * no se tiene a la mano se carga después desde "Certificados").
 */
@Component({
  selector: 'app-sensor-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatSlideToggleModule, MatProgressSpinnerModule,
    FormErrorsComponent, DateFormatPipe,
  ],
  templateUrl: './sensor-form-dialog.component.html',
  styleUrl: './sensor-form-dialog.component.scss',
})
export class SensorFormDialogComponent implements OnInit {
  data: SensorFormDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SensorFormDialogComponent, boolean>);
  private svc = inject(MonitoringService);
  private fb = inject(FormBuilder);

  readonly zoneMeta = ZONE_TYPE_META;
  readonly calMeta = CALIBRATION_STATUS_META;
  readonly tempRange = tempRange;
  readonly humidityRange = humidityRange;
  readonly daysLeftLabel = daysLeftLabel;
  readonly today = localDateStr();

  saving = signal(false);
  errors = signal<string[]>([]);
  attachCertificate = signal(false);
  certificateFile = signal<File | null>(null);

  form = this.fb.group({
    warehouse_id: [null as number | null, Validators.required],
    zone_id: [null as number | null, Validators.required],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    type: ['temperature', Validators.required],
    unit: ['°C', [Validators.required, Validators.maxLength(10)]],
    is_active: [true],
  });

  certForm = this.fb.group({
    expires_at: ['', Validators.required],
    calibrated_at: [''],
    certificate_number: ['', Validators.maxLength(100)],
    laboratory: ['', Validators.maxLength(150)],
  });

  private warehouseId = toSignal(this.form.controls.warehouse_id.valueChanges, { initialValue: null as number | null });
  private zoneId = toSignal(this.form.controls.zone_id.valueChanges, { initialValue: null as number | null });

  /** Almacenes que tienen al menos una zona activa (o la del sensor en edición). */
  warehouses = computed(() => {
    const withZones = new Set(this.data.zones.filter(z => this.isSelectable(z)).map(z => z.warehouse_id));
    return this.data.warehouses
      .filter(w => withZones.has(w.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  zonesOfWarehouse = computed(() => {
    const wid = this.warehouseId();
    if (!wid) return [];
    return this.data.zones
      .filter(z => z.warehouse_id === wid && this.isSelectable(z))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  selectedZone = computed(() => this.data.zones.find(z => z.id === this.zoneId()) ?? null);

  get isEdit(): boolean { return !!this.data.sensor; }

  ngOnInit(): void {
    // Al cambiar de almacén se limpia la zona elegida si no pertenece a ella.
    this.form.controls.warehouse_id.valueChanges.subscribe(wid => {
      const zone = this.selectedZone();
      if (zone && zone.warehouse_id !== wid) this.form.controls.zone_id.setValue(null);
    });

    // Unidad sugerida según el tipo (solo si el usuario no la cambió a mano).
    this.form.controls.type.valueChanges.subscribe(type => {
      const unit = this.form.controls.unit.value;
      if (!unit || Object.values(DEFAULT_UNITS).includes(unit)) {
        this.form.controls.unit.setValue(DEFAULT_UNITS[type ?? 'temperature'] ?? '');
      }
    });

    const s = this.data.sensor;
    if (s) {
      const zone = this.data.zones.find(z => z.id === s.zone_id);
      this.form.patchValue({ warehouse_id: zone?.warehouse_id ?? s.zone?.warehouse_id ?? null });
      this.form.patchValue({ zone_id: s.zone_id, name: s.name, type: s.type, unit: s.unit, is_active: s.is_active });
    } else if (this.warehouses().length === 1) {
      this.form.controls.warehouse_id.setValue(this.warehouses()[0].id);
    }
  }

  selectZone(zone: Zone): void {
    this.form.controls.zone_id.setValue(zone.id);
    this.form.controls.zone_id.markAsTouched();
  }

  warehouseZoneCount(warehouseId: number): number {
    return this.data.zones.filter(z => z.warehouse_id === warehouseId && this.isSelectable(z)).length;
  }

  toggleCertificate(on: boolean): void {
    this.attachCertificate.set(on);
    if (!on) {
      this.certificateFile.set(null);
      this.certForm.reset({ expires_at: '', calibrated_at: '', certificate_number: '', laboratory: '' });
    }
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.certificateFile.set(input.files?.[0] ?? null);
    input.value = '';
  }

  canSave(): boolean {
    if (this.form.invalid || this.saving()) return false;
    if (this.attachCertificate()) return !!this.certificateFile() && this.certForm.valid;
    return true;
  }

  save(): void {
    if (!this.canSave()) {
      this.form.markAllAsTouched();
      this.certForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errors.set([]);

    const v = this.form.getRawValue();
    const payload: SensorPayload = { zone_id: v.zone_id!, name: v.name!.trim(), type: v.type!, unit: v.unit!.trim() };

    const req$ = this.isEdit
      ? this.svc.updateSensor(this.data.sensor!.id, { ...payload, is_active: !!v.is_active })
      : this.svc.createSensor(payload, this.certificatePayload());

    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => { this.saving.set(false); this.errors.set(httpErrors(err)); },
    });
  }

  private isSelectable(z: Zone): boolean {
    return z.is_active || z.id === this.data.sensor?.zone_id;
  }

  private certificatePayload(): CalibrationPayload | null {
    const file = this.certificateFile();
    if (!this.attachCertificate() || !file) return null;
    const c = this.certForm.getRawValue();
    return {
      file,
      expires_at: c.expires_at!,
      calibrated_at: c.calibrated_at || null,
      certificate_number: c.certificate_number?.trim() || null,
      laboratory: c.laboratory?.trim() || null,
    };
  }
}

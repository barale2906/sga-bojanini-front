import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MonitoringService, Sensor } from '../monitoring.service';
import { Warehouse, Zone } from '../../warehouse/warehouse.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-sensor-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatSlideToggleModule, MatProgressSpinnerModule, FormErrorsComponent],
  template: `
    <h2 mat-dialog-title>{{ data.sensor ? 'Editar Sensor' : 'Nuevo Sensor' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="df">
        <mat-form-field appearance="outline" class="w"><mat-label>Zona *</mat-label>
          <mat-select formControlName="zone_id">
            @for (wh of zonesGrouped(); track wh.warehouseId) {
              <mat-optgroup [label]="wh.warehouseName">
                @for (z of wh.zones; track z.id) {
                  <mat-option [value]="z.id">{{ z.name }}</mat-option>
                }
              </mat-optgroup>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="w"><mat-label>Nombre *</mat-label><input matInput formControlName="name" /></mat-form-field>
        <mat-form-field appearance="outline" class="w"><mat-label>Tipo *</mat-label>
          <mat-select formControlName="type">
            <mat-option value="temperature">Temperatura</mat-option>
            <mat-option value="humidity">Humedad</mat-option>
            <mat-option value="pressure">Presión</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="w"><mat-label>Unidad</mat-label><input matInput formControlName="unit" placeholder="°C" /></mat-form-field>
        <mat-slide-toggle formControlName="is_active" color="primary">{{ form.get('is_active')?.value ? 'Activo' : 'Inactivo' }}</mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18"></mat-spinner> } {{ data.sensor ? 'Guardar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.df{display:flex;flex-direction:column;gap:0.25rem;padding:0.5rem 0;}.w{width:100%;}'],
})
export class SensorFormDialogComponent implements OnInit {
  data: { sensor: Sensor | null; zones: Zone[]; warehouses: Warehouse[] } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SensorFormDialogComponent>);
  private svc = inject(MonitoringService); private fb = inject(FormBuilder);
  saving = signal(false); errors = signal<string[]>([]);
  form = this.fb.group({ zone_id: [null as number | null, Validators.required], name: ['', Validators.required], type: ['temperature', Validators.required], unit: ['°C'], is_active: [true] });
  ngOnInit(): void { if (this.data.sensor) this.form.patchValue(this.data.sensor as any); }

  zonesGrouped(): { warehouseId: number; warehouseName: string; zones: Zone[] }[] {
    const map = new Map<number, { warehouseId: number; warehouseName: string; zones: Zone[] }>();
    for (const z of this.data.zones) {
      if (!map.has(z.warehouse_id)) {
        const wName = this.data.warehouses.find(w => w.id === z.warehouse_id)?.name ?? `Almacén ${z.warehouse_id}`;
        map.set(z.warehouse_id, { warehouseId: z.warehouse_id, warehouseName: wName, zones: [] });
      }
      map.get(z.warehouse_id)!.zones.push(z);
    }
    return [...map.values()].sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
  }

  save(): void {
    if (this.form.invalid || this.saving()) return; this.saving.set(true);
    const req$ = this.data.sensor ? this.svc.updateSensor(this.data.sensor.id, this.form.value as any) : this.svc.createSensor(this.form.value as any);
    req$.subscribe({ next: () => this.ref.close(true), error: err => { this.saving.set(false); if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]); } });
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { AssetMaintenanceService } from '../asset-maintenance.service';
import { AssetCatalogStore } from '../asset-catalog.store';
import { FrequencyUnit, MaintenancePlan, MaintenanceType, PerformedByType, toApiDate } from '../assets.models';

export interface MaintenancePlanDialogData {
  assetId: number;
  plan: MaintenancePlan | null;
}

/** Plan periódico de mantenimiento: al guardarlo se programa (o reprograma) su próxima orden. */
@Component({
  selector: 'app-maintenance-plan-dialog',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatSlideToggleModule, FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title class="dlg-title"><mat-icon>event_repeat</mat-icon> {{ data.plan ? 'Editar plan' : 'Nuevo plan de mantenimiento' }}</h2>
    <mat-dialog-content class="dlg-content">
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="form-grid">
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>Tipo *</mat-label>
          <mat-select formControlName="maintenance_type">
            @for (t of store.catalogs()?.plannable_types ?? []; track t.value) {
              <mat-option [value]="t.value">{{ t.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Cada *</mat-label>
          <input matInput type="number" min="1" formControlName="frequency_value">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Unidad *</mat-label>
          <mat-select formControlName="frequency_unit">
            <mat-option value="months">Meses</mat-option>
            <mat-option value="days">Días</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>Primera fecha *</mat-label>
          <input matInput [matDatepicker]="startPicker" formControlName="start_date">
          <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
          <mat-datepicker #startPicker></mat-datepicker>
          <mat-hint>Si ya pasó, se programa la siguiente fecha según la frecuencia</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Lo ejecuta *</mat-label>
          <mat-select formControlName="performed_by_type">
            <mat-option value="internal">Técnico interno</mat-option>
            <mat-option value="external">Proveedor externo</mat-option>
          </mat-select>
        </mat-form-field>
        @if (form.value.performed_by_type === 'internal') {
          <mat-form-field appearance="outline">
            <mat-label>Técnico</mat-label>
            <mat-select formControlName="technician_id">
              <mat-option [value]="null">Por asignar</mat-option>
              @for (u of store.users(); track u.id) { <mat-option [value]="u.id">{{ u.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline">
            <mat-label>Proveedor</mat-label>
            <mat-select formControlName="supplier_id">
              <mat-option [value]="null">Por asignar</mat-option>
              @for (s of store.suppliers(); track s.id) { <mat-option [value]="s.id">{{ s.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>Notas</mat-label>
          <textarea matInput formControlName="notes" rows="2"></textarea>
        </mat-form-field>
        @if (data.plan) {
          <mat-slide-toggle formControlName="is_active" color="primary" class="span-2">
            Plan activo (al desactivarlo se cancela la orden programada)
          </mat-slide-toggle>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">Guardar plan</button>
    </mat-dialog-actions>
  `,
  styleUrl: './asset-dialogs.scss',
})
export class MaintenancePlanDialogComponent {
  data: MaintenancePlanDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MaintenancePlanDialogComponent, MaintenancePlan | null>);
  private svc = inject(AssetMaintenanceService);
  store = inject(AssetCatalogStore);

  saving = signal(false);
  errors = signal<string[]>([]);

  form = inject(FormBuilder).group({
    maintenance_type: [(this.data.plan?.maintenance_type ?? 'preventive') as MaintenanceType, Validators.required],
    frequency_value: [this.data.plan?.frequency_value ?? 6, [Validators.required, Validators.min(1), Validators.max(3650)]],
    frequency_unit: [(this.data.plan?.frequency_unit ?? 'months') as FrequencyUnit, Validators.required],
    start_date: [this.data.plan ? new Date(`${this.data.plan.start_date}T00:00:00`) : new Date(), Validators.required],
    performed_by_type: [(this.data.plan?.performed_by_type ?? 'external') as PerformedByType, Validators.required],
    technician_id: [this.data.plan?.technician?.id ?? null as number | null],
    supplier_id: [this.data.plan?.supplier?.id ?? null as number | null],
    notes: [this.data.plan?.notes ?? ''],
    is_active: [this.data.plan?.is_active ?? true],
  });

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    const payload = {
      maintenance_type: v.maintenance_type!,
      frequency_value: Number(v.frequency_value),
      frequency_unit: v.frequency_unit!,
      start_date: toApiDate(v.start_date)!,
      performed_by_type: v.performed_by_type!,
      technician_id: v.performed_by_type === 'internal' ? v.technician_id : null,
      supplier_id: v.performed_by_type === 'external' ? v.supplier_id : null,
      notes: v.notes || null,
      is_active: v.is_active!,
    };

    const request$ = this.data.plan
      ? this.svc.updatePlan(this.data.plan.id, payload)
      : this.svc.createPlan(this.data.assetId, payload);

    request$.subscribe({
      next: res => this.ref.close(res.data),
      error: err => {
        this.saving.set(false);
        this.errors.set(err.status === 422
          ? Object.values(err.error?.errors ?? {}).flat() as string[]
          : [err.error?.message ?? 'No fue posible guardar el plan.']);
      },
    });
  }
}

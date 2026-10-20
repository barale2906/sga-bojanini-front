import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { AssetMaintenanceService } from '../asset-maintenance.service';
import { AssetCatalogStore } from '../asset-catalog.store';
import { AssetMaintenance, MaintenanceType, PerformedByType, toApiDate } from '../assets.models';

export interface MaintenanceOrderDialogData {
  assetId: number;
  assetLabel: string;
  /** Si viene, solo se reprograma la fecha de esta orden. */
  maintenance?: AssetMaintenance | null;
}

/** Programa una orden puntual (correctivo u otra no planificada) o reprograma una existente. */
@Component({
  selector: 'app-maintenance-order-dialog',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title class="dlg-title">
      <mat-icon>build</mat-icon> {{ data.maintenance ? 'Reprogramar mantenimiento' : 'Programar mantenimiento' }}
    </h2>
    <mat-dialog-content class="dlg-content">
      <p class="current-location"><mat-icon>devices</mat-icon> {{ data.assetLabel }}</p>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="form-grid">
        @if (!data.maintenance) {
          <mat-form-field appearance="outline">
            <mat-label>Tipo *</mat-label>
            <mat-select formControlName="maintenance_type">
              @for (t of store.catalogs()?.maintenance_types ?? []; track t.value) {
                <mat-option [value]="t.value">{{ t.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field appearance="outline" [class.span-2]="!!data.maintenance">
          <mat-label>Fecha programada *</mat-label>
          <input matInput [matDatepicker]="datePicker" formControlName="scheduled_date">
          <mat-datepicker-toggle matSuffix [for]="datePicker"></mat-datepicker-toggle>
          <mat-datepicker #datePicker></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>Falla reportada{{ form.value.maintenance_type === 'corrective' ? ' *' : '' }}</mat-label>
          <textarea matInput formControlName="reported_failure" rows="3"></textarea>
        </mat-form-field>
        @if (!data.maintenance) {
          <mat-form-field appearance="outline">
            <mat-label>Lo ejecuta</mat-label>
            <mat-select formControlName="performed_by_type">
              <mat-option [value]="null">Por definir</mat-option>
              <mat-option value="internal">Técnico interno</mat-option>
              <mat-option value="external">Proveedor externo</mat-option>
            </mat-select>
          </mat-form-field>
          @if (form.value.performed_by_type === 'internal') {
            <mat-form-field appearance="outline">
              <mat-label>Técnico</mat-label>
              <mat-select formControlName="technician_id">
                @for (u of store.users(); track u.id) { <mat-option [value]="u.id">{{ u.name }}</mat-option> }
              </mat-select>
            </mat-form-field>
          }
          @if (form.value.performed_by_type === 'external') {
            <mat-form-field appearance="outline">
              <mat-label>Proveedor</mat-label>
              <mat-select formControlName="supplier_id">
                @for (s of store.suppliers(); track s.id) { <mat-option [value]="s.id">{{ s.name }}</mat-option> }
              </mat-select>
            </mat-form-field>
          }
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
  styleUrl: './asset-dialogs.scss',
})
export class MaintenanceOrderDialogComponent {
  data: MaintenanceOrderDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MaintenanceOrderDialogComponent, AssetMaintenance | null>);
  private svc = inject(AssetMaintenanceService);
  store = inject(AssetCatalogStore);

  saving = signal(false);
  errors = signal<string[]>([]);

  form = inject(FormBuilder).group({
    maintenance_type: [(this.data.maintenance?.maintenance_type ?? 'corrective') as MaintenanceType, Validators.required],
    scheduled_date: [this.data.maintenance ? new Date(`${this.data.maintenance.scheduled_date}T00:00:00`) : new Date(), Validators.required],
    reported_failure: [this.data.maintenance?.reported_failure ?? ''],
    performed_by_type: [null as PerformedByType | null],
    technician_id: [null as number | null],
    supplier_id: [null as number | null],
  });

  constructor() {
    this.store.load().subscribe();
    const failure = this.form.controls.reported_failure;
    this.form.controls.maintenance_type.valueChanges.subscribe(type => {
      failure.setValidators(type === 'corrective' && !this.data.maintenance ? Validators.required : null);
      failure.updateValueAndValidity();
    });
    this.form.controls.maintenance_type.updateValueAndValidity();
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const v = this.form.getRawValue();

    const request$ = this.data.maintenance
      ? this.svc.reschedule(this.data.maintenance.id, toApiDate(v.scheduled_date)!, v.reported_failure)
      : this.svc.schedule(this.data.assetId, {
          maintenance_type: v.maintenance_type!,
          scheduled_date: toApiDate(v.scheduled_date)!,
          reported_failure: v.reported_failure || null,
          performed_by_type: v.performed_by_type,
          technician_id: v.performed_by_type === 'internal' ? v.technician_id : null,
          supplier_id: v.performed_by_type === 'external' ? v.supplier_id : null,
        });

    request$.subscribe({
      next: res => this.ref.close(res.data),
      error: err => {
        this.saving.set(false);
        this.errors.set(err.status === 422
          ? Object.values(err.error?.errors ?? {}).flat() as string[]
          : [err.error?.message ?? 'No fue posible guardar la orden.']);
      },
    });
  }
}

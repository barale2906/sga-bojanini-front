import { Component, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MedicalServicesService } from '../inventory/medical-services.service';
import { PatientSaleFormComponent } from '../../shared/components/patient-sale-form/patient-sale-form.component';
import { FormErrorsComponent } from '../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-sale-dialog',
  standalone: true,
  imports: [
    CommonModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, PatientSaleFormComponent, FormErrorsComponent,
  ],
  templateUrl: './sale-dialog.component.html',
  styleUrl:    './sale-dialog.component.scss',
})
export class SaleDialogComponent {
  @ViewChild('patientFormRef') patientFormRef?: PatientSaleFormComponent;

  private ref    = inject(MatDialogRef<SaleDialogComponent>);
  private medSvc = inject(MedicalServicesService);

  saving      = signal(false);
  errors      = signal<string[]>([]);
  step        = signal<1 | 2>(1);
  savedCount  = signal(0);

  get isValid(): boolean {
    return this.patientFormRef?.isValid ?? false;
  }

  save(): void {
    if (!this.patientFormRef?.isValid || this.saving()) return;
    this.errors.set([]);
    this.saving.set(true);

    const pd          = this.patientFormRef.getValue();
    const serviceDate = this._toApiDate(pd.service_date);

    const calls = pd.procedures.map(rv =>
      this.medSvc.createPatientProcedureRecord({
        medical_service_id:  rv.procedure_id,
        patient_external_id: pd.patient_external_id,
        patient_document:    pd.patient_document,
        patient_first_name:  pd.patient_first_name,
        patient_last_name:   pd.patient_last_name,
        quantity:            rv.quantity,
        unit_price:          rv.unit_price,
        service_date:        serviceDate,
        notes:               rv.notes || null,
        seller:              pd.seller || undefined,
        referrer:            pd.referrer || undefined,
      })
    );

    forkJoin(calls).subscribe({
      next: () => {
        this.saving.set(false);
        this.savedCount.set(pd.procedures.length);
        this.step.set(2);
      },
      error: err => {
        this.saving.set(false);
        if (err.status === 422)
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        else
          this.errors.set([err.error?.message || 'Error al registrar la venta']);
      },
    });
  }

  closeDialog(): void {
    this.ref.close({ ok: this.step() === 2 });
  }

  private _toApiDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

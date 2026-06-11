import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  MedicalServicesService,
  MedicalServiceNode,
  PatientProcedureRecord,
} from '../../inventory/medical-services.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';

export interface PatientProcedureRecordDialogData {
  record: PatientProcedureRecord | null;
}

@Component({
  selector: 'app-patient-procedure-record-form-dialog',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatSlideToggleModule, MatProgressSpinnerModule, MatDatepickerModule,
    FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.record ? 'Editar Registro de Procedimiento' : 'Nuevo Registro de Procedimiento' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">

        <div class="row">
          <mat-form-field appearance="outline" class="w-half">
            <mat-label>Servicio *</mat-label>
            <mat-select formControlName="service_id">
              @for (svc of services(); track svc.id) {
                <mat-option [value]="svc.id">{{ svc.code }} — {{ svc.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-half">
            <mat-label>Procedimiento *</mat-label>
            <mat-select formControlName="medical_service_id">
              @for (proc of procedureOptions(); track proc.id) {
                <mat-option [value]="proc.id">{{ proc.code }} — {{ proc.name }}</mat-option>
              }
            </mat-select>
            @if (form.get('medical_service_id')?.hasError('required') && form.get('medical_service_id')?.touched) {
              <mat-error>Selecciona un procedimiento</mat-error>
            }
          </mat-form-field>
        </div>

        <div class="row">
          <mat-form-field appearance="outline" class="w-half">
            <mat-label>ID Sistema clínico (HIS) *</mat-label>
            <input matInput formControlName="patient_external_id" maxlength="100" placeholder="PAC-001" />
            @if (fe()['patient_external_id']) { <mat-error>{{ fe()['patient_external_id'][0] }}</mat-error> }
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-half">
            <mat-label>Documento del paciente *</mat-label>
            <input matInput formControlName="patient_document" maxlength="50" />
            @if (fe()['patient_document']) { <mat-error>{{ fe()['patient_document'][0] }}</mat-error> }
          </mat-form-field>
        </div>

        <div class="row">
          <mat-form-field appearance="outline" class="w-half">
            <mat-label>Nombres *</mat-label>
            <input matInput formControlName="patient_first_name" maxlength="100" />
            @if (fe()['patient_first_name']) { <mat-error>{{ fe()['patient_first_name'][0] }}</mat-error> }
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-half">
            <mat-label>Apellidos *</mat-label>
            <input matInput formControlName="patient_last_name" maxlength="100" />
            @if (fe()['patient_last_name']) { <mat-error>{{ fe()['patient_last_name'][0] }}</mat-error> }
          </mat-form-field>
        </div>

        <div class="row">
          <mat-form-field appearance="outline" class="w-third">
            <mat-label>Cantidad *</mat-label>
            <input matInput type="number" formControlName="quantity" min="0.0001" step="1" />
            @if (fe()['quantity']) { <mat-error>{{ fe()['quantity'][0] }}</mat-error> }
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-third">
            <mat-label>Valor unitario *</mat-label>
            <span matPrefix>$&nbsp;</span>
            <input matInput type="number" formControlName="unit_price" min="0" step="100" />
            @if (fe()['unit_price']) { <mat-error>{{ fe()['unit_price'][0] }}</mat-error> }
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-third">
            <mat-label>Fecha de atención *</mat-label>
            <input matInput [matDatepicker]="datePicker" [max]="today" formControlName="service_date" />
            <mat-datepicker-toggle matIconSuffix [for]="datePicker"></mat-datepicker-toggle>
            <mat-datepicker #datePicker></mat-datepicker>
            @if (fe()['service_date']) { <mat-error>{{ fe()['service_date'][0] }}</mat-error> }
          </mat-form-field>
        </div>

        <div class="total-row">
          Total: <strong>{{ total() | currency:'COP':'symbol':'1.0-0' }}</strong>
        </div>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Notas</mat-label>
          <textarea matInput formControlName="notes" rows="2" maxlength="500" placeholder="Observaciones (opcional)"></textarea>
          @if (fe()['notes']) { <mat-error>{{ fe()['notes'][0] }}</mat-error> }
        </mat-form-field>

        @if (data.record) {
          <mat-slide-toggle formControlName="is_active" color="primary">
            {{ form.get('is_active')?.value ? 'Activo' : 'Inactivo' }}
          </mat-slide-toggle>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner> }
        {{ data.record ? 'Guardar cambios' : 'Crear registro' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem 0; min-width:560px; }
    .w-full { width:100%; }
    .row { display:flex; gap:0.75rem; }
    .w-half { width:100%; flex:1; }
    .w-third { width:100%; flex:1; }
    .total-row { text-align:right; font-size:0.95rem; color:#2d3748; margin:-0.25rem 0 0.5rem; }
  `],
})
export class PatientProcedureRecordFormDialogComponent implements OnInit {
  data: PatientProcedureRecordDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<PatientProcedureRecordFormDialogComponent>);
  private svc = inject(MedicalServicesService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  fe = signal<Record<string, string[]>>({});

  tree = signal<MedicalServiceNode[]>([]);
  services = computed(() => this.tree());

  today = new Date();

  private initializing = true;

  form = this.fb.group({
    service_id: [null as number | null, [Validators.required]],
    medical_service_id: [null as number | null, [Validators.required]],
    patient_external_id: ['', [Validators.required, Validators.maxLength(100)]],
    patient_document: ['', [Validators.required, Validators.maxLength(50)]],
    patient_first_name: ['', [Validators.required, Validators.maxLength(100)]],
    patient_last_name: ['', [Validators.required, Validators.maxLength(100)]],
    quantity: [1, [Validators.required, Validators.min(0.0001)]],
    unit_price: [0, [Validators.required, Validators.min(0)]],
    service_date: [new Date(), [Validators.required]],
    notes: [''],
    is_active: [true],
  });

  private formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  total = computed(() => {
    const v = this.formValue();
    const qty = Number(v.quantity ?? 0);
    const price = Number(v.unit_price ?? 0);
    return qty * price;
  });

  procedureOptions = computed(() => {
    const serviceId = this.formValue().service_id;
    const service = this.tree().find(s => s.id === serviceId);
    return service?.children ?? [];
  });

  ngOnInit(): void {
    this.svc.getTree(true).subscribe({
      next: r => {
        this.tree.set(r.data ?? []);
        this._initFromRecord();
      },
      error: () => {
        this.errors.set(['No se pudo cargar el catálogo de servicios y procedimientos']);
        this._initFromRecord();
      },
    });

    this.form.get('service_id')!.valueChanges.subscribe(() => {
      if (this.initializing) return;
      this.form.get('medical_service_id')!.setValue(null);
    });

    this.form.get('medical_service_id')!.valueChanges.subscribe(id => {
      if (this.initializing || !id) return;
      this._preloadCurrentPrice(id);
    });
  }

  private _initFromRecord(): void {
    const record = this.data.record;
    if (record) {
      const procedureId = record.medical_service_id;
      const parentService = this.tree().find(s => (s.children ?? []).some(p => p.id === procedureId));
      this.form.patchValue({
        service_id: parentService?.id ?? null,
        medical_service_id: procedureId,
        patient_external_id: record.patient_external_id,
        patient_document: record.patient_document,
        patient_first_name: record.patient_first_name ?? '',
        patient_last_name: record.patient_last_name ?? '',
        quantity: record.quantity,
        unit_price: record.unit_price,
        service_date: this._fromApiDate(record.service_date),
        notes: record.notes ?? '',
        is_active: record.is_active,
      });
    }
    this.initializing = false;
  }

  private _preloadCurrentPrice(procedureId: number): void {
    if (this.data.record) return; // no sobreescribir el valor guardado al editar
    this.svc.getProcedurePrices(procedureId, { is_active: true }).subscribe({
      next: r => {
        const current = (r.data ?? []).find(p => p.is_currently_valid);
        if (current) this.form.get('unit_price')!.setValue(current.unit_price);
      },
      error: () => {},
    });
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const v = this.form.value;
    const payload = {
      medical_service_id: v.medical_service_id!,
      patient_external_id: v.patient_external_id!,
      patient_document: v.patient_document!,
      patient_first_name: v.patient_first_name!,
      patient_last_name: v.patient_last_name!,
      quantity: v.quantity!,
      unit_price: v.unit_price!,
      service_date: this._toApiDate(v.service_date!),
      notes: v.notes || null,
      ...(this.data.record ? { is_active: v.is_active! } : {}),
    };

    const req$ = this.data.record
      ? this.svc.updatePatientProcedureRecord(this.data.record.id, payload)
      : this.svc.createPatientProcedureRecord(payload);

    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.fe.set(err.error?.errors || {});
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        } else {
          this.errors.set([err.error?.message || 'Error al guardar el registro']);
        }
      },
    });
  }

  private _toApiDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private _fromApiDate(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
}

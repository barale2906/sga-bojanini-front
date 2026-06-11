import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { MedicalServicesService, ProcedurePrice } from '../../inventory/medical-services.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';

export interface ProcedurePriceDialogData {
  procedureId: number;
  procedureName: string;
  price: ProcedurePrice | null;
}

@Component({
  selector: 'app-procedure-price-form-dialog',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSlideToggleModule, MatProgressSpinnerModule, MatDatepickerModule,
    FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.price ? 'Editar Tarifa' : 'Nueva Tarifa' }}</h2>
    <mat-dialog-content>
      <p class="proc-name">{{ data.procedureName }}</p>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Valor unitario *</mat-label>
          <span matPrefix>$&nbsp;</span>
          <input matInput type="number" formControlName="unit_price" min="0" step="100" />
          @if (form.get('unit_price')?.hasError('required') && form.get('unit_price')?.touched) {
            <mat-error>El valor es requerido</mat-error>
          }
          @if (fe()['unit_price']) { <mat-error>{{ fe()['unit_price'][0] }}</mat-error> }
        </mat-form-field>

        <div class="row">
          <mat-form-field appearance="outline" class="w-half">
            <mat-label>Vigente desde *</mat-label>
            <input matInput [matDatepicker]="fromPicker" formControlName="effective_from" />
            <mat-datepicker-toggle matIconSuffix [for]="fromPicker"></mat-datepicker-toggle>
            <mat-datepicker #fromPicker></mat-datepicker>
            @if (form.get('effective_from')?.hasError('required') && form.get('effective_from')?.touched) {
              <mat-error>Requerida</mat-error>
            }
            @if (fe()['effective_from']) { <mat-error>{{ fe()['effective_from'][0] }}</mat-error> }
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-half">
            <mat-label>Vigente hasta</mat-label>
            <input matInput [matDatepicker]="toPicker" formControlName="effective_to" />
            <mat-datepicker-toggle matIconSuffix [for]="toPicker"></mat-datepicker-toggle>
            <mat-datepicker #toPicker></mat-datepicker>
            @if (fe()['effective_to']) { <mat-error>{{ fe()['effective_to'][0] }}</mat-error> }
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Notas</mat-label>
          <textarea matInput formControlName="notes" rows="2" maxlength="500" placeholder="Observaciones (opcional)"></textarea>
          @if (fe()['notes']) { <mat-error>{{ fe()['notes'][0] }}</mat-error> }
        </mat-form-field>

        <mat-slide-toggle formControlName="is_active" color="primary">
          {{ form.get('is_active')?.value ? 'Activa' : 'Inactiva' }}
        </mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner> }
        {{ data.price ? 'Guardar cambios' : 'Crear tarifa' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem 0; min-width:420px; }
    .w-full { width:100%; }
    .row { display:flex; gap:0.75rem; }
    .w-half { width:100%; flex:1; }
    .proc-name { color:#718096; font-size:0.85rem; margin:-0.5rem 0 0.5rem; }
  `],
})
export class ProcedurePriceFormDialogComponent implements OnInit {
  data: ProcedurePriceDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ProcedurePriceFormDialogComponent>);
  private svc = inject(MedicalServicesService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  fe = signal<Record<string, string[]>>({});

  form = this.fb.group({
    unit_price: [0, [Validators.required, Validators.min(0)]],
    effective_from: [null as Date | null, [Validators.required]],
    effective_to: [null as Date | null],
    notes: [''],
    is_active: [true],
  });

  ngOnInit(): void {
    const price = this.data.price;
    if (price) {
      this.form.patchValue({
        unit_price: price.unit_price,
        effective_from: this._fromApiDate(price.effective_from),
        effective_to: price.effective_to ? this._fromApiDate(price.effective_to) : null,
        notes: price.notes ?? '',
        is_active: price.is_active,
      });
    }
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const { unit_price, effective_from, effective_to, notes, is_active } = this.form.value;
    const payload = {
      unit_price: unit_price!,
      effective_from: this._toApiDate(effective_from!),
      effective_to: effective_to ? this._toApiDate(effective_to) : null,
      notes: notes || null,
      is_active: is_active!,
    };

    const req$ = this.data.price
      ? this.svc.updateProcedurePrice(this.data.procedureId, this.data.price.id, payload)
      : this.svc.createProcedurePrice(this.data.procedureId, payload);

    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.fe.set(err.error?.errors || {});
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        } else {
          this.errors.set([err.error?.message || 'Error al guardar la tarifa']);
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

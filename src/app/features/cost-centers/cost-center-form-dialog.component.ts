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
import { CostCenterService, CostCenter } from './cost-center.service';
import { FormErrorsComponent } from '../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-cost-center-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatSlideToggleModule, MatProgressSpinnerModule,
    FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar Centro de Costo' : 'Nuevo Centro de Costo' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Código *</mat-label>
          <input matInput formControlName="code" placeholder="FARM" style="text-transform:uppercase" maxlength="20" />
          <mat-hint>Máximo 20 caracteres, debe ser único</mat-hint>
          @if (form.get('code')?.hasError('required') && form.get('code')?.touched) {
            <mat-error>El código es requerido</mat-error>
          }
          @if (fe()['code']) { <mat-error>{{ fe()['code'][0] }}</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Nombre *</mat-label>
          <input matInput formControlName="name" placeholder="Farmacia Interna" maxlength="100" />
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
            <mat-error>El nombre es requerido</mat-error>
          }
          @if (fe()['name']) { <mat-error>{{ fe()['name'][0] }}</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Tipo *</mat-label>
          <mat-select formControlName="type">
            <mat-option value="internal">Interno</mat-option>
            <mat-option value="external">Externo (Pacientes)</mat-option>
          </mat-select>
          <mat-hint>Externo requiere servicio y datos del paciente al registrar salidas</mat-hint>
          @if (fe()['type']) { <mat-error>{{ fe()['type'][0] }}</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Descripción</mat-label>
          <textarea matInput formControlName="description" rows="2" placeholder="Descripción opcional..."></textarea>
          @if (fe()['description']) { <mat-error>{{ fe()['description'][0] }}</mat-error> }
        </mat-form-field>

        @if (data) {
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
        {{ data ? 'Guardar cambios' : 'Crear centro de costo' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.dialog-form { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem 0; min-width:420px; } .w-full { width:100%; }`],
})
export class CostCenterFormDialogComponent implements OnInit {
  data: CostCenter | null = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<CostCenterFormDialogComponent>);
  private svc = inject(CostCenterService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  fe = signal<Record<string, string[]>>({});

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(20)]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    type: ['internal' as 'internal' | 'external', [Validators.required]],
    description: [''],
    is_active: [true],
  });

  ngOnInit(): void {
    if (this.data) {
      this.form.patchValue({
        code: this.data.code,
        name: this.data.name,
        type: this.data.type,
        description: this.data.description ?? '',
        is_active: this.data.is_active,
      });
    }
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const { code, name, type, description, is_active } = this.form.value;
    const payload = {
      code: code!,
      name: name!,
      type: type!,
      description: description || null,
      is_active: is_active!,
    };

    const req$ = this.data
      ? this.svc.updateCostCenter(this.data.id, payload)
      : this.svc.createCostCenter(payload);

    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.fe.set(err.error?.errors || {});
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        } else {
          this.errors.set([err.error?.message || 'Error al guardar el centro de costo']);
        }
      },
    });
  }
}

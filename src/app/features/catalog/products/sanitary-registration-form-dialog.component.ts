import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CatalogService, SanitaryRegistration } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

export interface SanitaryRegistrationDialogData {
  registration: SanitaryRegistration | null;
  productId: number;
  productName: string;
}

@Component({
  selector: 'app-sanitary-registration-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSlideToggleModule, MatProgressSpinnerModule,
    FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.registration ? 'Editar Registro Sanitario' : 'Nuevo Registro Sanitario' }}
    </h2>
    <mat-dialog-content>
      <p style="font-size:0.82rem;color:#718096;margin:0 0 0.75rem">
        Producto: <strong>{{ data.productName }}</strong>
      </p>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Número de Registro *</mat-label>
          <input matInput formControlName="registration_number"
                 placeholder="Ej. INVIMA-2024-123456" />
          @if (form.get('registration_number')?.hasError('required') && form.get('registration_number')?.touched) {
            <mat-error>El número de registro es requerido</mat-error>
          }
          @if (fe()['registration_number']) { <mat-error>{{ fe()['registration_number'][0] }}</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Fecha de Vencimiento *</mat-label>
          <input matInput type="date" formControlName="expiry_date" />
          @if (form.get('expiry_date')?.hasError('required') && form.get('expiry_date')?.touched) {
            <mat-error>La fecha de vencimiento es requerida</mat-error>
          }
          @if (fe()['expiry_date']) { <mat-error>{{ fe()['expiry_date'][0] }}</mat-error> }
        </mat-form-field>

        <mat-slide-toggle formControlName="is_active" color="primary">
          {{ form.get('is_active')?.value ? 'Activo' : 'Inactivo' }}
        </mat-slide-toggle>

      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner> }
        {{ data.registration ? 'Guardar cambios' : 'Crear registro' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.dialog-form { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem 0; min-width:400px; } .w-full { width:100%; }`],
})
export class SanitaryRegistrationFormDialogComponent implements OnInit {
  data: SanitaryRegistrationDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SanitaryRegistrationFormDialogComponent>);
  private svc = inject(CatalogService);
  private fb  = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  fe     = signal<Record<string, string[]>>({});

  form = this.fb.group({
    registration_number: ['', [Validators.required, Validators.maxLength(255)]],
    expiry_date:         ['', Validators.required],
    is_active:           [true],
  });

  ngOnInit(): void {
    if (this.data.registration) {
      const r = this.data.registration;
      this.form.patchValue({
        registration_number: r.registration_number,
        expiry_date:         r.expiry_date,
        is_active:           r.is_active,
      });
    }
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const payload = { ...this.form.value };
    const req$ = this.data.registration
      ? this.svc.updateSanitaryRegistration(this.data.productId, this.data.registration.id, payload as any)
      : this.svc.createSanitaryRegistration(this.data.productId, payload as any);

    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422 || err.status === 409) {
          this.fe.set(err.error?.errors || {});
          this.errors.set(
            err.error?.errors
              ? (Object.values(err.error.errors).flat() as string[])
              : [err.error?.message || 'Error de validación'],
          );
        } else {
          this.errors.set([err.error?.message || 'Error al guardar el registro sanitario']);
        }
      },
    });
  }
}

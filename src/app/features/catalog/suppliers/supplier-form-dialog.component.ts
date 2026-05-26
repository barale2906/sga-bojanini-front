import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CatalogService, Supplier } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-supplier-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSlideToggleModule, MatProgressSpinnerModule, FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar Proveedor' : 'Nuevo Proveedor' }}</h2>
    <mat-dialog-content style="min-width:480px">
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Razón social / Nombre *</mat-label>
          <input matInput formControlName="name" placeholder="MediSuministros S.A.S." />
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
            <mat-error>El nombre es requerido</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>NIT / Tax ID</mat-label>
          <input matInput formControlName="tax_id" placeholder="900123456-1" />
          @if (fe()['tax_id']) { <mat-error>{{ fe()['tax_id'][0] }}</mat-error> }
        </mat-form-field>

        <div class="row-2">
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Contacto</mat-label>
            <input matInput formControlName="contact_name" placeholder="Juan Pérez" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Teléfono</mat-label>
            <input matInput formControlName="phone" placeholder="3001234567" />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Correo electrónico</mat-label>
          <input matInput formControlName="email" type="email" placeholder="ventas@proveedor.com" />
          @if (form.get('email')?.hasError('email') && form.get('email')?.touched) {
            <mat-error>Correo inválido</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Dirección</mat-label>
          <input matInput formControlName="address" placeholder="Calle 100 # 10-20" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Notas</mat-label>
          <textarea matInput formControlName="notes" rows="2" placeholder="Observaciones opcionales..."></textarea>
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
        {{ data ? 'Guardar cambios' : 'Crear proveedor' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.dialog-form { display:flex; flex-direction:column; gap:0.25rem; padding:0.5rem 0; } .w-full { width:100%; } .row-2 { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }`],
})
export class SupplierFormDialogComponent implements OnInit {
  data: Supplier | null = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SupplierFormDialogComponent>);
  private svc = inject(CatalogService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  fe = signal<Record<string, string[]>>({});

  form = this.fb.group({
    name: ['', Validators.required],
    tax_id: [null as string | null],
    contact_name: [null as string | null],
    phone: [null as string | null],
    email: [null as string | null, Validators.email],
    address: [null as string | null],
    notes: [null as string | null],
    is_active: [true],
  });

  ngOnInit(): void {
    if (this.data) this.form.patchValue(this.data as any);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const raw = this.form.value;
    const payload = {
      name: raw.name,
      tax_id: raw.tax_id || null,
      contact_name: raw.contact_name || null,
      phone: raw.phone || null,
      email: raw.email || null,
      address: raw.address || null,
      notes: raw.notes || null,
      is_active: raw.is_active,
    };

    const req$ = this.data
      ? this.svc.updateSupplier(this.data.id, payload as any)
      : this.svc.createSupplier(payload as any);

    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.fe.set(err.error?.errors || {});
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        } else {
          this.errors.set([err.error?.message || 'Error al guardar el proveedor']);
        }
      },
    });
  }
}

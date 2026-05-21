import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { WarehouseService, Warehouse } from '../warehouse.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-warehouse-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatSlideToggleModule, MatProgressSpinnerModule, FormErrorsComponent],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar Almacén' : 'Nuevo Almacén' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Nombre *</mat-label>
          <input matInput formControlName="name" />
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) { <mat-error>Requerido</mat-error> }
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Código *</mat-label>
          <input matInput formControlName="code" placeholder="ALM-01" />
          @if (fe()['code']) { <mat-error>{{ fe()['code'][0] }}</mat-error> }
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Dirección</mat-label>
          <input matInput formControlName="address" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Descripción</mat-label>
          <textarea matInput formControlName="description" rows="2"></textarea>
        </mat-form-field>
        <mat-slide-toggle formControlName="is_active" color="primary">{{ form.get('is_active')?.value ? 'Activo' : 'Inactivo' }}</mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18"></mat-spinner> } {{ data ? 'Guardar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.dialog-form { display:flex; flex-direction:column; gap:0.25rem; padding:0.5rem 0; } .w-full { width:100%; }'],
})
export class WarehouseFormDialogComponent implements OnInit {
  data: Warehouse | null = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<WarehouseFormDialogComponent>);
  private svc = inject(WarehouseService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  fe = signal<Record<string, string[]>>({});

  form = this.fb.group({
    name: ['', Validators.required],
    code: ['', Validators.required],
    address: [''],
    description: [''],
    is_active: [true],
  });

  ngOnInit(): void {
    if (this.data) this.form.patchValue(this.data as any);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const req$ = this.data
      ? this.svc.updateWarehouse(this.data.id, this.form.value as any)
      : this.svc.createWarehouse(this.form.value as any);
    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.fe.set(err.error?.errors || {});
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        }
      },
    });
  }
}

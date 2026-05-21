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
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatSlideToggleModule, MatProgressSpinnerModule, FormErrorsComponent],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar Proveedor' : 'Nuevo Proveedor' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="g">
        <mat-form-field appearance="outline" class="s2"><mat-label>Nombre *</mat-label><input matInput formControlName="name" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>NIT / RUT</mat-label><input matInput formControlName="tax_id" placeholder="900123456-7" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Contacto</mat-label><input matInput formControlName="contact_name" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Email contacto</mat-label><input matInput type="email" formControlName="contact_email" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Teléfono</mat-label><input matInput formControlName="contact_phone" placeholder="+573001234567" /></mat-form-field>
        <mat-form-field appearance="outline" class="s2"><mat-label>Dirección</mat-label><input matInput formControlName="address" /></mat-form-field>
        <mat-form-field appearance="outline" class="s2"><mat-label>Notas</mat-label><textarea matInput formControlName="notes" rows="2"></textarea></mat-form-field>
        <div class="s2"><mat-slide-toggle formControlName="is_active" color="primary">{{ form.get('is_active')?.value ? 'Activo' : 'Inactivo' }}</mat-slide-toggle></div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18"></mat-spinner> } {{ data ? 'Guardar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.g{display:grid;grid-template-columns:1fr 1fr;gap:0.25rem 0.75rem;padding:0.5rem 0;} .s2{grid-column:span 2;}'],
})
export class SupplierFormDialogComponent implements OnInit {
  data: Supplier | null = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SupplierFormDialogComponent>);
  private svc = inject(CatalogService); private fb = inject(FormBuilder);
  saving = signal(false); errors = signal<string[]>([]);
  form = this.fb.group({
    name: ['', Validators.required], tax_id: [''], contact_name: [''],
    contact_email: ['', Validators.email], contact_phone: [''], address: [''], notes: [''], is_active: [true],
  });
  ngOnInit(): void { if (this.data) this.form.patchValue(this.data as any); }
  save(): void {
    if (this.form.invalid || this.saving()) return; this.saving.set(true);
    const req$ = this.data ? this.svc.updateSupplier(this.data.id, this.form.value as any) : this.svc.createSupplier(this.form.value as any);
    req$.subscribe({ next: () => this.ref.close(true), error: err => { this.saving.set(false); if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]); } });
  }
}

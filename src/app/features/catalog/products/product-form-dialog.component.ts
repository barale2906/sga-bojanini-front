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
import { CatalogService, Product, Category, UnitOfMeasure } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-product-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatSlideToggleModule, MatProgressSpinnerModule, FormErrorsComponent],
  template: `
    <h2 mat-dialog-title>{{ data.product ? 'Editar Producto' : 'Nuevo Producto' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="form-grid">
        <mat-form-field appearance="outline" class="span2"><mat-label>Nombre *</mat-label><input matInput formControlName="name" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Código *</mat-label><input matInput formControlName="code" placeholder="AGU-21G" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Tipo *</mat-label>
          <mat-select formControlName="product_type">
            <mat-option value="simple">Simple</mat-option>
            <mat-option value="kit">Kit (BOM)</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Categoría *</mat-label>
          <mat-select formControlName="category_id">
            @for (c of data.categories; track c.id) { <mat-option [value]="c.id">{{ c.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Unidad de Medida *</mat-label>
          <mat-select formControlName="unit_of_measure_id">
            @for (u of data.units; track u.id) { <mat-option [value]="u.id">{{ u.name }} ({{ u.abbreviation }})</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Stock mínimo</mat-label><input matInput type="number" formControlName="min_stock" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Stock máximo</mat-label><input matInput type="number" formControlName="max_stock" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Punto de reorden</mat-label><input matInput type="number" formControlName="reorder_point" /></mat-form-field>
        <mat-form-field appearance="outline" class="span2"><mat-label>Descripción</mat-label><textarea matInput formControlName="description" rows="2"></textarea></mat-form-field>
        <div class="span2"><mat-slide-toggle formControlName="is_active" color="primary">{{ form.get('is_active')?.value ? 'Activo' : 'Inactivo' }}</mat-slide-toggle></div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18"></mat-spinner> } {{ data.product ? 'Guardar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.25rem 0.75rem;padding:0.5rem 0;} .span2{grid-column:span 2;}'],
})
export class ProductFormDialogComponent implements OnInit {
  data: { product: Product | null; categories: Category[]; units: UnitOfMeasure[] } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ProductFormDialogComponent>);
  private svc = inject(CatalogService); private fb = inject(FormBuilder);
  saving = signal(false); errors = signal<string[]>([]);
  form = this.fb.group({
    name: ['', Validators.required], code: ['', Validators.required],
    product_type: ['simple', Validators.required], category_id: [null as number | null, Validators.required],
    unit_of_measure_id: [null as number | null, Validators.required],
    min_stock: [null as number | null], max_stock: [null as number | null], reorder_point: [null as number | null],
    description: [''], is_active: [true],
  });
  ngOnInit(): void { if (this.data.product) this.form.patchValue(this.data.product as any); }
  save(): void {
    if (this.form.invalid || this.saving()) return; this.saving.set(true);
    const req$ = this.data.product ? this.svc.updateProduct(this.data.product.id, this.form.value as any) : this.svc.createProduct(this.form.value as any);
    req$.subscribe({ next: () => this.ref.close(true), error: err => { this.saving.set(false); if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]); } });
  }
}

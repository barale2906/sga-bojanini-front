import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CatalogService, Category } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-category-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatProgressSpinnerModule, FormErrorsComponent],
  template: `
    <h2 mat-dialog-title>{{ data.category ? 'Editar Categoría' : 'Nueva Categoría' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="df">
        <mat-form-field appearance="outline" class="w">
          <mat-label>Nombre *</mat-label><input matInput formControlName="name" />
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) { <mat-error>Requerido</mat-error> }
        </mat-form-field>
        <mat-form-field appearance="outline" class="w">
          <mat-label>Código *</mat-label><input matInput formControlName="code" placeholder="INS" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="w">
          <mat-label>Categoría padre</mat-label>
          <mat-select formControlName="parent_id">
            <mat-option [value]="null">Ninguna (raíz)</mat-option>
            @for (c of data.all; track c.id) {
              @if (!data.category || c.id !== data.category.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="w">
          <mat-label>Descripción</mat-label><textarea matInput formControlName="description" rows="2"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18"></mat-spinner> } {{ data.category ? 'Guardar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.df{display:flex;flex-direction:column;gap:0.25rem;padding:0.5rem 0;}.w{width:100%;}'],
})
export class CategoryFormDialogComponent implements OnInit {
  data: { category: Category | null; all: Category[] } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<CategoryFormDialogComponent>);
  private svc = inject(CatalogService); private fb = inject(FormBuilder);
  saving = signal(false); errors = signal<string[]>([]);
  form = this.fb.group({ name: ['', Validators.required], code: ['', Validators.required], parent_id: [null as number | null], description: [''] });
  ngOnInit(): void { if (this.data.category) this.form.patchValue(this.data.category as any); }
  save(): void {
    if (this.form.invalid || this.saving()) return; this.saving.set(true);
    const req$ = this.data.category ? this.svc.updateCategory(this.data.category.id, this.form.value as any) : this.svc.createCategory(this.form.value as any);
    req$.subscribe({ next: () => this.ref.close(true), error: err => { this.saving.set(false); if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]); } });
  }
}

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
import { CatalogService, Category } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

export interface CategoryDialogData {
  category: Category | null;
  categories: Category[];
}

@Component({
  selector: 'app-category-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatSlideToggleModule, MatProgressSpinnerModule,
    FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.category ? 'Editar Categoría' : 'Nueva Categoría' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Categoría padre</mat-label>
          <mat-select formControlName="parent_id">
            <mat-option [value]="null">— Sin padre (raíz) —</mat-option>
            @for (cat of parentOptions(); track cat.id) {
              <mat-option [value]="cat.id">{{ cat.name }} ({{ cat.code }})</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Nombre *</mat-label>
          <input matInput formControlName="name" placeholder="Insumos Médicos" />
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
            <mat-error>El nombre es requerido</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Código *</mat-label>
          <input matInput formControlName="code" placeholder="INS-MED" style="text-transform:uppercase" />
          @if (form.get('code')?.hasError('required') && form.get('code')?.touched) {
            <mat-error>El código es requerido</mat-error>
          }
          @if (fe()['code']) { <mat-error>{{ fe()['code'][0] }}</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Descripción</mat-label>
          <textarea matInput formControlName="description" rows="2" placeholder="Descripción opcional..."></textarea>
        </mat-form-field>

        @if (data.category) {
          <mat-slide-toggle formControlName="is_active" color="primary">
            {{ form.get('is_active')?.value ? 'Activa' : 'Inactiva' }}
          </mat-slide-toggle>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner> }
        {{ data.category ? 'Guardar cambios' : 'Crear categoría' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.dialog-form { display:flex; flex-direction:column; gap:0.25rem; padding:0.5rem 0; min-width:400px; } .w-full { width:100%; }`],
})
export class CategoryFormDialogComponent implements OnInit {
  data: CategoryDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<CategoryFormDialogComponent>);
  private svc = inject(CatalogService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  fe = signal<Record<string, string[]>>({});

  // Excluye la categoría actual para evitar auto-referencia
  parentOptions = signal<Category[]>([]);

  form = this.fb.group({
    parent_id: [null as number | null],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    code: ['', [Validators.required, Validators.maxLength(50)]],
    description: [''],
    is_active: [true],
  });

  ngOnInit(): void {
    const others = this.data.category
      ? this.data.categories.filter(c => c.id !== this.data.category!.id)
      : this.data.categories;
    this.parentOptions.set(others);

    if (this.data.category) {
      this.form.patchValue({
        parent_id: this.data.category.parent_id,
        name: this.data.category.name,
        code: this.data.category.code,
        description: this.data.category.description ?? '',
        is_active: this.data.category.is_active,
      });
    }
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const payload = { ...this.form.value };
    const req$ = this.data.category
      ? this.svc.updateCategory(this.data.category.id, payload as any)
      : this.svc.createCategory(payload as any);

    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.fe.set(err.error?.errors || {});
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        } else {
          this.errors.set([err.error?.message || 'Error al guardar la categoría']);
        }
      },
    });
  }
}

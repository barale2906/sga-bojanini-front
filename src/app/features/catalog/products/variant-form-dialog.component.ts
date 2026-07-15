import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CatalogService, ProductVariant } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

export interface VariantDialogData {
  variant: ProductVariant | null;
  productId: number;
  productName: string;
}

@Component({
  selector: 'app-variant-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSlideToggleModule, MatProgressSpinnerModule,
    FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.variant ? 'Editar Variante' : 'Nueva Variante' }}
    </h2>
    <mat-dialog-content>
      <p style="font-size:0.82rem;color:#718096;margin:0 0 0.75rem">
        Genérico: <strong>{{ data.productName }}</strong>
      </p>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Laboratorio / Marca *</mat-label>
          <input matInput formControlName="lab_brand" placeholder="Ej. Pfizer, Genfar, MK" />
          @if (form.get('lab_brand')?.hasError('required') && form.get('lab_brand')?.touched) {
            <mat-error>El laboratorio / marca es requerido</mat-error>
          }
          @if (fe()['lab_brand']) { <mat-error>{{ fe()['lab_brand'][0] }}</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>SKU de marca</mat-label>
          <input matInput formControlName="brand_sku" placeholder="Código interno del laboratorio" />
          @if (fe()['brand_sku']) { <mat-error>{{ fe()['brand_sku'][0] }}</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Nivel de Riesgo</mat-label>
          <input matInput formControlName="risk_level" placeholder="Ej. I, IIA, IIB, III" />
          @if (fe()['risk_level']) { <mat-error>{{ fe()['risk_level'][0] }}</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Presentación Comercial</mat-label>
          <input matInput formControlName="commercial_presentation" placeholder="Ej. Caja x 10 ampollas" />
          @if (fe()['commercial_presentation']) { <mat-error>{{ fe()['commercial_presentation'][0] }}</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Serie / Referencia</mat-label>
          <input matInput formControlName="serie_reference" />
          @if (fe()['serie_reference']) { <mat-error>{{ fe()['serie_reference'][0] }}</mat-error> }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Vida Útil</mat-label>
          <input matInput formControlName="useful_life" placeholder="Ej. 24 meses" />
          @if (fe()['useful_life']) { <mat-error>{{ fe()['useful_life'][0] }}</mat-error> }
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
        {{ data.variant ? 'Guardar cambios' : 'Crear variante' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.dialog-form { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem 0; min-width:420px; } .w-full { width:100%; }`],
})
export class VariantFormDialogComponent implements OnInit {
  data: VariantDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<VariantFormDialogComponent>);
  private svc = inject(CatalogService);
  private fb  = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  fe     = signal<Record<string, string[]>>({});

  form = this.fb.group({
    lab_brand:                ['', Validators.required],
    brand_sku:                [null as string | null],
    risk_level:               [null as string | null],
    commercial_presentation:  [null as string | null],
    serie_reference:          [null as string | null],
    useful_life:              [null as string | null],
    is_active:                [true],
  });

  ngOnInit(): void {
    if (this.data.variant) {
      const v = this.data.variant;
      this.form.patchValue({
        lab_brand:               v.lab_brand,
        brand_sku:               v.brand_sku,
        risk_level:              v.risk_level,
        commercial_presentation: v.commercial_presentation,
        serie_reference:         v.serie_reference,
        useful_life:             v.useful_life,
        is_active:               v.is_active,
      });
    }
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const payload = { ...this.form.value };
    const req$ = this.data.variant
      ? this.svc.updateVariant(this.data.productId, this.data.variant.id, payload as any)
      : this.svc.createVariant(this.data.productId, payload as any);

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
          this.errors.set([err.error?.message || 'Error al guardar la variante']);
        }
      },
    });
  }
}

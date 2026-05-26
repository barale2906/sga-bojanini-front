import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { CatalogService, Product, ProductPresentation, UnitOfMeasure } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

export interface PresentationDialogData {
  presentation: ProductPresentation | null;
  /** ID del producto propietario. 0 = el usuario debe elegir uno. */
  productId: number;
  units: UnitOfMeasure[];
  existingPresentations: ProductPresentation[];
  /** Si se provee, se muestra selector de producto (vista global) */
  products?: Product[];
}

@Component({
  selector: 'app-presentation-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatSlideToggleModule,
    MatProgressSpinnerModule, MatDividerModule,
    FormErrorsComponent,
  ],
  template: `
<h2 mat-dialog-title style="display:flex;align-items:center;gap:0.5rem;padding-bottom:0.25rem">
  <mat-icon style="color:#3182ce">inventory_2</mat-icon>
  {{ data.presentation ? 'Editar Empaque' : 'Nuevo Empaque / Presentación' }}
</h2>

<mat-dialog-content style="min-width:620px;max-width:740px;max-height:80vh;overflow-y:auto">
  <app-form-errors [errors]="errors()"></app-form-errors>

  <form [formGroup]="form" class="pres-form">

    <!-- ══ SECCIÓN 1: PRODUCTO ══════════════════════════════════════════ -->
    <div class="pres-section">
      <div class="pres-section-title">
        <span class="pres-step">1</span> Producto
      </div>

      @if (showProductSelector) {
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Producto al que aplica este empaque *</mat-label>
          <mat-icon matPrefix style="font-size:1.1rem;height:1.1rem;width:1.1rem;margin-right:4px">inventory_2</mat-icon>
          <mat-select formControlName="product_id" (selectionChange)="onProductSelected($event.value)">
            @for (p of data.products ?? []; track p.id) {
              <mat-option [value]="p.id">
                <strong style="font-family:monospace;font-size:0.85em">{{ p.code }}</strong>
                &nbsp;— {{ p.name }}
              </mat-option>
            }
          </mat-select>
          <mat-hint>Un mismo tipo de empaque (Caja ×500) puede asignarse a varios productos por separado</mat-hint>
          @if (form.get('product_id')?.hasError('required') && form.get('product_id')?.touched) {
            <mat-error>Debes seleccionar un producto</mat-error>
          }
        </mat-form-field>

        @if (loadingParents()) {
          <div class="loading-row">
            <mat-spinner diameter="16"></mat-spinner>
            <span>Cargando empaques existentes del producto…</span>
          </div>
        }
      } @else {
        @if (lockedProductName) {
          <div class="product-locked">
            <mat-icon>inventory_2</mat-icon>
            <div>
              <span style="font-size:0.78rem;color:#718096">Producto</span>
              <strong style="display:block">{{ lockedProductName }}</strong>
            </div>
          </div>
        }
      }
    </div>

    <!-- ══ SECCIÓN 2: JERARQUÍA ═════════════════════════════════════════ -->
    <div class="pres-section">
      <div class="pres-section-title">
        <span class="pres-step">2</span> Jerarquía de empaque
        <span class="pres-section-hint">¿Dentro de qué empaque cabe este?</span>
      </div>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Empaque padre</mat-label>
        <mat-select formControlName="parent_id">
          <mat-option [value]="null">
            ⬛ Raíz — este es el empaque más grande / externo
          </mat-option>
          @for (p of parentOptions(); track p.id) {
            <mat-option [value]="p.id">
              <span class="level-chip level-chip--{{ p.level }}">L{{ p.level }}</span>
              {{ p.name }}
              <span style="color:#718096;font-size:0.82em"> · ×{{ p.factor_to_base }} uds.base</span>
            </mat-option>
          }
        </mat-select>
        <mat-hint>
          @if (selectedParent()) {
            Este empaque va DENTRO de "{{ selectedParent()!.name }}"
          } @else {
            Es el contenedor más grande (ej. caja maestra). Déjalo en Raíz si no hay empaque externo.
          }
        </mat-hint>
      </mat-form-field>

      <div class="row-2" style="margin-top:0.25rem">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Nivel jerarquía *</mat-label>
          <input matInput type="number" min="1" formControlName="level" />
          <mat-hint>1 = más grande (raíz). Se recalcula automáticamente al elegir padre.</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Cantidad en 1 empaque padre</mat-label>
          <input matInput type="number" min="1" formControlName="quantity_per_parent" />
          <mat-hint>
            @if (selectedParent()) {
              Cuántos "{{ form.get('name')?.value || 'este empaque' }}" caben en 1 "{{ selectedParent()!.name }}"
            } @else {
              Solo si tiene empaque padre
            }
          </mat-hint>
        </mat-form-field>
      </div>
    </div>

    <!-- ══ SECCIÓN 3: IDENTIFICACIÓN ═══════════════════════════════════ -->
    <div class="pres-section">
      <div class="pres-section-title">
        <span class="pres-step">3</span> Identificación del empaque
      </div>

      <div class="row-2">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Nombre *</mat-label>
          <input matInput formControlName="name" placeholder="Ej. Caja ×500, Paquete ×100" />
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
            <mat-error>Nombre requerido</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Código *</mat-label>
          <input matInput formControlName="code" placeholder="Ej. CJ-500, PQ-100" style="text-transform:uppercase" />
          @if (form.get('code')?.hasError('required') && form.get('code')?.touched) {
            <mat-error>Código requerido</mat-error>
          }
        </mat-form-field>
      </div>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Tipo / categoría del envase *</mat-label>
        <mat-select formControlName="units_of_measure_id">
          @for (u of data.units; track u.id) {
            <mat-option [value]="u.id">
              <strong style="font-family:monospace">{{ u.abbreviation }}</strong> — {{ u.name }}
            </mat-option>
          }
        </mat-select>
        <mat-hint>Etiqueta del contenedor: Caja (CJ), Paquete (PQ), Unidad (UND)… Solo clasifica; no convierte.</mat-hint>
        @if (form.get('units_of_measure_id')?.hasError('required') && form.get('units_of_measure_id')?.touched) {
          <mat-error>Selecciona el tipo de empaque</mat-error>
        }
      </mat-form-field>
    </div>

    <!-- ══ SECCIÓN 4: CONVERSIÓN A INVENTARIO ══════════════════════════ -->
    <div class="pres-section pres-section--conversion">
      <div class="pres-section-title">
        <span class="pres-step pres-step--key">4</span> Factor de conversión a inventario
        <span class="pres-section-hint">— el dato más importante</span>
      </div>

      <div class="conversion-explainer">
        <mat-icon style="color:#3182ce;flex-shrink:0;font-size:1.1rem;height:1.1rem;width:1.1rem">help_outline</mat-icon>
        <div>
          <strong>¿Qué es el factor?</strong>
          Cuántas <em>unidades mínimas de inventario</em> trae 1 unidad de este empaque.<br>
          <span style="color:#2b6cb0">Ejemplo: 1 "Paquete ×100" → <strong>100</strong> agujas en inventario.</span>
        </div>
      </div>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Factor a unidad base *</mat-label>
        <mat-icon matSuffix style="font-size:1.1rem;height:1.1rem;width:1.1rem;color:#718096">calculate</mat-icon>
        <input matInput type="number" min="1" formControlName="factor_to_base" placeholder="Ej. 500" />
        <mat-hint>Unidades base que contiene 1 unidad de ESTE empaque</mat-hint>
        @if (form.get('factor_to_base')?.hasError('min')) {
          <mat-error>El factor debe ser mínimo 1</mat-error>
        }
        @if (form.get('factor_to_base')?.hasError('required') && form.get('factor_to_base')?.touched) {
          <mat-error>Requerido</mat-error>
        }
      </mat-form-field>

      <!-- Preview de conversión -->
      @if (conversionPreview()) {
        <div class="conversion-preview" [class.conversion-preview--warn]="coherenceCheck()?.ok === false">
          <mat-icon style="flex-shrink:0">
            {{ coherenceCheck()?.ok === false ? 'warning' : 'check_circle' }}
          </mat-icon>
          <div class="preview-content">
            <div class="preview-main">{{ conversionPreview() }}</div>
            @if (coherenceCheck(); as chk) {
              @if (!chk.ok) {
                <div class="preview-sub preview-sub--warn">
                  Incoherencia con el padre ({{ chk.expected }} ≠ {{ chk.qpp }}×{{ chk.factor }}={{ chk.actual }}).
                  Factor sugerido: <strong>{{ chk.suggested }}</strong>
                  <button mat-button style="padding:0 4px;height:auto;line-height:1.4;font-size:0.78rem;min-width:auto" type="button" (click)="applyAutoFactor()">
                    ← Aplicar
                  </button>
                </div>
              } @else {
                <div class="preview-sub preview-sub--ok">
                  ✓ Coherente con el padre: {{ chk.expected }} = {{ chk.qpp }} × {{ chk.factor }}
                </div>
              }
            }
          </div>
        </div>
      }
    </div>

    <!-- ══ SECCIÓN 5: CONFIGURACIÓN ════════════════════════════════════ -->
    <div class="pres-section">
      <div class="pres-section-title">
        <span class="pres-step">5</span> Configuración
      </div>

      <div class="row-2">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Orden de visualización</mat-label>
          <input matInput type="number" min="0" formControlName="sort_order" />
          <mat-hint>Orden en listas (menor número = primero)</mat-hint>
        </mat-form-field>
        <div style="display:flex;flex-direction:column;gap:0.75rem;padding-top:0.5rem">
          <mat-slide-toggle formControlName="is_purchase_default" color="accent">
            Empaque de compra por defecto
          </mat-slide-toggle>
          <small style="color:#718096;margin-top:-0.4rem">
            Aparece preseleccionado en órdenes de compra y recepciones.
          </small>
          @if (data.presentation) {
            <mat-slide-toggle formControlName="is_active" color="primary">
              {{ form.get('is_active')?.value ? 'Activo' : 'Inactivo' }}
            </mat-slide-toggle>
          }
        </div>
      </div>
    </div>

  </form>
</mat-dialog-content>

<mat-dialog-actions align="end" style="padding:0.75rem 1.5rem">
  <button mat-button [mat-dialog-close]="false">Cancelar</button>
  <button mat-raised-button color="primary" (click)="save()"
          [disabled]="form.invalid || saving() || loadingParents()">
    @if (saving()) {
      <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner>
    }
    {{ data.presentation ? 'Guardar cambios' : 'Crear empaque' }}
  </button>
</mat-dialog-actions>
  `,
  styles: [`
    .pres-form { display:flex; flex-direction:column; gap:0.75rem; padding:0.25rem 0 0.5rem; }
    .w-full { width:100%; }
    .row-2 { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }

    /* Secciones numeradas */
    .pres-section {
      border:1px solid #E2E8F0; border-radius:10px;
      padding:0.85rem 1rem 0.75rem; background:#FAFAFA;
      display:flex; flex-direction:column; gap:0.5rem;
    }
    .pres-section--conversion {
      background:#F0FFF4; border-color:#9AE6B4;
    }
    .pres-section-title {
      display:flex; align-items:center; gap:0.5rem;
      font-size:0.85rem; font-weight:700; color:#2d3748;
      margin-bottom:0.25rem;
    }
    .pres-section-hint { font-size:0.78rem; font-weight:400; color:#718096; }

    .pres-step {
      display:inline-flex; align-items:center; justify-content:center;
      width:1.4rem; height:1.4rem; border-radius:50%;
      background:#E2E8F0; color:#4a5568; font-size:0.75rem; font-weight:700; flex-shrink:0;
      &--key { background:#3182ce; color:#fff; }
    }

    /* Producto bloqueado */
    .product-locked {
      display:flex; align-items:center; gap:0.6rem;
      background:#EDF2F7; border:1px solid #E2E8F0; border-radius:8px;
      padding:0.6rem 0.85rem; color:#4a5568;
      mat-icon { color:#3182ce; }
    }

    /* Loading row */
    .loading-row {
      display:flex; align-items:center; gap:0.5rem;
      font-size:0.82rem; color:#718096; padding:0.25rem 0;
    }

    /* Level chip */
    .level-chip {
      display:inline-block; padding:0.05rem 0.35rem; border-radius:3px;
      font-size:0.7rem; font-weight:700; margin-right:0.3rem;
      &--1 { background:#e9d8fd; color:#553c9a; }
      &--2 { background:#bee3f8; color:#2c5282; }
      &--3 { background:#c6f6d5; color:#276749; }
    }

    /* Explicación conversión */
    .conversion-explainer {
      display:flex; gap:0.6rem; align-items:flex-start;
      background:#EBF8FF; border:1px solid #BEE3F8; border-radius:7px;
      padding:0.5rem 0.75rem; font-size:0.81rem; color:#2c5282;
    }

    /* Preview conversión */
    .conversion-preview {
      display:flex; gap:0.6rem; align-items:flex-start;
      border-radius:8px; padding:0.6rem 0.9rem;
      background:#F0FFF4; border:1px solid #68d391; color:#276749;
      mat-icon { font-size:1.15rem; height:1.15rem; width:1.15rem; margin-top:0.05rem; }
      &--warn { background:#FFFAF0; border-color:#F6AD55; color:#744210;
        mat-icon { color:#dd6b20; } }
      .preview-content { flex:1; }
      .preview-main { font-weight:700; font-size:0.9rem; }
      .preview-sub { font-size:0.78rem; margin-top:0.2rem; }
      .preview-sub--ok { color:#38a169; }
      .preview-sub--warn { color:#c05621; }
    }
  `],
})
export class PresentationFormDialogComponent implements OnInit {
  data: PresentationDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<PresentationFormDialogComponent>);
  private svc = inject(CatalogService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  loadingParents = signal(false);
  errors = signal<string[]>([]);
  parentOptions = signal<ProductPresentation[]>([]);

  /** ¿Debe mostrarse el selector de producto? */
  get showProductSelector(): boolean {
    return !this.data.presentation && !!this.data.products?.length;
  }

  /** Nombre del producto fijo (cuando viene desde el detalle del producto) */
  get lockedProductName(): string {
    if (!this.data.products || !this.data.productId) return '';
    return this.data.products.find(p => p.id === this.data.productId)?.name ?? '';
  }

  /** Snapshot reactivo del formulario */
  private _fv = signal<any>({});

  selectedParent = computed<ProductPresentation | null>(() => {
    const pid = this._fv().parent_id;
    return this.parentOptions().find(p => p.id === pid) ?? null;
  });

  conversionPreview = computed<string | null>(() => {
    const f = this._fv().factor_to_base;
    const n = this._fv().name || 'este empaque';
    if (!f || f < 1) return null;
    return `1 "${n}" = ${f} unidades base en inventario`;
  });

  coherenceCheck = computed<{
    expected: number; actual: number; ok: boolean;
    qpp: number; factor: number; suggested: number | null;
  } | null>(() => {
    const parent = this.selectedParent();
    if (!parent) return null;
    const qpp = Number(this._fv().quantity_per_parent);
    const factor = Number(this._fv().factor_to_base);
    if (!qpp || !factor) return null;
    const expected = parent.factor_to_base;
    const actual = qpp * factor;
    const suggested = Number.isInteger(expected / qpp) ? expected / qpp : null;
    return { expected, actual, ok: expected === actual, qpp, factor, suggested };
  });

  form = this.fb.group({
    product_id: [null as number | null],
    parent_id: [null as number | null],
    name: ['', Validators.required],
    code: ['', Validators.required],
    units_of_measure_id: [null as number | null, Validators.required],
    factor_to_base: [1, [Validators.required, Validators.min(1)]],
    quantity_per_parent: [null as number | null],
    level: [1, [Validators.required, Validators.min(1)]],
    sort_order: [0],
    is_purchase_default: [false],
    is_active: [true],
  });

  ngOnInit(): void {
    // Hacer product_id requerido solo en la vista global (sin productId fijo)
    if (this.showProductSelector) {
      this.form.get('product_id')!.addValidators(Validators.required);
      this.form.get('product_id')!.updateValueAndValidity();
    } else {
      this.form.get('product_id')!.setValue(this.data.productId || null);
    }

    // Cargar las opciones de padre desde las presentaciones existentes del producto
    const others = this.data.presentation
      ? this.data.existingPresentations.filter(p => p.id !== this.data.presentation!.id)
      : this.data.existingPresentations;
    this.parentOptions.set(others);

    // Snapshot reactivo
    this._fv.set(this.form.value);
    this.form.valueChanges.subscribe(v => this._fv.set(v));

    // Auto-nivel y sugerencia de factor al cambiar el padre
    this.form.get('parent_id')!.valueChanges.subscribe(pid => {
      const parent = this.parentOptions().find(p => p.id === pid) ?? null;
      if (parent) {
        this.form.get('level')?.setValue(parent.level + 1, { emitEvent: false });
        this._tryAutoFactor(parent);
      } else {
        this.form.get('level')?.setValue(1, { emitEvent: false });
      }
    });

    this.form.get('quantity_per_parent')!.valueChanges.subscribe(() => {
      const parent = this.selectedParent();
      if (parent) this._tryAutoFactor(parent);
    });

    // Cargar datos al editar
    if (this.data.presentation) {
      const pr = this.data.presentation;
      this.form.patchValue({
        product_id: this.data.productId || null,
        parent_id: pr.parent_id,
        name: pr.name,
        code: pr.code,
        units_of_measure_id: pr.units_of_measure_id,
        factor_to_base: pr.factor_to_base,
        quantity_per_parent: pr.quantity_per_parent,
        level: pr.level,
        sort_order: pr.sort_order,
        is_purchase_default: pr.is_purchase_default,
        is_active: pr.is_active,
      });
    }
  }

  /** Cuando se selecciona un producto en la vista global, carga sus presentaciones actuales */
  onProductSelected(productId: number): void {
    if (!productId) { this.parentOptions.set([]); return; }
    this.loadingParents.set(true);
    this.svc.getPresentations(productId).subscribe({
      next: r => { this.parentOptions.set(r.data); this.loadingParents.set(false); },
      error: () => { this.parentOptions.set([]); this.loadingParents.set(false); },
    });
  }

  applyAutoFactor(): void {
    const chk = this.coherenceCheck();
    if (chk?.suggested != null && chk.suggested >= 1) {
      this.form.get('factor_to_base')?.setValue(chk.suggested);
    }
  }

  private _tryAutoFactor(parent: ProductPresentation): void {
    const qpp = this.form.get('quantity_per_parent')?.value;
    if (!qpp || qpp <= 0) return;
    const suggested = parent.factor_to_base / qpp;
    if (Number.isInteger(suggested) && suggested >= 1) {
      const current = this.form.get('factor_to_base')?.value;
      if (!current || current === 1) this.form.get('factor_to_base')?.setValue(suggested);
    }
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    const raw = this.form.value;

    // Determinar el productId a usar
    const productId = this.showProductSelector
      ? (raw.product_id ?? 0)
      : (this.data.productId || raw.product_id || 0);

    if (!productId) {
      this.errors.set(['Debes seleccionar un producto.']);
      return;
    }
    if (raw.parent_id && !raw.quantity_per_parent) {
      this.errors.set(['La cantidad por padre es requerida cuando hay un empaque padre.']);
      return;
    }

    this.errors.set([]);
    this.saving.set(true);

    const payload: any = {
      parent_id: raw.parent_id ?? null,
      name: raw.name,
      code: raw.code,
      units_of_measure_id: raw.units_of_measure_id,
      factor_to_base: raw.factor_to_base,
      quantity_per_parent: raw.quantity_per_parent ?? null,
      level: raw.level,
      sort_order: raw.sort_order ?? 0,
      is_purchase_default: raw.is_purchase_default,
      is_active: raw.is_active,
    };

    const req$ = this.data.presentation
      ? this.svc.updatePresentation(this.data.presentation.id, payload)
      : this.svc.createPresentation(productId, payload);

    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        } else {
          this.errors.set([err.error?.message || 'Error al guardar el empaque']);
        }
      },
    });
  }
}

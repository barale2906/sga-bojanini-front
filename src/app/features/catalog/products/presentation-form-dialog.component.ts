import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { switchMap, of } from 'rxjs';
import { CatalogService, ProductPresentation, UnitOfMeasure, PresentationAttachPayload } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

export interface PresentationDialogData {
  /** null = crear nueva */
  presentation: ProductPresentation | null;
  units: UnitOfMeasure[];
  /** Todas las presentaciones del catálogo global (para selector de padre) */
  catalogPresentations: ProductPresentation[];
  /**
   * Cuando se abre desde el detalle de un producto:
   * después de crear/editar, vincula automáticamente al producto.
   */
  productId?: number;
  productName?: string;
}

@Component({
  selector: 'app-presentation-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatStepperModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatSlideToggleModule,
    MatProgressSpinnerModule,
    FormErrorsComponent,
  ],
  template: `
<h2 mat-dialog-title style="display:flex;align-items:center;gap:0.5rem;padding-bottom:0">
  <mat-icon style="color:#3182ce">inventory_2</mat-icon>
  {{ data.presentation ? 'Editar Empaque' : 'Nuevo Empaque' }}
  @if (data.productName) {
    <span style="font-size:0.78rem;font-weight:400;color:#718096;margin-left:0.25rem">→ {{ data.productName }}</span>
  }
</h2>

<mat-dialog-content style="min-width:580px;max-width:700px;max-height:82vh;overflow-y:auto;padding-top:0.5rem">
  <app-form-errors [errors]="errors()"></app-form-errors>

  <mat-stepper [linear]="!data.presentation" orientation="horizontal" #stepper>

    <!-- ════ PASO 1: IDENTIFICACIÓN ════ -->
    <mat-step [stepControl]="step1" label="Identificación">
      <form [formGroup]="step1" class="step-body">
        <p class="step-hint">Nombre y código único del empaque en el catálogo.</p>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Nombre del empaque *</mat-label>
          <input matInput formControlName="name" placeholder="Ej. Caja × 500, Paquete × 100" />
          @if (step1.get('name')?.hasError('required') && step1.get('name')?.touched) {
            <mat-error>Nombre requerido</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Código único *</mat-label>
          <input matInput formControlName="code" placeholder="Ej. CJ-500, PQ-100"
                 style="text-transform:uppercase" />
          <mat-hint class="small-hint">Debe ser único en todo el catálogo</mat-hint>
          @if (step1.get('code')?.hasError('required') && step1.get('code')?.touched) {
            <mat-error>Código requerido</mat-error>
          }
        </mat-form-field>
      </form>
      <div class="step-nav">
        <span></span>
        <button mat-raised-button color="primary" matStepperNext [disabled]="step1.invalid">
          Siguiente <mat-icon>chevron_right</mat-icon>
        </button>
      </div>
    </mat-step>

    <!-- ════ PASO 2: JERARQUÍA ════ -->
    <mat-step [stepControl]="step2" label="Jerarquía">
      <form [formGroup]="step2" class="step-body">
        <p class="step-hint">
          ¿Este empaque va <em>dentro</em> de otro mayor?
          Déjalo en <strong>Ninguno</strong> si es el contenedor más grande del producto.
        </p>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Empaque padre</mat-label>
          <mat-select formControlName="parent_id">
            <mat-option [value]="null">⬛ Ninguno — este es el nivel raíz</mat-option>
            @for (p of parentOptions(); track p.id) {
              <mat-option [value]="p.id">
                <span class="lvl-chip lvl-chip--{{ p.level }}">L{{ p.level }}</span>
                {{ p.name }}
                <span style="color:#a0aec0;font-size:0.8em"> · ×{{ p.factor_to_base }}</span>
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (_parentIdSig()) {
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>¿Cuántos de este caben en 1 padre? *</mat-label>
            <input matInput type="number" min="1" formControlName="quantity_per_parent" />
            <mat-hint class="small-hint">
              Cuántos "{{ _nameSig() || 'este empaque' }}" caben en 1 "{{ selectedParentName() }}"
            </mat-hint>
            @if (step2.get('quantity_per_parent')?.hasError('required') && step2.get('quantity_per_parent')?.touched) {
              <mat-error>Requerido cuando hay empaque padre</mat-error>
            }
          </mat-form-field>
        }

        <!-- Nivel calculado -->
        <div class="level-row">
          <mat-icon style="color:#718096;font-size:1rem;height:1rem;width:1rem">account_tree</mat-icon>
          <span style="font-size:0.82rem;color:#4a5568">
            Nivel en la jerarquía: <strong>{{ computedLevel() }}</strong>
            @if (computedLevel() === 1) {
              <span style="color:#a0aec0"> (raíz — sin padre)</span>
            } @else {
              <span style="color:#38a169"> (dentro de "{{ selectedParentName() }}")</span>
            }
          </span>
        </div>
      </form>
      <div class="step-nav">
        <button mat-button matStepperPrevious><mat-icon>chevron_left</mat-icon> Atrás</button>
        <button mat-raised-button color="primary" matStepperNext [disabled]="step2.invalid">
          Siguiente <mat-icon>chevron_right</mat-icon>
        </button>
      </div>
    </mat-step>

    <!-- ════ PASO 3: CONVERSIÓN ════ -->
    <mat-step [stepControl]="step3" label="Conversión">
      <form [formGroup]="step3" class="step-body">
        <p class="step-hint">
          Define cuántas <strong>unidades mínimas de inventario</strong> trae 1 unidad de este empaque.
        </p>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Tipo de contenedor *</mat-label>
          <mat-select formControlName="units_of_measure_id">
            @for (u of data.units; track u.id) {
              <mat-option [value]="u.id">
                <strong style="font-family:monospace">{{ u.abbreviation }}</strong> — {{ u.name }}
              </mat-option>
            }
          </mat-select>
          <mat-hint class="small-hint">Etiqueta del contenedor: Caja, Paquete, Unidad… Solo clasifica.</mat-hint>
          @if (step3.get('units_of_measure_id')?.hasError('required') && step3.get('units_of_measure_id')?.touched) {
            <mat-error>Selecciona el tipo</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Factor a unidad base *</mat-label>
          <mat-icon matSuffix style="font-size:1rem;color:#718096">calculate</mat-icon>
          <input matInput type="number" min="1" formControlName="factor_to_base" />
          <mat-hint class="small-hint">
            Cuántas unidades mínimas trae 1 unidad de <em>este</em> empaque
          </mat-hint>
          @if (step3.get('factor_to_base')?.hasError('min')) {
            <mat-error>El factor debe ser mínimo 1</mat-error>
          }
          @if (step3.get('factor_to_base')?.hasError('required') && step3.get('factor_to_base')?.touched) {
            <mat-error>Requerido</mat-error>
          }
        </mat-form-field>

        <!-- Preview de conversión -->
        @if (conversionPreview(); as preview) {
          <div class="conv-preview" [class.conv-preview--warn]="coherenceWarn()">
            <mat-icon>{{ coherenceWarn() ? 'warning' : 'check_circle' }}</mat-icon>
            <div>
              <div style="font-weight:600;font-size:0.88rem">{{ preview }}</div>
              @if (coherenceWarn()) {
                <div style="font-size:0.76rem;color:#c05621;margin-top:0.2rem">
                  El padre tiene factor {{ selectedParent()?.factor_to_base }}.
                  Con {{ _qppSig() }} unidades por padre,
                  el factor correcto sería <strong>{{ suggestedFactor() }}</strong>.
                  <button mat-button style="font-size:0.75rem;padding:0 4px;height:auto;line-height:1.4;min-width:auto"
                          type="button" (click)="applyAutoFactor()">← Aplicar</button>
                </div>
              }
            </div>
          </div>
        }
      </form>
      <div class="step-nav">
        <button mat-button matStepperPrevious><mat-icon>chevron_left</mat-icon> Atrás</button>
        <button mat-raised-button color="primary" matStepperNext [disabled]="step3.invalid">
          Siguiente <mat-icon>chevron_right</mat-icon>
        </button>
      </div>
    </mat-step>

    <!-- ════ PASO 4: CONFIRMAR ════ -->
    <mat-step label="Confirmar">
      <div class="step-body">
        <p class="step-hint">Revisa el resumen antes de guardar.</p>

        <!-- Estado (solo edición) -->
        @if (data.presentation) {
          <form [formGroup]="step4" style="margin-bottom:0.5rem">
            <mat-slide-toggle formControlName="is_active" color="primary">
              {{ step4.get('is_active')?.value ? 'Empaque activo' : 'Empaque inactivo' }}
            </mat-slide-toggle>
          </form>
        }

        <!-- Resumen -->
        <div class="summary-box">
          <div class="summary-row">
            <span class="slabel">Nombre</span>
            <strong>{{ _nameSig() || '—' }}</strong>
          </div>
          <div class="summary-row">
            <span class="slabel">Código</span>
            <code class="code-tag">{{ step1.get('code')?.value || '—' }}</code>
          </div>
          <div class="summary-row">
            <span class="slabel">Nivel</span>
            <span class="lvl-chip lvl-chip--{{ computedLevel() }}">L{{ computedLevel() }}</span>
            @if (selectedParent()) {
              <span style="font-size:0.8rem;color:#718096;margin-left:0.3rem">
                dentro de "{{ selectedParentName() }}"
              </span>
            }
          </div>
          @if (_qppSig()) {
            <div class="summary-row">
              <span class="slabel">Por padre</span>
              <span>{{ _qppSig() }} en 1 "{{ selectedParentName() }}"</span>
            </div>
          }
          <div class="summary-row">
            <span class="slabel">Factor a base</span>
            <strong style="color:#276749">× {{ _factorSig() }}</strong>
            <span style="font-size:0.78rem;color:#a0aec0;margin-left:0.3rem">
              (1 {{ _nameSig() }} = {{ _factorSig() }} unidades base)
            </span>
          </div>
        </div>
      </div>
      <div class="step-nav">
        <button mat-button matStepperPrevious><mat-icon>chevron_left</mat-icon> Atrás</button>
        <button mat-raised-button color="primary" (click)="save()"
                [disabled]="saving() || step1.invalid || step3.invalid">
          @if (saving()) {
            <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner>
          }
          {{ data.presentation ? 'Guardar cambios' : 'Crear empaque' }}
        </button>
      </div>
    </mat-step>

  </mat-stepper>
</mat-dialog-content>
  `,
  styles: [`
    .step-body { display:flex; flex-direction:column; gap:0.65rem; padding:0.75rem 0 0.5rem; }
    .w-full { width:100%; }
    .step-nav {
      display:flex; justify-content:space-between; align-items:center;
      margin-top:0.75rem; padding-top:0.5rem; border-top:1px solid #e2e8f0;
    }
    .step-hint { font-size:0.8rem; color:#718096; margin:0 0 0.25rem; }
    .small-hint { font-size:0.72rem !important; }

    .lvl-chip {
      display:inline-flex;align-items:center;justify-content:center;
      padding:0.05rem 0.35rem;border-radius:3px;font-size:0.72rem;font-weight:700;margin-right:0.3rem;
      &--1 { background:#e9d8fd;color:#553c9a; }
      &--2 { background:#bee3f8;color:#2c5282; }
      &--3 { background:#c6f6d5;color:#276749; }
    }

    .level-row {
      display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.6rem;
      background:#f7fafc;border-radius:6px;border:1px solid #e2e8f0;
    }

    .conv-preview {
      display:flex;gap:0.5rem;align-items:flex-start;
      border-radius:8px;padding:0.55rem 0.85rem;
      background:#F0FFF4;border:1px solid #68d391;color:#276749;
      mat-icon { font-size:1.1rem;height:1.1rem;width:1.1rem;margin-top:0.05rem;flex-shrink:0; }
      &--warn { background:#FFFAF0;border-color:#F6AD55;color:#744210;
        mat-icon { color:#dd6b20; } }
    }

    .summary-box {
      background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;
      padding:0.75rem 0.9rem;display:flex;flex-direction:column;gap:0.35rem;
    }
    .summary-row { display:flex;align-items:center;gap:0.5rem;font-size:0.83rem; }
    .slabel { color:#718096;min-width:90px;font-size:0.78rem;flex-shrink:0; }
    .code-tag {
      background:#e2e8f0;padding:0.1rem 0.4rem;border-radius:4px;
      font-size:0.78rem;font-family:monospace;
    }
  `],
})
export class PresentationFormDialogComponent implements OnInit {
  data: PresentationDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<PresentationFormDialogComponent>);
  private svc = inject(CatalogService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);

  // ── Señales reactivas para los valores de los pasos ──────────
  // Los computed() de Angular NO leen reactivamente .value de FormControl,
  // por eso sincronizamos manualmente con estas señales.
  _nameSig      = signal<string>('');
  _parentIdSig  = signal<number | null>(null);
  _qppSig       = signal<number | null>(null);   // quantity_per_parent
  _factorSig    = signal<number>(1);

  // ── FormGroups por paso ──────────────────────────────────────
  step1 = this.fb.group({
    name: ['', Validators.required],
    code: ['', Validators.required],
  });

  step2 = this.fb.group({
    parent_id:           [null as number | null],
    quantity_per_parent: [null as number | null],
  });

  step3 = this.fb.group({
    units_of_measure_id: [null as number | null, Validators.required],
    factor_to_base:      [1, [Validators.required, Validators.min(1)]],
  });

  /** Solo para el toggle de is_active en modo edición */
  step4 = this.fb.group({
    is_active: [true],
  });

  // ── Computed (usando señales reactivas) ─────────────────────

  parentOptions = computed(() =>
    this.data.presentation
      ? this.data.catalogPresentations.filter(p => p.id !== this.data.presentation!.id)
      : this.data.catalogPresentations
  );

  selectedParent = computed<ProductPresentation | null>(() => {
    const pid = this._parentIdSig();
    return this.parentOptions().find(p => p.id === pid) ?? null;
  });

  selectedParentName = computed<string>(() => this.selectedParent()?.name ?? '—');

  /** Nivel = padre.level + 1, o 1 si no hay padre */
  computedLevel = computed<number>(() => {
    const parent = this.selectedParent();
    return parent ? parent.level + 1 : 1;
  });

  conversionPreview = computed<string | null>(() => {
    const f = this._factorSig();
    const n = this._nameSig() || 'este empaque';
    if (!f || f < 1) return null;
    return `1 "${n}" = ${f} unidades base en inventario`;
  });

  coherenceWarn = computed<boolean>(() => {
    const parent = this.selectedParent();
    if (!parent) return false;
    const qpp = Number(this._qppSig());
    const factor = Number(this._factorSig());
    if (!qpp || !factor) return false;
    return parent.factor_to_base !== qpp * factor;
  });

  suggestedFactor = computed<number | null>(() => {
    const parent = this.selectedParent();
    if (!parent) return null;
    const qpp = Number(this._qppSig());
    if (!qpp) return null;
    const s = parent.factor_to_base / qpp;
    return Number.isInteger(s) && s >= 1 ? s : null;
  });

  // ── Lifecycle ─────────────────────────────────────────────────

  ngOnInit(): void {
    // Sincronizar señales reactivas con los FormControls
    this.step1.get('name')!.valueChanges
      .subscribe(v => this._nameSig.set(v ?? ''));

    this.step2.get('parent_id')!.valueChanges
      .subscribe(pid => {
        this._parentIdSig.set(pid);
        // Gestionar validador quantity_per_parent
        const qppCtrl = this.step2.get('quantity_per_parent')!;
        if (pid) {
          qppCtrl.addValidators(Validators.required);
        } else {
          qppCtrl.clearValidators();
          qppCtrl.setValue(null);
        }
        qppCtrl.updateValueAndValidity();
        this._tryAutoFactor();
      });

    this.step2.get('quantity_per_parent')!.valueChanges
      .subscribe(v => { this._qppSig.set(v); this._tryAutoFactor(); });

    this.step3.get('factor_to_base')!.valueChanges
      .subscribe(v => this._factorSig.set(v ?? 1));

    // Cargar datos en modo edición
    if (this.data.presentation) {
      const pr = this.data.presentation;

      this.step1.patchValue({ name: pr.name, code: pr.code });
      this.step2.patchValue({ parent_id: pr.parent_id, quantity_per_parent: pr.quantity_per_parent });
      this.step3.patchValue({ units_of_measure_id: pr.units_of_measure_id, factor_to_base: pr.factor_to_base });
      this.step4.patchValue({ is_active: pr.is_active });

      // Actualizar señales con los valores iniciales
      this._nameSig.set(pr.name);
      this._parentIdSig.set(pr.parent_id);
      this._qppSig.set(pr.quantity_per_parent);
      this._factorSig.set(pr.factor_to_base);

      // Activar validador de qty si tiene padre
      if (pr.parent_id) {
        this.step2.get('quantity_per_parent')!.addValidators(Validators.required);
        this.step2.get('quantity_per_parent')!.updateValueAndValidity();
      }
    }
  }

  applyAutoFactor(): void {
    const s = this.suggestedFactor();
    if (s != null) {
      this.step3.get('factor_to_base')?.setValue(s);
      this._factorSig.set(s);
    }
  }

  private _tryAutoFactor(): void {
    const parent = this.selectedParent();
    if (!parent) return;
    const qpp = Number(this._qppSig());
    if (!qpp || qpp <= 0) return;
    const suggested = parent.factor_to_base / qpp;
    if (Number.isInteger(suggested) && suggested >= 1) {
      const current = this.step3.get('factor_to_base')?.value;
      if (!current || current === 1) {
        this.step3.get('factor_to_base')?.setValue(suggested);
        this._factorSig.set(suggested);
      }
    }
  }

  // ── Guardar ───────────────────────────────────────────────────

  save(): void {
    if (this.saving()) return;
    this.errors.set([]);
    this.saving.set(true);

    // Payload del catálogo global (sin product_id ni is_purchase_default)
    const catalogPayload = {
      name:                this.step1.value.name!,
      code:                this.step1.value.code!,
      parent_id:           this._parentIdSig() ?? null,
      quantity_per_parent: this._qppSig() ?? null,
      level:               this.computedLevel(),   // calculado desde la señal reactiva
      units_of_measure_id: this.step3.value.units_of_measure_id!,
      factor_to_base:      this._factorSig(),
      sort_order:          0,
      is_active:           this.step4.value.is_active ?? true,
    };

    const handleError = (err: any) => {
      this.saving.set(false);
      if (err.status === 422) {
        this.errors.set(Object.values(err.error?.errors ?? {}).flat() as string[]);
      } else {
        this.errors.set([err.error?.message ?? 'Error al guardar el empaque']);
      }
    };

    const productId = this.data.productId ?? 0;
    const attachPayload: PresentationAttachPayload = { is_purchase_default: false, sort_order: 0 };

    if (this.data.presentation) {
      // EDITAR
      this.svc.updatePresentation(this.data.presentation.id, catalogPayload).pipe(
        switchMap(() => productId
          ? this.svc.attachPresentation(productId, this.data.presentation!.id, attachPayload)
          : of(null)
        ),
      ).subscribe({ next: () => this.ref.close(true), error: handleError });
    } else {
      // CREAR: crear en catálogo global → vincular al producto si aplica
      this.svc.createPresentation(catalogPayload).pipe(
        switchMap(res => productId
          ? this.svc.attachPresentation(productId, res.data.id, attachPayload)
          : of(null)
        ),
      ).subscribe({ next: () => this.ref.close(true), error: handleError });
    }
  }
}

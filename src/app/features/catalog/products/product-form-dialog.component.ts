import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormArray, FormGroup } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { switchMap, map, of, forkJoin } from 'rxjs';
import { CatalogService, Product, Category, UnitOfMeasure, ProductPresentation, ProductClassification } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { VolumeCalculatorComponent } from '../../../shared/components/volume-calculator/volume-calculator.component';

export interface ProductDialogData {
  product: Product | null;
  categories: Category[];
  units: UnitOfMeasure[];
  simpleProducts: Product[];
  catalogPresentations: ProductPresentation[];
  classifications: ProductClassification[];
}

@Component({
  selector: 'app-product-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatStepperModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatSlideToggleModule,
    MatProgressSpinnerModule, MatTooltipModule, MatChipsModule,
    FormErrorsComponent,
    VolumeCalculatorComponent,
  ],
  templateUrl: './product-form-dialog.component.html',
  styles: [`
    .step-body { display:flex; flex-direction:column; gap:0.6rem; padding:0.75rem 0 0.5rem; }
    .w-full  { width:100%; }
    .row-2   { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
    .step-nav {
      display:flex; justify-content:space-between; align-items:center;
      margin-top:0.75rem; padding-top:0.5rem; border-top:1px solid #e2e8f0;
    }
    .step-hint { font-size:0.8rem; color:#718096; margin:0 0 0.25rem; }
    .small-hint { font-size:0.72rem !important; }
    .section-label {
      font-size:0.78rem; font-weight:700; color:#4a5568;
      text-transform:uppercase; letter-spacing:0.04em; margin:0.25rem 0 0;
    }

    /* Info hint (clasificación) */
    .info-hint {
      display:flex; align-items:center; gap:0.5rem;
      padding:0.5rem 0.75rem;
      background:#ebf8ff; border:1px solid #bee3f8;
      border-radius:6px; font-size:0.82rem; color:#2c5282;
      mat-icon { flex-shrink:0; color:#3182ce; }
    }

    /* Tipo de producto cards */
    .type-cards { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
    .type-card {
      border:2px solid #e2e8f0; border-radius:10px; padding:0.9rem 1rem;
      cursor:pointer; transition:all .15s; background:#fafafa;
      &:hover { border-color:#90cdf4; background:#EBF8FF; }
      &.selected { border-color:#3182ce; background:#EBF8FF; }
    }
    .type-card-title { font-weight:700; font-size:0.9rem; }
    .type-card-desc  { font-size:0.78rem; color:#718096; margin-top:0.2rem; }

    /* BOM */
    .kit-row { display:grid; grid-template-columns:1fr 110px 36px; gap:0.5rem; align-items:flex-start; }
    .bom-empty { text-align:center; color:#a0aec0; font-size:0.85rem; padding:0.75rem 0; }

    /* Presentations checklist */
    .pres-search { margin-bottom:0.5rem; }
    .pres-list { display:flex; flex-direction:column; gap:0.35rem; max-height:280px; overflow-y:auto; padding-right:2px; }
    .pres-item {
      display:flex; align-items:center; gap:0.6rem;
      padding:0.45rem 0.75rem; border-radius:8px;
      border:2px solid #e2e8f0; background:#fafafa;
      cursor:pointer; transition:all .12s; user-select:none;
      &:hover { border-color:#90cdf4; background:#EBF8FF; }
      &.pres-item--selected { border-color:#3182ce; background:#EBF8FF; }
    }
    .pres-check {
      width:18px; height:18px; border-radius:4px; border:2px solid #cbd5e0;
      display:flex; align-items:center; justify-content:center; flex-shrink:0;
      background:#fff; transition:all .12s;
      mat-icon { font-size:0.85rem; height:0.85rem; width:0.85rem; color:#fff; }
      .pres-item--selected & { background:#3182ce; border-color:#3182ce; }
    }
    .lvl-chip {
      display:inline-flex; align-items:center; justify-content:center;
      padding:0.05rem 0.35rem; border-radius:3px; font-size:0.7rem; font-weight:700; flex-shrink:0;
      &--1 { background:#e9d8fd; color:#553c9a; }
      &--2 { background:#bee3f8; color:#2c5282; }
      &--3 { background:#c6f6d5; color:#276749; }
    }
    .pres-name  { font-weight:500; font-size:0.85rem; }
    .pres-code  { font-size:0.75rem; font-family:monospace; background:#e2e8f0; padding:0.1rem 0.3rem; border-radius:3px; }
    .pres-factor { font-size:0.78rem; color:#276749; font-weight:600; margin-left:auto; flex-shrink:0; }
    .pres-empty { text-align:center; color:#a0aec0; font-size:0.85rem; padding:1rem 0; }

    /* Summary box */
    .summary-box {
      background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px;
      padding:0.75rem 0.9rem; display:flex; flex-direction:column; gap:0.3rem;
    }
    .summary-row { display:flex; align-items:baseline; gap:0.5rem; font-size:0.83rem; }
    .slabel { color:#718096; min-width:120px; font-size:0.78rem; flex-shrink:0; }
    .code-tag { background:#e2e8f0; padding:0.1rem 0.4rem; border-radius:4px; font-size:0.78rem; font-family:monospace; }
  `],
})
export class ProductFormDialogComponent implements OnInit {
  data: ProductDialogData = inject(MAT_DIALOG_DATA);
  private ref  = inject(MatDialogRef<ProductFormDialogComponent>);
  private svc  = inject(CatalogService);
  private fb   = inject(FormBuilder);

  saving               = signal(false);
  loadingComponents    = signal(false);
  loadingAssignedPres  = signal(false);
  errors               = signal<string[]>([]);
  fe                   = signal<Record<string, string[]>>({});

  // ── Señales reactivas ──────────────────────────────────────
  _typeSig     = signal<string>('simple');
  _baseUnitSig = signal<number | null>(null);

  isKit = computed(() => this._typeSig() === 'kit');

  // ── Clasificación reactiva ─────────────────────────────────
  _classifSig            = signal<ProductClassification | null>(null);
  selectedClassification = computed(() => this._classifSig());
  showConcentration      = computed(() => this._classifSig()?.has_concentration ?? false);
  showRiskLevel          = computed(() => this._classifSig()?.has_risk_level ?? false);
  showLabBrand           = computed(() => this._classifSig()?.has_lab_brand ?? false);
  showPharmaFields       = computed(() => this._classifSig()?.has_pharma_fields ?? false);
  showDeviceFields       = computed(() => this._classifSig()?.has_device_fields ?? false);
  showSanitaryReg        = computed(() => this._classifSig()?.has_sanitary_registration ?? false);

  // ── Presentaciones ─────────────────────────────────────────
  selectedPresentationIds  = signal<Set<number>>(new Set());
  _originalPresIds         = signal<Set<number>>(new Set());
  defaultPresentationId    = signal<number | null>(null);
  presentationSearch       = signal('');

  filteredPresentations = computed(() => {
    const q   = this.presentationSearch().toLowerCase().trim();
    const all = this.data.catalogPresentations ?? [];
    if (!q) return all;
    return all.filter(p =>
      p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  });

  selectedPresentationsList = computed(() => {
    const ids = this.selectedPresentationIds();
    return (this.data.catalogPresentations ?? []).filter(p => ids.has(p.id));
  });

  // ── BOM (components) ──────────────────────────────────────
  simpleProducts   = signal<Product[]>([]);
  componentSearch  = signal('');

  filteredSimpleProducts = computed(() => {
    const q = this.componentSearch().toLowerCase().trim();
    return q
      ? this.simpleProducts().filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      : this.simpleProducts();
  });

  // ── Unidad base seleccionada ───────────────────────────────
  selectedBaseUnitAbbr = computed(() => {
    const id = this._baseUnitSig();
    return id ? (this.data.units.find(u => u.id === id)?.abbreviation ?? 'uds.') : 'uds.';
  });

  // ── FormGroups por paso ────────────────────────────────────
  stepTipo = this.fb.group({
    product_type: ['simple', Validators.required],
  });

  stepIdent = this.fb.group({
    name:        ['', [Validators.required, Validators.maxLength(255)]],
    code:        ['', [Validators.required, Validators.maxLength(50)]],
    sku:         [null as string | null],
    category_id: [null as number | null, Validators.required],
    description: [''],
  });

  stepClassif = this.fb.group({
    classification_id:       [null as number | null],
    concentration:           [null as string | null, Validators.maxLength(100)],
    risk_level:              [null as string | null, Validators.maxLength(100)],
    lab_brand:               [null as string | null, Validators.maxLength(255)],
    pharmaceutical_form:     [null as string | null, Validators.maxLength(150)],
    commercial_presentation: [null as string | null, Validators.maxLength(150)],
    serie_reference:         [null as string | null, Validators.maxLength(150)],
    useful_life:             [null as string | null, Validators.maxLength(100)],
  });

  stepInv = this.fb.group({
    base_unit_id:      [null as number | null, Validators.required],
    requires_cold_chain: [false],
    reorder_point:     [0, Validators.min(0)],
    reorder_quantity:  [0, Validators.min(0)],
    min_stock:         [0, Validators.min(0)],
    max_stock:         [0, Validators.min(0)],
    volume_cm3:        [null as number | null, Validators.min(0)],
    weight_kg:         [null as number | null, Validators.min(0)],
    components:        this.fb.array([]),
  });

  stepFinal = this.fb.group({
    is_active: [true],
  });

  get componentsArray(): FormArray {
    return this.stepInv.get('components') as FormArray;
  }

  getRowOptions(rowIndex: number): Product[] {
    const filtered   = this.filteredSimpleProducts();
    const selectedId = (this.componentsArray.at(rowIndex) as FormGroup).get('component_product_id')?.value as number | null;
    if (!selectedId || filtered.some(p => p.id === selectedId)) return filtered;
    const selected = this.simpleProducts().find(p => p.id === selectedId);
    return selected ? [selected, ...filtered] : filtered;
  }

  getProductLabel(id: number | null): string {
    if (!id) return '';
    const p = this.simpleProducts().find(p => p.id === id);
    return p ? `${p.name} (${p.code})` : String(id);
  }

  // ── Presentaciones — métodos ──────────────────────────────
  isSelected(id: number): boolean {
    return this.selectedPresentationIds().has(id);
  }

  togglePresentation(id: number): void {
    const s = new Set(this.selectedPresentationIds());
    if (s.has(id)) {
      s.delete(id);
      if (this.defaultPresentationId() === id) this.defaultPresentationId.set(null);
    } else {
      s.add(id);
      if (s.size === 1) this.defaultPresentationId.set(id); // auto-default al primero
    }
    this.selectedPresentationIds.set(s);
  }

  setDefault(id: number): void {
    this.defaultPresentationId.set(id);
  }

  isDefault(id: number): boolean {
    return this.defaultPresentationId() === id;
  }

  // ── Helpers ───────────────────────────────────────────────
  getCategoryName(id: number | null | undefined): string {
    if (!id) return '—';
    return this.data.categories.find(c => c.id === id)?.name ?? '—';
  }

  // ── BOM — métodos ─────────────────────────────────────────
  addComponentRow(): void {
    this.componentsArray.push(this.fb.group({
      component_product_id: [null as number | null, Validators.required],
      quantity_per_kit:     [1, [Validators.required, Validators.min(1)]],
    }));
  }

  removeComponentRow(i: number): void {
    this.componentsArray.removeAt(i);
  }

  // ── Lifecycle ─────────────────────────────────────────────
  ngOnInit(): void {
    this.simpleProducts.set(this.data.simpleProducts);

    // Sincronizar señal _typeSig
    this.stepTipo.get('product_type')!.valueChanges.subscribe(v => {
      this._typeSig.set(v || 'simple');
    });

    // Sincronizar señal _baseUnitSig
    this.stepInv.get('base_unit_id')!.valueChanges.subscribe(v => {
      this._baseUnitSig.set(v);
    });

    // Sincronizar _classifSig y validadores dinámicos
    this.stepClassif.get('classification_id')!.valueChanges.subscribe(id => {
      const classif = id ? (this.data.classifications.find(c => c.id === id) ?? null) : null;
      this._classifSig.set(classif);
      this._updateLabBrandValidator(classif);
    });

    if (this.data.product) {
      const p = this.data.product;
      this._typeSig.set(p.product_type);
      this._baseUnitSig.set(p.base_unit_id);

      this.stepTipo.patchValue({ product_type: p.product_type });
      this.stepIdent.patchValue({ name: p.name, code: p.code, sku: p.sku, category_id: p.category_id, description: p.description ?? '' });
      this.stepClassif.patchValue({
        classification_id:       p.classification_id ?? null,
        concentration:           p.concentration           ?? null,
        risk_level:              p.risk_level              ?? null,
        lab_brand:               p.lab_brand               ?? null,
        pharmaceutical_form:     p.pharmaceutical_form     ?? null,
        commercial_presentation: p.commercial_presentation ?? null,
        serie_reference:         p.serie_reference         ?? null,
        useful_life:             p.useful_life             ?? null,
      });
      if (p.classification_id) {
        const classif = this.data.classifications.find(c => c.id === p.classification_id)
          ?? (p.classification ?? null);
        this._classifSig.set(classif);
        this._updateLabBrandValidator(classif);
      }
      this.stepInv.patchValue({
        base_unit_id: p.base_unit_id,
        requires_cold_chain: p.requires_cold_chain,
        reorder_point: p.reorder_point,
        reorder_quantity: p.reorder_quantity,
        min_stock: p.min_stock,
        max_stock: p.max_stock,
        volume_cm3: p.volume_cm3 ?? null,
        weight_kg:  p.weight_kg  ?? null,
      });
      this.stepFinal.patchValue({ is_active: p.is_active });

      if (p.product_type === 'kit') {
        this._loadExistingComponents(p.id);
      } else {
        this._loadAssignedPresentations(p.id);
      }
    }
  }

  private _updateLabBrandValidator(classif: ProductClassification | null | undefined): void {
    const ctrl = this.stepClassif.get('lab_brand')!;
    if (classif?.has_lab_brand) {
      ctrl.setValidators([Validators.required, Validators.maxLength(255)]);
    } else {
      ctrl.setValidators([Validators.maxLength(255)]);
    }
    ctrl.updateValueAndValidity();
  }

  private _loadExistingComponents(productId: number): void {
    this.loadingComponents.set(true);
    this.svc.getKitComponents(productId).subscribe({
      next: r => {
        this.loadingComponents.set(false);
        while (this.componentsArray.length) this.componentsArray.removeAt(0);
        r.data.forEach(c => {
          this.componentsArray.push(this.fb.group({
            component_product_id: [c.component_product_id, Validators.required],
            quantity_per_kit:     [c.quantity_per_kit, [Validators.required, Validators.min(1)]],
          }));
        });
      },
      error: () => {
        this.loadingComponents.set(false);
        this.errors.set(['No se pudieron cargar los componentes actuales del kit.']);
      },
    });
  }

  private _loadAssignedPresentations(productId: number): void {
    this.loadingAssignedPres.set(true);
    this.svc.getPresentations(productId).subscribe({
      next: r => {
        const ids = new Set(r.data.map((pr: ProductPresentation) => pr.id));
        this.selectedPresentationIds.set(ids);
        this._originalPresIds.set(new Set(ids));
        const def = r.data.find((pr: ProductPresentation) => pr.is_purchase_default);
        if (def) this.defaultPresentationId.set(def.id);
        else if (ids.size > 0) this.defaultPresentationId.set([...ids][0]);
        this.loadingAssignedPres.set(false);
      },
      error: () => this.loadingAssignedPres.set(false),
    });
  }

  // ── Guardar ───────────────────────────────────────────────
  save(): void {
    if (this.saving()) return;
    if (this.isKit() && this.componentsArray.length === 0) {
      this.errors.set(['Un kit debe tener al menos un componente.']); return;
    }
    this.errors.set([]); this.fe.set({}); this.saving.set(true);

    const ti = this.stepTipo.value;
    const si = this.stepIdent.value;
    const sc = this.stepClassif.value;
    const iv = this.stepInv.value;
    const sf = this.stepFinal.value;

    const basePayload: any = {
      product_type:            ti.product_type,
      name:                    si.name,
      code:                    si.code,
      sku:                     si.sku || null,
      category_id:             si.category_id,
      description:             si.description || null,
      classification_id:       sc.classification_id || null,
      concentration:           sc.concentration           || null,
      risk_level:              sc.risk_level              || null,
      lab_brand:               sc.lab_brand               || null,
      pharmaceutical_form:     sc.pharmaceutical_form     || null,
      commercial_presentation: sc.commercial_presentation || null,
      serie_reference:         sc.serie_reference         || null,
      useful_life:             sc.useful_life             || null,
      base_unit_id:            iv.base_unit_id,
      requires_cold_chain:     iv.requires_cold_chain,
      reorder_point:           iv.reorder_point ?? 0,
      reorder_quantity:        iv.reorder_quantity ?? 0,
      min_stock:               iv.min_stock ?? 0,
      max_stock:               iv.max_stock ?? 0,
      volume_cm3:              iv.volume_cm3 != null ? Number(iv.volume_cm3) : null,
      weight_kg:               iv.weight_kg  != null ? Number(iv.weight_kg)  : null,
      is_active:               sf.is_active ?? true,
    };

    const kitComponents = (iv.components as any[]).map(c => ({
      component_product_id: c.component_product_id,
      quantity_per_kit:     c.quantity_per_kit,
    }));

    const defaultId = this.defaultPresentationId();

    if (!this.data.product) {
      // ── CREAR ────────────────────────────────────────────────
      if (this.isKit()) {
        basePayload.components = kitComponents;
      }

      this.svc.createProduct(basePayload).pipe(
        switchMap(res => {
          if (!this.isKit()) {
            const toAttach = [...this.selectedPresentationIds()];
            if (toAttach.length === 0) return of(res);
            const ops = toAttach.map(id =>
              this.svc.attachPresentation(res.data.id, id, { is_purchase_default: id === defaultId })
            );
            return forkJoin(ops).pipe(map(() => res));
          }
          return of(res);
        })
      ).subscribe({
        next: res => { this.saving.set(false); this.ref.close(res.data); },
        error: err => this._handleError(err),
      });

    } else {
      // ── EDITAR ───────────────────────────────────────────────
      const productId = this.data.product.id;

      if (this.isKit()) {
        this.svc.updateProduct(productId, basePayload).pipe(
          switchMap(res =>
            this.svc.syncKitComponents(productId, kitComponents).pipe(map(() => res))
          )
        ).subscribe({
          next: res => { this.saving.set(false); this.ref.close(res.data); },
          error: err => this._handleError(err),
        });

      } else {
        // Calcular delta de presentaciones
        const original = this._originalPresIds();
        const current  = this.selectedPresentationIds();
        const toUpsert = [...current]; // re-attach todos los seleccionados (actualiza pivot)
        const toDetach = [...original].filter(id => !current.has(id));

        this.svc.updateProduct(productId, basePayload).pipe(
          switchMap(res => {
            const ops = [
              ...toUpsert.map(id =>
                this.svc.attachPresentation(productId, id, { is_purchase_default: id === defaultId })
              ),
              ...toDetach.map(id => this.svc.detachPresentation(productId, id)),
            ];
            return ops.length > 0
              ? forkJoin(ops).pipe(map(() => res))
              : of(res);
          })
        ).subscribe({
          next: res => { this.saving.set(false); this.ref.close(res.data); },
          error: err => this._handleError(err),
        });
      }
    }
  }

  private _handleError(err: any): void {
    this.saving.set(false);
    if (err.status === 422 || err.status === 409) {
      this.fe.set(err.error?.errors || {});
      const msgs = err.error?.errors
        ? (Object.values(err.error.errors).flat() as string[])
        : [err.error?.message || 'Error de validación'];
      this.errors.set(msgs);
    } else {
      this.errors.set([err.error?.message || 'Error al guardar el producto']);
    }
  }
}

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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { forkJoin, of, switchMap, map, catchError } from 'rxjs';
import {
  CatalogService,
  Supplier,
  Category,
  Product,
  ProductPresentation,
} from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

// ── Interfaces públicas ────────────────────────────────────────

export interface SupplierDialogData {
  supplier: Supplier | null;
  categories: Category[];
  /** Solo productos simples activos (sin kits) */
  products: Product[];
  catalogPresentations: ProductPresentation[];
}

interface WorkingProduct {
  productId: number;
  name: string;
  code: string;
  sku: string | null;
  categoryName: string;
  pivot: {
    supplier_sku: string | null;
    product_presentation_id: number | null;
    lead_time_days: number | null;
    unit_price: number;
    is_preferred: boolean;
  };
  isNew: boolean;
  isDirty: boolean;
}

// ── Componente ─────────────────────────────────────────────────

@Component({
  selector: 'app-supplier-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatStepperModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatSlideToggleModule,
    MatProgressSpinnerModule, MatTooltipModule, MatDividerModule,
    FormErrorsComponent,
  ],
  templateUrl: './supplier-form-dialog.component.html',
  styles: [`
    .step-body { display:flex; flex-direction:column; gap:0.6rem; padding:0.75rem 0 0.5rem; }
    .w-full  { width:100%; }
    .row-2   { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
    .step-nav {
      display:flex; justify-content:space-between; align-items:center;
      margin-top:0.75rem; padding-top:0.5rem; border-top:1px solid #e2e8f0;
    }
    .step-hint { font-size:0.8rem; color:#718096; margin:0; }
    .section-label {
      font-size:0.78rem; font-weight:700; color:#4a5568;
      text-transform:uppercase; letter-spacing:0.04em; margin:0.25rem 0 0;
    }

    /* Products list */
    .products-list { display:flex; flex-direction:column; gap:0.35rem; max-height:220px; overflow-y:auto; padding-right:2px; }
    .product-row {
      border:2px solid #e2e8f0; border-radius:8px; overflow:hidden;
      background:#fafafa; transition:border-color .12s;
    }
    .product-row--new { border-color:#c6f6d5; background:#f0fff4; }
    .product-row--expanded { border-color:#90cdf4; }
    .product-row-main { display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0.6rem; }
    .product-info { display:flex; align-items:center; gap:0.35rem; flex:1; min-width:0; }
    .product-name { font-weight:500; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .product-cat { font-size:0.75rem; color:#718096; white-space:nowrap; }
    .product-meta { display:flex; align-items:center; gap:0.35rem; flex-shrink:0; }
    .product-actions { display:flex; align-items:center; flex-shrink:0; }
    .code-tag { background:#e2e8f0; padding:0.1rem 0.3rem; border-radius:3px; font-size:0.72rem; font-family:monospace; flex-shrink:0; }
    .price-tag { font-size:0.75rem; color:#276749; font-weight:600; background:#c6f6d5; padding:0.1rem 0.3rem; border-radius:3px; }
    .lead-tag  { font-size:0.75rem; color:#2c5282; font-weight:600; background:#bee3f8; padding:0.1rem 0.3rem; border-radius:3px; }
    .star-icon { font-size:1rem; height:1rem; width:1rem; color:#e6a817; }

    /* Pivot edit panel */
    .pivot-edit-panel {
      padding:0.6rem 0.75rem 0.5rem; border-top:1px solid #e2e8f0; background:#fff;
      display:flex; flex-direction:column; gap:0.5rem;
    }

    /* Empty state */
    .empty-products { text-align:center; padding:1.25rem; color:#a0aec0; }
    .empty-products mat-icon { font-size:2.5rem; height:2.5rem; width:2.5rem; display:block; margin:0 auto 0.5rem; }

    /* Add mode toggle */
    .add-mode-toggle { display:flex; gap:0.5rem; }
    .add-mode-toggle button { flex:1; font-size:0.8rem; }
    .add-mode-toggle button.active-toggle { background:#EBF8FF; border-color:#3182ce; color:#2c5282; }

    /* Product picker (individual) */
    .product-picker { display:flex; flex-direction:column; gap:0.25rem; max-height:180px; overflow-y:auto; margin-bottom:0.25rem; }
    .picker-item {
      display:flex; align-items:center; gap:0.45rem; padding:0.35rem 0.6rem;
      border:2px solid #e2e8f0; border-radius:8px; background:#fafafa;
      cursor:pointer; transition:all .1s;
      &:hover { border-color:#90cdf4; background:#EBF8FF; }
      &.picker-item--selected { border-color:#3182ce; background:#EBF8FF; }
    }
    .pres-check {
      width:16px; height:16px; border-radius:3px; border:2px solid #cbd5e0;
      display:flex; align-items:center; justify-content:center; flex-shrink:0; background:#fff;
      mat-icon { font-size:0.75rem; height:0.75rem; width:0.75rem; color:#fff; }
      .picker-item--selected & { background:#3182ce; border-color:#3182ce; }
    }

    /* Category preview checklist */
    .cat-preview {
      border:1px solid #e2e8f0; border-radius:8px;
      overflow:hidden;       /* contiene el scroll del listado */
      flex-shrink:0;         /* no se encoje por el stepper */
      margin-top:0.25rem;
      display:flex; flex-direction:column;
    }
    .cat-preview-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:0.4rem 0.6rem; background:#f7fafc; border-bottom:1px solid #e2e8f0;
      font-size:0.78rem; font-weight:600; color:#4a5568;
      flex-shrink:0;  /* el header no se comprime */
      /* sombra inferior para indicar que hay contenido desplazable debajo */
      box-shadow:0 2px 4px -1px rgba(0,0,0,.06);
      position:relative; z-index:1;
    }
    .cat-preview-list {
      display:flex; flex-direction:column;
      /*
       * clamp(mín, preferido-vh, máx)
       * – mín 280px  → siempre se ven al menos ~7 filas
       * – pref 40vh  → usa el 40 % del viewport (≈ 432px en 1080p)
       * – máx 520px  → no toma más de la mitad del modal en pantallas grandes
       * El scroll queda 100 % dentro de este div; el modal no crece.
       */
      max-height: clamp(280px, 40vh, 520px);
      overflow-y:auto;
      overflow-x:hidden;
      /* scrollbar visible pero discreta */
      scrollbar-width:thin;
      scrollbar-color:#cbd5e0 transparent;
      &::-webkit-scrollbar { width:5px; }
      &::-webkit-scrollbar-track { background:transparent; }
      &::-webkit-scrollbar-thumb { background:#cbd5e0; border-radius:4px; }
    }
    .cat-preview-item {
      display:flex; align-items:center; gap:0.45rem; padding:0.38rem 0.7rem;
      border-bottom:1px solid #f0f4f8; cursor:pointer; transition:background .1s;
      flex-shrink:0;  /* cada fila mantiene su altura */
      &:last-child { border-bottom:none; }
      &:hover { background:#EBF8FF; }
      &.cat-preview-item--checked { background:#f0fff4; }
    }
    .cat-check {
      width:16px; height:16px; border-radius:3px; border:2px solid #cbd5e0;
      display:flex; align-items:center; justify-content:center; flex-shrink:0; background:#fff;
      transition:all .1s;
      mat-icon { font-size:0.75rem; height:0.75rem; width:0.75rem; color:#fff; }
    }
    .cat-check--on { background:#38a169; border-color:#38a169; }
    .cat-empty { padding:0.75rem; text-align:center; color:#a0aec0; font-size:0.83rem; }

    .pres-empty { text-align:center; color:#a0aec0; font-size:0.85rem; padding:0.75rem 0; }

    /* Pivot form (add) */
    .pivot-form { background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.6rem 0.75rem; display:flex; flex-direction:column; gap:0.5rem; }

    /* Summary */
    .summary-box {
      background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px;
      padding:0.75rem 0.9rem; display:flex; flex-direction:column; gap:0.3rem;
    }
    .summary-row { display:flex; align-items:baseline; gap:0.5rem; font-size:0.83rem; }
    .slabel { color:#718096; min-width:130px; font-size:0.78rem; flex-shrink:0; }

    /* Loading row */
    .loading-row { display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0; }
  `],
})
export class SupplierFormDialogComponent implements OnInit {
  data: SupplierDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SupplierFormDialogComponent>);
  private svc = inject(CatalogService);
  private fb  = inject(FormBuilder);

  // ── Estado ──────────────────────────────────────────────────
  saving          = signal(false);
  loadingProducts = signal(false);
  errors          = signal<string[]>([]);
  fe              = signal<Record<string, string[]>>({});

  // Productos asignados en el wizard
  workingProducts    = signal<WorkingProduct[]>([]);
  originalProductIds = new Set<number>();
  expandedEditId     = signal<number | null>(null);

  // Modo de adición: individual | por categoría
  addMode              = signal<'individual' | 'category'>('individual');
  productSearch        = signal('');
  selectedAddProductId = signal<number | null>(null);

  // Selección por categoría
  selectedBatchCategoryId    = signal<number | null>(null);
  selectedCategoryProductIds = signal<Set<number>>(new Set());

  // ── FormGroups ───────────────────────────────────────────────

  stepGeneral = this.fb.group({
    name:         ['', Validators.required],
    tax_id:       [null as string | null],
    contact_name: [null as string | null],
    phone:        [null as string | null],
    email:        [null as string | null, Validators.email],
    address:      [null as string | null],
    notes:        [null as string | null],
    is_active:    [true],
  });

  addProductForm = this.fb.group({
    supplier_sku:            [null as string | null],
    product_presentation_id: [null as number | null],
    lead_time_days:          [null as number | null, Validators.min(0)],
    unit_price:              [0, Validators.min(0)],
    is_preferred:            [false],
  });

  addCategoryForm = this.fb.group({
    lead_time_days: [null as number | null, Validators.min(0)],
    unit_price:     [0, Validators.min(0)],
    is_preferred:   [false],
  });

  editPivotForm = this.fb.group({
    supplier_sku:            [null as string | null],
    product_presentation_id: [null as number | null],
    lead_time_days:          [null as number | null, Validators.min(0)],
    unit_price:              [0, Validators.min(0)],
    is_preferred:            [false],
  });

  // ── Computed ─────────────────────────────────────────────────

  get isEdit(): boolean { return !!this.data.supplier; }

  /** Productos simples disponibles para asignar individualmente */
  filteredProducts = computed(() => {
    const q           = this.productSearch().toLowerCase().trim();
    const assignedIds = new Set(this.workingProducts().map(p => p.productId));
    const available   = (this.data.products ?? []).filter(p =>
      !assignedIds.has(p.id) && p.is_active && p.product_type === 'simple',
    );
    if (!q) return available;
    return available.filter(p =>
      p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q),
    );
  });

  /**
   * Productos simples de la categoría seleccionada que aún no están asignados.
   * Se recalcula cuando cambia la categoría seleccionada o los productos asignados.
   */
  categoryProducts = computed(() => {
    const catId = this.selectedBatchCategoryId();
    if (!catId) return [];
    const assignedIds = new Set(this.workingProducts().map(p => p.productId));
    return (this.data.products ?? []).filter(p =>
      p.category_id === catId &&
      p.product_type === 'simple' &&
      p.is_active &&
      !assignedIds.has(p.id),
    );
  });

  /** Cuántos de los productos de la categoría están marcados */
  selectedCountInCategory = computed(() =>
    this.categoryProducts().filter(p => this.selectedCategoryProductIds().has(p.id)).length,
  );

  // ── Lifecycle ────────────────────────────────────────────────

  ngOnInit(): void {
    if (this.data.supplier) {
      this.stepGeneral.patchValue(this.data.supplier as any);
      this._loadExistingProducts();
    }
  }

  private _loadExistingProducts(): void {
    this.loadingProducts.set(true);
    this.svc.getSupplierProducts(this.data.supplier!.id).subscribe({
      next: r => {
        const wp: WorkingProduct[] = r.data.map(sp => ({
          productId:    sp.id,
          name:         sp.generic?.name ?? '',
          code:         sp.generic?.barcode ?? '',
          sku:          sp.brand_sku,
          categoryName: sp.generic?.category?.name ?? this.getCategoryName(sp.generic?.category?.id ?? 0),
          pivot: {
            supplier_sku:            sp.pivot.supplier_sku,
            product_presentation_id: sp.pivot.product_presentation_id,
            lead_time_days:          sp.pivot.lead_time_days,
            unit_price:              sp.pivot.unit_price,
            is_preferred:            sp.pivot.is_preferred,
          },
          isNew:   false,
          isDirty: false,
        }));
        this.workingProducts.set(wp);
        this.originalProductIds = new Set(wp.map(p => p.productId));
        this.loadingProducts.set(false);
      },
      error: () => this.loadingProducts.set(false),
    });
  }

  // ── Gestión individual de productos ──────────────────────────

  addProduct(): void {
    const id = this.selectedAddProductId();
    if (!id) return;
    const product = (this.data.products ?? []).find(p => p.id === id);
    if (!product) return;

    const v = this.addProductForm.value;
    this.workingProducts.update(prev => [...prev, {
      productId:    id,
      name:         product.name,
      code:         product.barcode,
      sku:          null,
      categoryName: product.category?.name ?? this.getCategoryName(product.category_id),
      pivot: {
        supplier_sku:            v.supplier_sku            ?? null,
        product_presentation_id: v.product_presentation_id ?? null,
        lead_time_days:          v.lead_time_days           ?? null,
        unit_price:              v.unit_price               ?? 0,
        is_preferred:            !!v.is_preferred,
      },
      isNew:   true,
      isDirty: false,
    }]);

    this.selectedAddProductId.set(null);
    this.productSearch.set('');
    this.addProductForm.reset({ unit_price: 0, is_preferred: false });
  }

  removeProduct(productId: number): void {
    this.workingProducts.update(prev => prev.filter(p => p.productId !== productId));
    if (this.expandedEditId() === productId) this.expandedEditId.set(null);
  }

  // ── Selección por categoría ──────────────────────────────────

  selectCategory(catId: number | null): void {
    this.selectedBatchCategoryId.set(catId);
    if (!catId) { this.selectedCategoryProductIds.set(new Set()); return; }

    // Pre-seleccionar todos los productos de la categoría disponibles
    const assignedIds = new Set(this.workingProducts().map(p => p.productId));
    const ids = (this.data.products ?? [])
      .filter(p => p.category_id === catId && p.product_type === 'simple' && p.is_active && !assignedIds.has(p.id))
      .map(p => p.id);
    this.selectedCategoryProductIds.set(new Set(ids));
  }

  toggleCategoryProduct(productId: number): void {
    const s = new Set(this.selectedCategoryProductIds());
    if (s.has(productId)) s.delete(productId); else s.add(productId);
    this.selectedCategoryProductIds.set(s);
  }

  isCategoryProductSelected(productId: number): boolean {
    return this.selectedCategoryProductIds().has(productId);
  }

  toggleSelectAllCategory(): void {
    const prods = this.categoryProducts();
    const sel   = this.selectedCategoryProductIds();
    const allSelected = prods.every(p => sel.has(p.id));
    if (allSelected) {
      // Deseleccionar todos
      this.selectedCategoryProductIds.set(new Set());
    } else {
      // Seleccionar todos
      this.selectedCategoryProductIds.set(new Set(prods.map(p => p.id)));
    }
  }

  /** Confirma la selección de categoría → pasa los productos marcados a workingProducts */
  addSelectedCategoryProducts(): void {
    const selectedIds = this.selectedCategoryProductIds();
    const v = this.addCategoryForm.value;
    const pivotDefaults = {
      supplier_sku:            null,
      product_presentation_id: null,
      lead_time_days:          v.lead_time_days ?? null,
      unit_price:              v.unit_price     ?? 0,
      is_preferred:            !!v.is_preferred,
    };

    const toAdd: WorkingProduct[] = this.categoryProducts()
      .filter(p => selectedIds.has(p.id))
      .map(p => ({
        productId:    p.id,
        name:         p.name,
        code:         p.barcode,
        sku:          null,
        categoryName: p.category?.name ?? this.getCategoryName(p.category_id),
        pivot:        { ...pivotDefaults },
        isNew:        true,
        isDirty:      false,
      }));

    if (toAdd.length === 0) return;

    this.workingProducts.update(prev => [...prev, ...toAdd]);

    // Resetear sección categoría
    this.selectedBatchCategoryId.set(null);
    this.selectedCategoryProductIds.set(new Set());
    this.addCategoryForm.reset({ unit_price: 0, is_preferred: false });
  }

  // ── Edit pivot inline ────────────────────────────────────────

  openEditPivot(wp: WorkingProduct): void {
    if (this.expandedEditId() === wp.productId) {
      this.expandedEditId.set(null);
      return;
    }
    this.expandedEditId.set(wp.productId);
    this.editPivotForm.patchValue({
      supplier_sku:            wp.pivot.supplier_sku,
      product_presentation_id: wp.pivot.product_presentation_id,
      lead_time_days:          wp.pivot.lead_time_days,
      unit_price:              wp.pivot.unit_price,
      is_preferred:            wp.pivot.is_preferred,
    });
  }

  saveEditPivot(productId: number): void {
    const v = this.editPivotForm.value;
    this.workingProducts.update(prev => prev.map(p =>
      p.productId === productId ? {
        ...p,
        pivot: {
          supplier_sku:            v.supplier_sku            ?? null,
          product_presentation_id: v.product_presentation_id ?? null,
          lead_time_days:          v.lead_time_days           ?? null,
          unit_price:              v.unit_price               ?? 0,
          is_preferred:            !!v.is_preferred,
        },
        isDirty: !p.isNew,
      } : p,
    ));
    this.expandedEditId.set(null);
  }

  // ── Helpers ──────────────────────────────────────────────────

  getCategoryName(id: number): string {
    return (this.data.categories ?? []).find(c => c.id === id)?.name ?? '—';
  }

  // ── Guardar ──────────────────────────────────────────────────

  save(): void {
    if (this.saving()) return;
    if (this.stepGeneral.invalid) {
      this.errors.set(['Completa los datos generales del proveedor.']);
      return;
    }
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const gv = this.stepGeneral.value;
    const generalPayload = {
      name:         gv.name,
      tax_id:       gv.tax_id       || null,
      contact_name: gv.contact_name || null,
      phone:        gv.phone        || null,
      email:        gv.email        || null,
      address:      gv.address      || null,
      notes:        gv.notes        || null,
      is_active:    gv.is_active    ?? true,
    };

    if (!this.data.supplier) {
      // ── CREAR ─────────────────────────────────────────────────
      this.svc.createSupplier(generalPayload as any).pipe(
        switchMap(res => {
          const id  = res.data.id;
          const ops = this.workingProducts().map(wp =>
            this.svc.assignSupplierProduct(id, wp.productId, this._buildPivotPayload(wp.pivot)).pipe(
              map(() => ({ ok: true  as const, name: wp.name })),
              catchError(() => of({ ok: false as const, name: wp.name })),
            ),
          );
          return ops.length > 0
            ? forkJoin(ops).pipe(map(results => ({ res, results })))
            : of({ res, results: [] as { ok: boolean; name: string }[] });
        }),
      ).subscribe({
        next: ({ res: _res, results }) => {
          this.saving.set(false);
          if (this._warnPartialFailures(results)) this.ref.close(true);
        },
        error: err => this._handleError(err),
      });

    } else {
      // ── EDITAR ────────────────────────────────────────────────
      const supplierId = this.data.supplier.id;
      const currentIds = new Set(this.workingProducts().map(p => p.productId));
      const toRemove   = [...this.originalProductIds].filter(id => !currentIds.has(id));
      const toAdd      = this.workingProducts().filter(p => p.isNew);
      const toUpdate   = this.workingProducts().filter(p => !p.isNew && p.isDirty);

      this.svc.updateSupplier(supplierId, generalPayload as any).pipe(
        switchMap(res => {
          // Cada operación individual absorbe su propio error para no matar el forkJoin
          const removeOps = toRemove.map(id =>
            this.svc.removeSupplierProduct(supplierId, id).pipe(
              map(() => ({ ok: true  as const, name: `id:${id}` })),
              catchError(() => of({ ok: false as const, name: `id:${id}` })),
            ),
          );
          const addOps = toAdd.map(wp =>
            this.svc.assignSupplierProduct(supplierId, wp.productId, this._buildPivotPayload(wp.pivot)).pipe(
              map(() => ({ ok: true  as const, name: wp.name })),
              catchError(() => of({ ok: false as const, name: wp.name })),
            ),
          );
          const updateOps = toUpdate.map(wp =>
            this.svc.updateSupplierProductPivot(supplierId, wp.productId, this._buildPivotPayload(wp.pivot)).pipe(
              map(() => ({ ok: true  as const, name: wp.name })),
              catchError(() => of({ ok: false as const, name: wp.name })),
            ),
          );

          const ops = [...removeOps, ...addOps, ...updateOps];
          return ops.length > 0
            ? forkJoin(ops).pipe(map(results => ({ res, results })))
            : of({ res, results: [] as { ok: boolean; name: string }[] });
        }),
      ).subscribe({
        next: ({ res: _res, results }) => {
          this.saving.set(false);
          if (this._warnPartialFailures(results)) this.ref.close(true);
        },
        error: err => this._handleError(err),
      });
    }
  }

  /**
   * Construye el payload del pivot para la API.
   * Solo incluye los campos opcionales cuando tienen valor real (no null/undefined),
   * evitando que la validación de Laravel rechace null en campos "sometimes|integer".
   */
  private _buildPivotPayload(pivot: WorkingProduct['pivot']): Record<string, any> {
    const out: Record<string, any> = {
      unit_price:   pivot.unit_price   ?? 0,
      is_preferred: pivot.is_preferred ?? false,
    };
    // Solo enviar si tienen valor: la API los trata como "sometimes" opcionales
    if (pivot.supplier_sku            != null) out['supplier_sku']            = pivot.supplier_sku;
    if (pivot.product_presentation_id != null) out['product_presentation_id'] = pivot.product_presentation_id;
    if (pivot.lead_time_days          != null) out['lead_time_days']          = Number(pivot.lead_time_days);
    return out;
  }

  /**
   * Revisa los resultados de operaciones de producto.
   * Devuelve true si todo fue bien (el llamador puede cerrar el diálogo).
   * Si hubo fallos parciales, muestra el aviso y devuelve false para mantener el diálogo abierto.
   */
  private _warnPartialFailures(results: { ok: boolean; name: string }[]): boolean {
    if (results.length === 0) return true;
    const failed = results.filter(r => !r.ok);
    if (failed.length === 0) return true;

    const total = results.length;
    this.errors.set([
      `⚠ ${failed.length} de ${total} operación(es) de producto no pudo completarse: ` +
      failed.slice(0, 5).map(f => f.name).join(', ') +
      (failed.length > 5 ? ' y más…' : '') +
      '. Los datos del proveedor sí quedaron guardados. Puedes reintentarlo desde la edición.',
    ]);
    return false;
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
      this.errors.set([err.error?.message || 'Error al guardar el proveedor']);
    }
  }
}

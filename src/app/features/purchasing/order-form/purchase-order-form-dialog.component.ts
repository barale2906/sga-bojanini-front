import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormArray, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PurchasingService } from '../purchasing.service';
import { CatalogService, Product, ProductPresentation, ProductSupplier, ProductVariant, Supplier } from '../../catalog/catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { ProductSearchComponent } from '../../../shared/components/product-search/product-search.component';

@Component({
  selector: 'app-purchase-order-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatTableModule, MatProgressSpinnerModule, MatTooltipModule, FormErrorsComponent, ProductSearchComponent],
  templateUrl: './purchase-order-form-dialog.component.html',
  styleUrl: './purchase-order-form-dialog.component.scss',
})
export class PurchaseOrderFormDialogComponent implements OnInit {
  data: any = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<PurchaseOrderFormDialogComponent>);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  presentationsMap    = signal<Record<number, ProductPresentation[]>>({});
  filteredSuppliers   = signal<Supplier[]>([]);
  productSuppliersMap = signal<Record<number, ProductSupplier[]>>({});
  rowSelectedProducts = signal<(Product | null)[]>([]);
  /** Variantes activas disponibles por fila (cargadas al elegir un genérico) */
  variantsMap         = signal<Record<number, ProductVariant[]>>({});
  loadingVariantsMap  = signal<Record<number, boolean>>({});
  /** ID del genérico seleccionado por fila (para cargar presentaciones y stock) */
  rowGenericIds       = signal<(number | null)[]>([]);

  onRowProductSelected(i: number, product: Product | null): void {
    this.rowSelectedProducts.update(arr => { const a = [...arr]; a[i] = product; return a; });
    this.rowGenericIds.update(arr => { const a = [...arr]; a[i] = product?.id ?? null; return a; });
    // Limpiar variante y presentación al cambiar el genérico
    this.items.at(i).patchValue({ product_variant_id: null, product_presentation_id: null });
    this.variantsMap.update(m => ({ ...m, [i]: [] }));
    this.presentationsMap.update(m => ({ ...m, [i]: [] }));
    if (!product) return;
    // Cargar presentaciones del genérico
    this.onProductChange(i, product.id);
    // Cargar variantes activas del genérico
    this.loadingVariantsMap.update(m => ({ ...m, [i]: true }));
    (this.data.catalogSvc as CatalogService).getVariants(product.id).subscribe({
      next: r => {
        const activos = (r.data ?? []).filter((v: ProductVariant) => v.is_active);
        this.variantsMap.update(m => ({ ...m, [i]: activos }));
        this.loadingVariantsMap.update(m => ({ ...m, [i]: false }));
        if (activos.length === 1) {
          this.items.at(i).patchValue({ product_variant_id: activos[0].id });
          this.onVariantChange(i, activos[0].id);
        }
      },
      error: () => this.loadingVariantsMap.update(m => ({ ...m, [i]: false })),
    });
  }

  onVariantChange(i: number, variantId: number | null): void {
    if (!variantId) return;
    // Cargar proveedores de esta variante específica
    (this.data.catalogSvc as CatalogService).getProductSuppliers(variantId).pipe(
      catchError(() => of({ success: true, message: '', data: [] as ProductSupplier[] }))
    ).subscribe(r => {
      this.productSuppliersMap.update(m => ({ ...m, [variantId]: r.data ?? [] }));
      this.recomputeFilteredSuppliers();
      const currentSuppId = this.form.get('supplier_id')?.value as number | null;
      if (currentSuppId) this.fillPricesFromSupplier(currentSuppId);
    });
  }

  form = this.fb.group({
    supplier_id: [null as number | null, Validators.required],
    warehouse_id: [null as number | null, Validators.required],
    notes: [''],
    expected_delivery_date: [''],
    items: this.fb.array([]),
  });

  get items() { return this.form.get('items') as FormArray; }

  get isEditMode(): boolean { return !!this.data.order; }

  ngOnInit(): void {
    this.filteredSuppliers.set(this.data.suppliers ?? []);
    if (this.isEditMode) {
      this.loadExistingOrder();
    } else {
      const prefill: Array<{ product_variant_id: number; suggested_quantity: number }> = this.data.prefillItems ?? [];
      if (prefill.length > 0) {
        prefill.forEach((p, i) => this.addPrefillItem(p.product_variant_id, p.suggested_quantity, i));
        this.loadProductSuppliersForPrefill(prefill.map(p => p.product_variant_id));
      } else {
        this.addItem();
      }
    }
  }

  private loadExistingOrder(): void {
    const order = this.data.order;
    this.form.patchValue({
      supplier_id: order.supplier_id,
      warehouse_id: order.warehouse_id,
      notes: order.notes || '',
      expected_delivery_date: order.expected_delivery_date || '',
    });
    (order.items ?? []).forEach((item: any, i: number) => {
      this.items.push(this.fb.group({
        product_variant_id: [item.product_variant_id, Validators.required],
        product_presentation_id: [item.product_presentation_id, Validators.required],
        quantity: [item.quantity_requested, [Validators.required, Validators.min(0.001)]],
        unit_price: [Number(item.unit_price), [Validators.required, Validators.min(0)]],
        tax_rate: [item.tax_rate != null ? Number(item.tax_rate) : null, [Validators.min(0), Validators.max(100)]],
        notes: [item.notes || ''],
      }));
      this.variantsMap.update(m => ({ ...m, [i]: [] }));
      const product = (this.data.products as Product[] ?? []).find(p => p.id === item.variant?.generic?.id) ?? null;
      const genericId = item.variant?.generic?.id ?? null;
      this.rowSelectedProducts.update(arr => { const a = [...arr]; a[i] = product; return a; });
      this.rowGenericIds.update(arr => { const a = [...arr]; a[i] = genericId; return a; });
      if (genericId) {
        this.data.catalogSvc.getPresentations(genericId).subscribe({
          next: (r: any) => this.presentationsMap.update(m => ({ ...m, [i]: r.data ?? [] })),
          error: () => {},
        });
        (this.data.catalogSvc as CatalogService).getVariants(genericId).subscribe({
          next: r => this.variantsMap.update(m => ({ ...m, [i]: (r.data ?? []).filter((v: ProductVariant) => v.is_active) })),
          error: () => {},
        });
      }
    });
    if ((order.items ?? []).length > 0) {
      const variantIds = (order.items as any[]).map((i: any) => i.product_variant_id).filter(Boolean);
      if (variantIds.length) this.loadProductSuppliersForPrefill(variantIds);
    }
  }

  // ── Lógica de proveedores filtrados ─────────────────────────

  private loadProductSuppliersForPrefill(productIds: number[]): void {
    const uniqueIds = [...new Set(productIds)];
    forkJoin(
      uniqueIds.map(id =>
        (this.data.catalogSvc as CatalogService).getProductSuppliers(id).pipe(
          catchError(() => of({ success: true, message: '', data: [] as ProductSupplier[] }))
        )
      )
    ).subscribe(results => {
      const map: Record<number, ProductSupplier[]> = {};
      uniqueIds.forEach((id, i) => { map[id] = results[i].data ?? []; });
      this.productSuppliersMap.set(map);
      this.recomputeFilteredSuppliers();
      this.applyPrefillSupplier();
    });
  }

  private recomputeFilteredSuppliers(): void {
    const productIds = this.items.controls
      .map(c => c.get('product_variant_id')?.value as number)
      .filter(id => !!id);
    const map = this.productSuppliersMap();
    const loaded = productIds.filter(id => map[id] !== undefined);

    if (loaded.length === 0) {
      this.filteredSuppliers.set(this.data.suppliers ?? []);
      return;
    }

    const sets = loaded.map(id => new Set((map[id] ?? []).map(s => s.id)));
    const intersection = (this.data.suppliers as Supplier[]).filter(s =>
      sets.every(set => set.has(s.id))
    );
    // Si la intersección queda vacía (sin proveedor común) mostramos todos
    this.filteredSuppliers.set(intersection.length > 0 ? intersection : (this.data.suppliers ?? []));
  }

  private applyPrefillSupplier(): void {
    // Prioridad 1: proveedor explícito pasado desde sugerencias
    if (this.data.prefillSupplierId) {
      const suppId = Number(this.data.prefillSupplierId);
      this.form.patchValue({ supplier_id: suppId });
      this.fillPricesFromSupplier(suppId);
      return;
    }
    // Prioridad 2: primer proveedor marcado como preferido en algún producto
    const map = this.productSuppliersMap();
    for (const suppliers of Object.values(map)) {
      const preferred = suppliers.find(s => s.pivot.is_preferred);
      if (preferred) {
        this.form.patchValue({ supplier_id: preferred.id });
        this.fillPricesFromSupplier(preferred.id);
        return;
      }
    }
  }

  private fillPricesFromSupplier(supplierId: number): void {
    const map = this.productSuppliersMap();
    this.items.controls.forEach(ctrl => {
      const productId = ctrl.get('product_variant_id')?.value as number;
      if (!productId) return;
      const supplierData = (map[productId] ?? []).find(s => s.id === supplierId);
      if (!supplierData) return;
      if (supplierData.pivot.unit_price > 0) {
        ctrl.patchValue({ unit_price: supplierData.pivot.unit_price });
      }
      // La presentación del pivot tiene mayor prioridad que la presentación por defecto
      if (supplierData.pivot.product_presentation_id) {
        ctrl.patchValue({ product_presentation_id: supplierData.pivot.product_presentation_id });
      }
    });
  }

  onSupplierChange(supplierId: number): void {
    if (supplierId) this.fillPricesFromSupplier(supplierId);
  }

  isPreferredSupplier(supplierId: number): boolean {
    const map = this.productSuppliersMap();
    return Object.values(map).some(suppliers =>
      suppliers.some(s => s.id === supplierId && s.pivot.is_preferred)
    );
  }

  // ── Gestión de ítems ─────────────────────────────────────────

  addItem(): void {
    const i = this.items.length;
    this.items.push(this.fb.group({
      product_variant_id: [null as number | null, Validators.required],
      product_presentation_id: [null as number | null, Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.001)]],
      unit_price: [0, [Validators.required, Validators.min(0)]],
      tax_rate: [null as number | null, [Validators.min(0), Validators.max(100)]],
      notes: [''],
    }));
    this.rowSelectedProducts.update(arr => [...arr, null]);
    this.rowGenericIds.update(arr => [...arr, null]);
    this.variantsMap.update(m => ({ ...m, [i]: [] }));
  }

  private addPrefillItem(genericId: number, qty: number, index: number): void {
    this.items.push(this.fb.group({
      product_variant_id: [null as number | null, Validators.required],
      product_presentation_id: [null as number | null, Validators.required],
      quantity: [qty, [Validators.required, Validators.min(0.001)]],
      unit_price: [0, [Validators.required, Validators.min(0)]],
      tax_rate: [null as number | null, [Validators.min(0), Validators.max(100)]],
      notes: [''],
    }));
    const product = (this.data.products as Product[] ?? []).find(p => p.id === genericId) ?? null;
    this.rowSelectedProducts.update(arr => { const a = [...arr]; a[index] = product; return a; });
    this.rowGenericIds.update(arr => { const a = [...arr]; a[index] = genericId; return a; });
    this.variantsMap.update(m => ({ ...m, [index]: [] }));
    // Cargar presentaciones
    this.data.catalogSvc.getPresentations(genericId).subscribe({
      next: (r: any) => {
        const presentations: ProductPresentation[] = r.data ?? [];
        this.presentationsMap.update(m => ({ ...m, [index]: presentations }));
        if (!this.items.at(index).get('product_presentation_id')?.value) {
          const defaultPres = presentations.find((p: ProductPresentation) => p.is_purchase_default) ?? presentations[0];
          if (defaultPres) this.items.at(index).patchValue({ product_presentation_id: defaultPres.id });
        }
      },
      error: () => {},
    });
    // Cargar variantes
    (this.data.catalogSvc as CatalogService).getVariants(genericId).subscribe({
      next: r => {
        const activos = (r.data ?? []).filter((v: ProductVariant) => v.is_active);
        this.variantsMap.update(m => ({ ...m, [index]: activos }));
        if (activos.length === 1) {
          this.items.at(index).patchValue({ product_variant_id: activos[0].id });
          this.onVariantChange(index, activos[0].id);
        }
      },
      error: () => {},
    });
  }

  removeItem(i: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(i);
      this.rowSelectedProducts.update(arr => arr.filter((_, idx) => idx !== i));
      this.rowGenericIds.update(arr => arr.filter((_, idx) => idx !== i));
      // Re-indexar los mapas
      const rebuildMap = <T>(old: Record<number, T>) =>
        Object.fromEntries(Object.entries(old).filter(([k]) => Number(k) !== i).map(([k, v]) => [Number(k) > i ? Number(k) - 1 : k, v]));
      this.presentationsMap.update(rebuildMap);
      this.variantsMap.update(rebuildMap);
    }
  }

  onProductChange(i: number, genericProductId: number): void {
    if (!genericProductId) return;
    this.items.at(i).patchValue({ product_presentation_id: null, unit_price: 0 });
    // Cargar presentaciones del genérico
    this.data.catalogSvc.getPresentations(genericProductId).subscribe({
      next: (r: any) => {
        const presentations: ProductPresentation[] = r.data ?? [];
        this.presentationsMap.update(m => ({ ...m, [i]: presentations }));
        if (!this.items.at(i).get('product_presentation_id')?.value) {
          const defaultPres = presentations.find(p => p.is_purchase_default) ?? presentations[0];
          if (defaultPres) this.items.at(i).patchValue({ product_presentation_id: defaultPres.id });
        }
      },
      error: () => {},
    });
  }

  // ── Helpers de presentación ──────────────────────────────────

  getItemPresentations(i: number): ProductPresentation[] {
    return this.presentationsMap()[i] || [];
  }

  /** Presentaciones disponibles para el ítem i, excluyendo las ya usadas por otros ítems del mismo producto */
  getAvailablePresentations(i: number): ProductPresentation[] {
    const all = this.presentationsMap()[i] || [];
    const productId = this.items.at(i).get('product_variant_id')?.value as number;
    if (!productId) return all;

    const usedPresIds = new Set(
      this.items.controls
        .filter((_, j) => j !== i)
        .filter(ctrl => ctrl.get('product_variant_id')?.value === productId)
        .map(ctrl => ctrl.get('product_presentation_id')?.value)
        .filter(id => !!id)
    );

    return all.filter(p => !usedPresIds.has(p.id));
  }

  get hasDuplicates(): boolean {
    return this.items.controls.some((ctrl, i) => {
      const pid = ctrl.get('product_variant_id')?.value;
      const prid = ctrl.get('product_presentation_id')?.value;
      if (!pid || !prid) return false;
      return this.items.controls.some((c2, j) =>
        j !== i &&
        c2.get('product_variant_id')?.value === pid &&
        c2.get('product_presentation_id')?.value === prid
      );
    });
  }

  getItemBasePreview(i: number): { value: number; unit: string } | null {
    const presentations = this.presentationsMap()[i] || [];
    const item = this.items.at(i);
    const presId = item.get('product_presentation_id')?.value;
    const qty = item.get('quantity')?.value;
    if (!presId || !qty || qty < 1) return null;
    const pres = presentations.find(p => p.id === presId);
    if (!pres) return null;
    const productId = item.get('product_variant_id')?.value;
    const product = (this.data.products as any[]).find((p: any) => p.id === productId);
    const unit = product?.base_unit?.abbreviation || 'uds. base';
    return { value: qty * pres.factor_to_base, unit };
  }

  getItemPresName(i: number): string {
    const presentations = this.presentationsMap()[i] || [];
    const presId = this.items.at(i).get('product_presentation_id')?.value;
    return presentations.find(p => p.id === presId)?.name || '';
  }

  // ── Totales y guardado ───────────────────────────────────────

  get totals(): { subtotal: number; taxBreakdown: { rate: number; amount: number }[]; total: number } {
    let subtotal = 0;
    const taxMap = new Map<number, number>();

    for (const c of this.items.controls) {
      const qty = Number(c.get('quantity')?.value) || 0;
      const price = Number(c.get('unit_price')?.value) || 0;
      const rate = Number(c.get('tax_rate')?.value) || 0;
      const lineBase = qty * price;
      subtotal += lineBase;
      if (rate > 0) taxMap.set(rate, (taxMap.get(rate) ?? 0) + lineBase * rate / 100);
    }

    const taxBreakdown = Array.from(taxMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([rate, amount]) => ({ rate, amount }));

    return { subtotal, taxBreakdown, total: subtotal + taxBreakdown.reduce((s, t) => s + t.amount, 0) };
  }

  formatCurrency(v: number | string): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(v));
  }

  save(): void {
    if (this.form.invalid || this.saving() || this.hasDuplicates) return;
    this.saving.set(true);
    const v = this.form.value;
    const payload = {
      supplier_id: v.supplier_id, warehouse_id: v.warehouse_id,
      notes: v.notes || undefined, expected_delivery_date: v.expected_delivery_date || undefined,
      items: v.items,
    };
    const req$ = this.isEditMode
      ? this.data.purchasingSvc.updateOrder(this.data.order.id, payload)
      : this.data.purchasingSvc.createOrder(payload);
    req$.subscribe({
      next: () => this.ref.close(true),
      error: (err: any) => {
        this.saving.set(false);
        if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        else if (err.status === 409) this.errors.set([err.error?.message || 'Error de negocio']);
      },
    });
  }
}

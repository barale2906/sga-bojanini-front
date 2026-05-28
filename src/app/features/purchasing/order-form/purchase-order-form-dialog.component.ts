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
import { CatalogService, ProductPresentation, ProductSupplier, Supplier } from '../../catalog/catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-purchase-order-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatTableModule, MatProgressSpinnerModule, MatTooltipModule, FormErrorsComponent],
  templateUrl: './purchase-order-form-dialog.component.html',
  styleUrl: './purchase-order-form-dialog.component.scss',
})
export class PurchaseOrderFormDialogComponent implements OnInit {
  data: any = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<PurchaseOrderFormDialogComponent>);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  presentationsMap = signal<Record<number, ProductPresentation[]>>({});
  filteredSuppliers = signal<Supplier[]>([]);
  productSuppliersMap = signal<Record<number, ProductSupplier[]>>({});

  form = this.fb.group({
    supplier_id: [null as number | null, Validators.required],
    warehouse_id: [null as number | null, Validators.required],
    notes: [''],
    expected_delivery_date: [''],
    items: this.fb.array([]),
  });

  get items() { return this.form.get('items') as FormArray; }

  ngOnInit(): void {
    this.filteredSuppliers.set(this.data.suppliers ?? []);
    const prefill: Array<{ product_id: number; suggested_quantity: number }> = this.data.prefillItems ?? [];
    if (prefill.length > 0) {
      prefill.forEach((p, i) => this.addPrefillItem(p.product_id, p.suggested_quantity, i));
      this.loadProductSuppliersForPrefill(prefill.map(p => p.product_id));
    } else {
      this.addItem();
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
      .map(c => c.get('product_id')?.value as number)
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
      const productId = ctrl.get('product_id')?.value as number;
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
    this.items.push(this.fb.group({
      product_id: [null as number | null, Validators.required],
      product_presentation_id: [null as number | null, Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit_price: [0, [Validators.required, Validators.min(0)]],
      tax_rate: [null as number | null, [Validators.min(0), Validators.max(100)]],
      notes: [''],
    }));
  }

  private addPrefillItem(productId: number, qty: number, index: number): void {
    this.items.push(this.fb.group({
      product_id: [productId, Validators.required],
      product_presentation_id: [null as number | null, Validators.required],
      quantity: [qty, [Validators.required, Validators.min(1)]],
      unit_price: [0, [Validators.required, Validators.min(0)]],
      tax_rate: [null as number | null, [Validators.min(0), Validators.max(100)]],
      notes: [''],
    }));
    this.data.catalogSvc.getPresentations(productId).subscribe({
      next: (r: any) => {
        const presentations: ProductPresentation[] = r.data ?? [];
        this.presentationsMap.update(m => ({ ...m, [index]: presentations }));
        // Solo aplicar presentación por defecto si no fue asignada ya desde el pivot del proveedor
        if (!this.items.at(index).get('product_presentation_id')?.value) {
          const defaultPres = presentations.find((p: ProductPresentation) => p.is_purchase_default) ?? presentations[0];
          if (defaultPres) {
            this.items.at(index).patchValue({ product_presentation_id: defaultPres.id });
          }
        }
      },
      error: () => {},
    });
  }

  removeItem(i: number): void { if (this.items.length > 1) this.items.removeAt(i); }

  onProductChange(i: number, productId: number): void {
    if (!productId) return;
    this.items.at(i).patchValue({ product_presentation_id: null, unit_price: 0 });

    // Cargar presentaciones
    this.data.catalogSvc.getPresentations(productId).subscribe({
      next: (r: any) => this.presentationsMap.update(m => ({ ...m, [i]: r.data ?? [] })),
      error: () => {},
    });

    // Cargar proveedores del producto y recomputar filtro
    (this.data.catalogSvc as CatalogService).getProductSuppliers(productId).pipe(
      catchError(() => of({ success: true, message: '', data: [] as ProductSupplier[] }))
    ).subscribe(r => {
      this.productSuppliersMap.update(m => ({ ...m, [productId]: r.data ?? [] }));
      this.recomputeFilteredSuppliers();
      // Si ya hay un proveedor seleccionado, rellenar precio para este nuevo ítem
      const currentSuppId = this.form.get('supplier_id')?.value as number | null;
      if (currentSuppId) this.fillPricesFromSupplier(currentSuppId);
    });
  }

  // ── Helpers de presentación ──────────────────────────────────

  getItemPresentations(i: number): ProductPresentation[] {
    return this.presentationsMap()[i] || [];
  }

  /** Presentaciones disponibles para el ítem i, excluyendo las ya usadas por otros ítems del mismo producto */
  getAvailablePresentations(i: number): ProductPresentation[] {
    const all = this.presentationsMap()[i] || [];
    const productId = this.items.at(i).get('product_id')?.value as number;
    if (!productId) return all;

    const usedPresIds = new Set(
      this.items.controls
        .filter((_, j) => j !== i)
        .filter(ctrl => ctrl.get('product_id')?.value === productId)
        .map(ctrl => ctrl.get('product_presentation_id')?.value)
        .filter(id => !!id)
    );

    return all.filter(p => !usedPresIds.has(p.id));
  }

  get hasDuplicates(): boolean {
    return this.items.controls.some((ctrl, i) => {
      const pid = ctrl.get('product_id')?.value;
      const prid = ctrl.get('product_presentation_id')?.value;
      if (!pid || !prid) return false;
      return this.items.controls.some((c2, j) =>
        j !== i &&
        c2.get('product_id')?.value === pid &&
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
    const productId = item.get('product_id')?.value;
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
    this.data.purchasingSvc.createOrder(payload).subscribe({
      next: () => this.ref.close(true),
      error: (err: any) => {
        this.saving.set(false);
        if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        else if (err.status === 409) this.errors.set([err.error?.message || 'Error de negocio']);
      },
    });
  }
}

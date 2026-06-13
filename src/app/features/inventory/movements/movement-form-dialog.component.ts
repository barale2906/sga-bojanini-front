import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { forkJoin, finalize, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { InventoryService, StockSummary, BatchDetail, BatchLocation, CostCenter, MedicalService } from '../inventory.service';
import { MovementPdfService } from '../../../shared/services/movement-pdf.service';
import { WarehouseService, Warehouse, Location, LocationCapacity, Zone } from '../../warehouse/warehouse.service';
import { CatalogService, Product, ProductPresentation, ProductClassification } from '../../catalog/catalog.service';
import { PurchasingService, PurchaseOrder, PurchaseOrderItem } from '../../purchasing/purchasing.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

const TYPE_LABELS: Record<string, string> = {
  entry: 'Entrada de Mercancía', exit: 'Salida de Stock', transfer: 'Transferencia',
  adjustment: 'Ajuste de Inventario', return: 'Devolución a Proveedor',
  loss: 'Baja de Inventario',
};

/** Motivos predefinidos para una baja de inventario (daño, muestra, pérdida/robo, vencimiento, otro). */
export const LOSS_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'damage',      label: 'Producto dañado' },
  { value: 'expiration',   label: 'Producto vencido' },
  { value: 'sample',       label: 'Muestra / Donación' },
  { value: 'theft',        label: 'Pérdida / Robo' },
  { value: 'other',        label: 'Otro' },
];

export interface MovementDialogData {
  type: string;
  warehouses: Warehouse[];
  products: Product[];
  inventorySvc: InventoryService;
  purchaseOrder?: PurchaseOrder;
  purchaseOrderItem?: PurchaseOrderItem;
  itemIndex?: number;
  itemTotal?: number;
}

@Component({
  selector: 'app-movement-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule, MatDividerModule, FormErrorsComponent,
  ],
  templateUrl: './movement-form-dialog.component.html',
  styleUrl: './movement-form-dialog.component.scss',
})
export class MovementFormDialogComponent implements OnInit {
  data: MovementDialogData = inject(MAT_DIALOG_DATA);
  private ref          = inject(MatDialogRef<MovementFormDialogComponent>);
  private fb           = inject(FormBuilder);
  private wSvc         = inject(WarehouseService);
  private cSvc         = inject(CatalogService);
  private purchasingSvc = inject(PurchasingService);
  private pdfSvc       = inject(MovementPdfService);

  saving = signal(false);
  errors = signal<string[]>([]);
  locations = signal<Location[]>([]);
  zones     = signal<Zone[]>([]);
  presentations = signal<ProductPresentation[]>([]);
  usePresentationMode = signal(false);

  // ── Detalle de producto (clasificación + INVIMA) ─────────────
  productDetail        = signal<Product | null>(null);
  loadingProductDetail = signal(false);

  // ── Selector de OC (cuando no viene del flujo directo de OC) ─
  showPoLink           = signal(false);
  pendingOrders        = signal<PurchaseOrder[]>([]);
  loadingPendingOrders = signal(false);
  _selectedPoId        = signal<number | null>(null);
  _selectedPoItemId    = signal<number | null>(null);
  _selectedPoItems     = signal<PurchaseOrderItem[]>([]);

  // ── Capacidad — ubicación única ──────────────────────────────
  singleLocCapacity = signal<LocationCapacity | null>(null);
  loadingSingleCap  = signal(false);
  destLocCapacity   = signal<LocationCapacity | null>(null);
  loadingDestCap    = signal(false);

  // ── Modo multi-ubicación ─────────────────────────────────────
  useDistribution = signal(false);

  distributionForm = this.fb.group({
    entryRows:    this.fb.array([]),
    transferRows: this.fb.array([]),
  });
  get entryRows(): FormArray    { return this.distributionForm.get('entryRows')    as FormArray; }
  get transferRows(): FormArray { return this.distributionForm.get('transferRows') as FormArray; }

  entryRowCaps    = signal<(LocationCapacity | null)[]>([]);
  transferRowCaps = signal<(LocationCapacity | null)[]>([]);

  // ── Centros de costo y servicios médicos ─────────────────────
  costCenters            = signal<CostCenter[]>([]);
  loadingCostCenters     = signal(false);
  medicalServices        = signal<MedicalService[]>([]);
  loadingMedicalServices = signal(false);

  // ── FEFO / Stock ─────────────────────────────────────────────
  stockSummary     = signal<StockSummary | null>(null);
  loadingStock     = signal(false);
  fefoLotes        = signal<BatchDetail[]>([]);
  loadingFefo      = signal(false);
  exitConfirmation = signal<BatchDetail | null>(null);

  // ── Selección explícita de lote — Baja de inventario ─────────
  lossBatches        = signal<BatchDetail[]>([]);
  loadingLossBatches = signal(false);

  // ── Getters — OC vinculada ────────────────────────────────────

  /** OC activa: la del contexto o la seleccionada manualmente */
  get _linkedPo(): PurchaseOrder | null {
    return this.data.purchaseOrder
      ?? this.pendingOrders().find(o => o.id === this._selectedPoId()) ?? null;
  }

  /** Ítem activo: el del contexto o el seleccionado manualmente */
  get _linkedPoItem(): PurchaseOrderItem | null {
    return this.data.purchaseOrderItem
      ?? this._selectedPoItems().find(i => i.id === this._selectedPoItemId()) ?? null;
  }

  // ── Getters generales ─────────────────────────────────────────

  get selectedCostCenter(): CostCenter | null {
    const id = this.form.get('cost_center_id')?.value;
    return this.costCenters().find(c => c.id === id) ?? null;
  }

  get isExternalCenter(): boolean {
    return this.selectedCostCenter?.is_external === true;
  }

  get selectedProduct(): Product | null {
    const id = this.form.get('product_id')?.value;
    return this.data.products.find((p: Product) => p.id === id) ?? null;
  }

  get selectedPresentation(): ProductPresentation | null {
    const id = this.form.get('product_presentation_id')?.value;
    return this.presentations().find(pr => pr.id === id) ?? null;
  }

  get previewBaseUnits(): number | null {
    if (!this.usePresentationMode()) return null;
    const pres = this.selectedPresentation;
    const qty  = this.form.get('quantity_in_presentation')?.value;
    if (!pres || !qty || qty < 1) return null;
    return qty * pres.factor_to_base;
  }

  get effectiveBaseQty(): number {
    if (this.usePresentationMode() && this.previewBaseUnits !== null) return this.previewBaseUnits;
    return Number(this.form.value.quantity_base) || 0;
  }

  get entryDistTotal(): number {
    return (this.entryRows.value as any[]).reduce((s: number, r: any) => s + (Number(r.quantity_base) || 0), 0);
  }

  get transferDistTotal(): number {
    return (this.transferRows.value as any[]).reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
  }

  get selectedWarehouseName(): string {
    const id = this.form.get('warehouse_id')?.value;
    return this.data.warehouses.find(w => w.id === id)?.name ?? '';
  }

  /** Stock total gestionable (vigente + vencido). Las devoluciones, ajustes negativos y bajas pueden operar sobre lotes vencidos. */
  get operableQuantity(): number {
    const s = this.stockSummary();
    if (!s) return 0;
    return s.available_quantity + s.expired_quantity;
  }

  get hasZeroStock(): boolean {
    const s = this.stockSummary();
    if (!s) return false;
    if (this.isExit) return s.available_quantity === 0;
    if (this.isReturn || this.isLoss) return this.operableQuantity === 0;
    if (this.isAdjustment) {
      const qty = Number(this.form.get('quantity')?.value) || 0;
      return qty < 0 && this.operableQuantity === 0;
    }
    return false;
  }

  get adjNegativeExceedsStock(): boolean {
    if (!this.isAdjustment) return false;
    const qty = Number(this.form.get('quantity')?.value) || 0;
    if (qty >= 0) return false;
    const s = this.stockSummary();
    return s !== null && Math.abs(qty) > this.operableQuantity;
  }

  /** Lote seleccionado para la baja (selección explícita, no FEFO). */
  get selectedLossBatch(): BatchDetail | null {
    const id = this.form.get('batch_id')?.value;
    if (!id) return null;
    return this.lossBatches().find(b => b.id === id) ?? null;
  }

  /** Ubicaciones del lote seleccionado dentro del almacén elegido, con su cantidad disponible en cada una. */
  get lossBatchLocations(): BatchLocation[] {
    const batch = this.selectedLossBatch;
    const warehouseId = this.form.get('warehouse_id')?.value;
    if (!batch || !warehouseId) return [];
    return batch.locations.filter(l => l.zone?.warehouse_id === Number(warehouseId));
  }

  /** Cantidad disponible del lote seleccionado en la ubicación seleccionada (límite real para la baja). */
  get selectedLossLocationQty(): number {
    const locationId = this.form.get('location_id')?.value;
    if (!locationId) return 0;
    return this.lossBatchLocations.find(l => l.location_id === locationId)?.quantity ?? 0;
  }

  /** Cantidad solicitada para la baja supera la disponible en el lote/ubicación seleccionados. */
  get lossExceedsStock(): boolean {
    if (!this.isLoss) return false;
    const qty = Number(this.form.get('quantity')?.value) || 0;
    return qty > 0 && qty > this.selectedLossLocationQty;
  }

  get stockStatusClass(): 'ok' | 'warn' | 'danger' | 'loading' | 'none' {
    if (this.loadingStock()) return 'loading';
    const s = this.stockSummary();
    if (!s) return 'none';
    if (this.isAdjustment) {
      const qty = Number(this.form.get('quantity')?.value) || 0;
      if (qty >= 0) return s.available_quantity === 0 ? 'warn' : 'ok';
      const needed = Math.abs(qty);
      const operable = this.operableQuantity;
      if (needed > operable) return 'danger';
      if (needed > operable * 0.8) return 'warn';
      return 'ok';
    }
    if (this.isReturn || this.isLoss) {
      const operable = this.operableQuantity;
      if (operable === 0) return 'danger';
      const requested = Number(this.form.get('quantity')?.value) || 0;
      if (requested > 0 && requested > operable) return 'danger';
      if (requested > 0 && requested > operable * 0.8) return 'warn';
      return 'ok';
    }
    if (s.available_quantity === 0) return 'danger';
    const requested = Number(this.form.get('quantity')?.value) || 0;
    if (requested > 0 && requested > s.available_quantity) return 'danger';
    if (requested > 0 && requested > s.available_quantity * 0.8) return 'warn';
    return 'ok';
  }

  get hasActiveReg(): boolean {
    const regs = this.productDetail()?.sanitary_registrations;
    return !!(regs?.some(r => r.is_active && !r.is_expired));
  }

  get poPendingQty(): number {
    const item = this._linkedPoItem;
    if (!item) return 0;
    return item.quantity_requested - (item.quantity_received ?? 0);
  }

  get isFormReady(): boolean {
    const v = this.form.value;
    if (!v.product_id || !v.warehouse_id) return false;

    if (this.isEntry) {
      if (this.useDistribution()) return !this.entryRows.invalid && this.entryRows.length > 0;
      if (this.usePresentationMode()) {
        return !!v.product_presentation_id && !!(v.quantity_in_presentation) && (v.quantity_in_presentation ?? 0) >= 1;
      }
      return !!(v.quantity_base) && (v.quantity_base ?? 0) >= 1;
    }

    if (this.isTransfer) {
      if (!v.location_from_id) return false;
      if (this.useDistribution()) return !this.transferRows.invalid && this.transferRows.length > 0;
      return !!v.location_to_id && !!(v.quantity) && (v.quantity ?? 0) >= 1;
    }

    if (this.isAdjustment) {
      if (!v.location_id || !v.quantity || !v.reason?.trim()) return false;
      if (Number(v.quantity) === 0) return false;
      return !this.adjNegativeExceedsStock;
    }

    if (this.isReturn) {
      if (!v.quantity || (v.quantity ?? 0) < 1) return false;
      const s = this.stockSummary();
      if (s !== null && this.operableQuantity === 0) return false;
      if (s !== null && (v.quantity ?? 0) > this.operableQuantity) return false;
      return true;
    }

    if (this.isLoss) {
      if (!v.batch_id || !v.location_id || !v.quantity || (v.quantity ?? 0) < 1) return false;
      if (!v.loss_reason_category) return false;
      if (v.loss_reason_category === 'other' && !v.reason?.trim()) return false;
      const s = this.stockSummary();
      if (s !== null && this.operableQuantity === 0) return false;
      return !this.lossExceedsStock;
    }

    if (!v.quantity || (v.quantity ?? 0) < 1) return false;
    if (this.isExit) {
      const s = this.stockSummary();
      if (s !== null && s.available_quantity === 0) return false;
      if (!v.cost_center_id) return false;
      if (this.isExternalCenter) {
        if (!v.service_id || !v.patient_document?.trim() || !v.patient_external_id?.trim()) return false;
      }
    }
    return true;
  }

  get typeLabel()    { return TYPE_LABELS[this.data.type] || this.data.type; }
  get isEntry()      { return this.data.type === 'entry'; }
  get isExit()       { return this.data.type === 'exit'; }
  get isTransfer()   { return this.data.type === 'transfer'; }
  get isAdjustment() { return this.data.type === 'adjustment'; }
  get isReturn()     { return this.data.type === 'return'; }
  get isLoss()       { return this.data.type === 'loss'; }

  /** Motivos de baja disponibles para el selector del formulario. */
  readonly lossReasonOptions = LOSS_REASON_OPTIONS;

  form = this.fb.group({
    product_id:               [null as number | null, Validators.required],
    warehouse_id:             [null as number | null, Validators.required],
    zone_id:                  [null as number | null],
    location_id:              [null as number | null],
    location_from_id:         [null as number | null],
    location_to_id:           [null as number | null],
    batch_id:                 [null as number | null],
    quantity:                 [null as number | null],
    quantity_base:            [null as number | null],
    product_presentation_id:  [null as number | null],
    quantity_in_presentation: [null as number | null],
    lot_number:               [''],
    expiration_date:          [''],
    manufacturing_date:       [''],
    reason:                   [''],
    loss_reason_category:     [null as string | null],
    notes:                    [''],
    cost_center_id:           [null as number | null],
    service_id:               [null as number | null],
    patient_document:         [null as string | null],
    patient_external_id:      [null as string | null],
  });

  ngOnInit(): void {
    // Almacén → zonas + ubicaciones + FEFO
    this.form.get('warehouse_id')!.valueChanges.subscribe(wId => {
      this.singleLocCapacity.set(null);
      this.destLocCapacity.set(null);
      this._resetDistRows();
      this.form.patchValue({ zone_id: null, location_id: null, batch_id: null }, { emitEvent: false });
      this.lossBatches.set([]);
      if (wId) {
        this.wSvc.getWarehouseLocations(Number(wId)).subscribe({ next: r => this.locations.set(r.data), error: () => {} });
        this.wSvc.getWarehouseZones(Number(wId)).subscribe({ next: r => this.zones.set(r.data), error: () => {} });
        this._loadStockData();
      } else {
        this.locations.set([]);
        this.zones.set([]);
        this.stockSummary.set(null);
        this.fefoLotes.set([]);
      }
    });

    // Zona → filtrar ubicaciones
    this.form.get('zone_id')!.valueChanges.subscribe(zId => {
      this.singleLocCapacity.set(null);
      this.form.patchValue({ location_id: null }, { emitEvent: false });
      const wId = this.form.get('warehouse_id')?.value;
      if (!wId) return;
      if (zId) {
        this.wSvc.getLocations({ zone_id: Number(zId) }).subscribe({ next: r => this.locations.set(r.data), error: () => {} });
      } else {
        this.wSvc.getWarehouseLocations(Number(wId)).subscribe({ next: r => this.locations.set(r.data), error: () => {} });
      }
    });

    // Producto → presentaciones + detalle completo + FEFO
    this.form.get('product_id')!.valueChanges.subscribe(pId => {
      this.singleLocCapacity.set(null);
      this.destLocCapacity.set(null);
      this.productDetail.set(null);
      if (this.isLoss) {
        this.form.patchValue({ batch_id: null, location_id: null }, { emitEvent: false });
        this.lossBatches.set([]);
      }
      if (pId) {
        this.cSvc.getPresentations(Number(pId)).subscribe({
          next: r => {
            this.presentations.set(r.data);
            const poPresId = this._linkedPoItem?.product_presentation_id;
            if (poPresId && r.data.some(pr => pr.id === poPresId)) {
              this.usePresentationMode.set(true);
              this.form.patchValue({ product_presentation_id: poPresId }, { emitEvent: false });
            }
          },
          error: () => {},
        });
        if (this.isEntry) {
          this.loadingProductDetail.set(true);
          this.cSvc.getProduct(Number(pId)).subscribe({
            next: r => { this.productDetail.set(r.data); this.loadingProductDetail.set(false); },
            error: () => { this.productDetail.set(null); this.loadingProductDetail.set(false); },
          });
        }
        this._loadStockData();
      } else {
        this.presentations.set([]);
        this.stockSummary.set(null);
        this.fefoLotes.set([]);
      }
    });

    // Ubicación de entrada → capacidad
    this.form.get('location_id')!.valueChanges.subscribe(locId => {
      this.singleLocCapacity.set(null);
      this.errors.set([]);
      if (locId) this._loadLocCap(Number(locId), 'single');
    });

    // Lote seleccionado (baja) → ubicación dentro del almacén
    this.form.get('batch_id')!.valueChanges.subscribe(() => {
      if (!this.isLoss) return;
      const locs = this.lossBatchLocations;
      this.form.patchValue(
        { location_id: locs.length === 1 ? locs[0].location_id : null },
        { emitEvent: false },
      );
    });

    // Ubicación destino (transferencia) → capacidad
    this.form.get('location_to_id')!.valueChanges.subscribe(locId => {
      this.destLocCapacity.set(null);
      this.errors.set([]);
      if (locId) this._loadLocCap(Number(locId), 'dest');
    });

    this._addEntryRow();
    this._addTransferRow();

    // Centros de costo — solo para salidas
    if (this.isExit) {
      this.loadingCostCenters.set(true);
      this.data.inventorySvc.getCostCenters({ is_active: true })
        .pipe(finalize(() => this.loadingCostCenters.set(false)))
        .subscribe({ next: r => this.costCenters.set(r.data), error: () => {} });
    }

    // Centro de costo → servicios médicos si es externo
    this.form.get('cost_center_id')!.valueChanges.subscribe(ccId => {
      this.medicalServices.set([]);
      this.form.patchValue(
        { service_id: null, patient_document: null, patient_external_id: null },
        { emitEvent: false },
      );
      if (!ccId) return;
      const center = this.costCenters().find(c => c.id === Number(ccId));
      if (center?.is_external) {
        this.loadingMedicalServices.set(true);
        this.data.inventorySvc.getMedicalServices({ is_active: true })
          .pipe(finalize(() => this.loadingMedicalServices.set(false)))
          .subscribe({ next: r => this.medicalServices.set(r.data), error: () => {} });
      }
    });

    // Pre-rellenar desde contexto de OC
    if (this.data.purchaseOrder && this.data.purchaseOrderItem) {
      const order = this.data.purchaseOrder;
      const item  = this.data.purchaseOrderItem;
      const pendingQty = item.quantity_requested - (item.quantity_received ?? 0);
      const qty = pendingQty > 0 ? pendingQty : item.quantity_requested;

      this.form.patchValue({ warehouse_id: order.warehouse_id });
      this.form.patchValue({ product_id: item.product_id });

      if (item.product_presentation_id) {
        this.form.patchValue({ quantity_in_presentation: qty });
      } else {
        this.form.patchValue({ quantity_base: qty });
      }
    }
  }

  // ── Selector de OC (entrada manual) ──────────────────────────

  togglePoLink(): void {
    const next = !this.showPoLink();
    this.showPoLink.set(next);
    if (next && !this.pendingOrders().length && !this.loadingPendingOrders()) {
      this._loadPendingOrders();
    }
    if (!next) {
      this._clearPoSelection();
    }
  }

  private _clearPoSelection(): void {
    this._selectedPoId.set(null);
    this._selectedPoItemId.set(null);
    this._selectedPoItems.set([]);
  }

  private _loadPendingOrders(): void {
    this.loadingPendingOrders.set(true);
    forkJoin([
      this.purchasingSvc.getOrders({ status: 'sent', per_page: 100 }),
      this.purchasingSvc.getOrders({ status: 'partially_received', per_page: 100 }),
    ]).subscribe({
      next: ([r1, r2]) => {
        this.pendingOrders.set([...r1.data, ...r2.data]);
        this.loadingPendingOrders.set(false);
      },
      error: () => this.loadingPendingOrders.set(false),
    });
  }

  onPoSelected(poId: number | null): void {
    this._selectedPoId.set(poId);
    this._selectedPoItemId.set(null);
    this._selectedPoItems.set([]);

    if (!poId) return;

    const cached = this.pendingOrders().find(o => o.id === poId);
    if (cached?.items?.length) {
      this._selectedPoItems.set(cached.items);
    } else {
      this.purchasingSvc.getOrder(poId).subscribe({
        next: r => {
          this._selectedPoItems.set(r.data.items ?? []);
          // Actualizar el caché en la lista
          this.pendingOrders.update(list =>
            list.map(o => o.id === poId ? { ...o, items: r.data.items } : o)
          );
        },
        error: () => {},
      });
    }

    // Pre-rellenar almacén de la OC
    const order = this.pendingOrders().find(o => o.id === poId);
    if (order?.warehouse_id) {
      this.form.patchValue({ warehouse_id: order.warehouse_id });
    }
  }

  onPoItemSelected(itemId: number | null): void {
    this._selectedPoItemId.set(itemId);
    if (!itemId) return;

    const item = this._selectedPoItems().find(i => i.id === itemId);
    if (!item) return;

    const pendingQty = item.quantity_requested - (item.quantity_received ?? 0);
    const qty = pendingQty > 0 ? pendingQty : item.quantity_requested;

    this.form.patchValue({ product_id: item.product_id });

    if (item.product_presentation_id) {
      this.form.patchValue({ quantity_in_presentation: qty });
    } else {
      this.form.patchValue({ quantity_base: qty });
    }
  }

  // ── FEFO ─────────────────────────────────────────────────────

  private _loadStockData(): void {
    if (!this.isExit && !this.isAdjustment && !this.isReturn && !this.isLoss) return;
    const pId = this.form.get('product_id')?.value;
    const wId = this.form.get('warehouse_id')?.value;
    if (!pId || !wId) return;

    this.stockSummary.set(null);
    this.fefoLotes.set([]);
    this.loadingStock.set(true);

    this.data.inventorySvc.getStockSummary(Number(wId), Number(pId))
      .pipe(finalize(() => this.loadingStock.set(false)))
      .subscribe({ next: r => this.stockSummary.set(r.data), error: () => this.stockSummary.set(null) });

    if (this.isExit) {
      this.loadingFefo.set(true);
      this.data.inventorySvc.getProductBatches(Number(pId), true)
        .pipe(finalize(() => this.loadingFefo.set(false)))
        .subscribe({
          next: r => this.fefoLotes.set(r.data.filter(b => b.status === 'active' && b.quantity_available > 0)),
          error: () => this.fefoLotes.set([]),
        });
    } else if (this.isLoss) {
      // La baja requiere selección explícita de lote: se listan los lotes
      // (vigentes y vencidos) que tienen stock en el almacén seleccionado.
      this.form.patchValue({ batch_id: null, location_id: null }, { emitEvent: false });
      this.lossBatches.set([]);
      this.loadingLossBatches.set(true);
      this.data.inventorySvc.getProductBatches(Number(pId), false, Number(wId))
        .pipe(finalize(() => this.loadingLossBatches.set(false)))
        .subscribe({
          next: r => this.lossBatches.set(r.data.filter(b => b.quantity_available > 0)),
          error: () => this.lossBatches.set([]),
        });
    }
  }

  get fefoFirstLocation(): string {
    const first = this.fefoLotes()[0];
    if (!first || !first.locations?.length) return '';
    const loc = first.locations[0];
    const parts: string[] = [loc.location_name];
    if (loc.zone?.zone_name) parts.push(loc.zone.zone_name);
    return parts.join(' · ');
  }

  // ── Distribución — filas de entrada ──────────────────────────

  addEntryRow(): void { this._addEntryRow(); }

  private _addEntryRow(): void {
    this.entryRows.push(this.fb.group({
      location_id:   [null as number | null, Validators.required],
      quantity_base: [null as number | null, [Validators.required, Validators.min(1)]],
    }));
    this.entryRowCaps.update(arr => { while (arr.length < this.entryRows.length) arr = [...arr, null]; return arr; });
  }

  removeEntryRow(i: number): void {
    if (this.entryRows.length <= 1) return;
    this.entryRows.removeAt(i);
    this.entryRowCaps.update(arr => arr.filter((_, idx) => idx !== i));
  }

  onEntryRowLocChange(i: number, locId: number | null): void {
    this.entryRowCaps.update(arr => { const a = [...arr]; a[i] = null; return a; });
    if (locId) {
      this.wSvc.getLocationCapacity(locId).subscribe({
        next: r => this.entryRowCaps.update(arr => { const a = [...arr]; if (i < a.length) a[i] = r.data; return a; }),
        error: () => {},
      });
    }
  }

  // ── Distribución — filas de transferencia ────────────────────

  addTransferRow(): void { this._addTransferRow(); }

  private _addTransferRow(): void {
    this.transferRows.push(this.fb.group({
      location_to_id: [null as number | null, Validators.required],
      quantity:       [null as number | null, [Validators.required, Validators.min(1)]],
    }));
    this.transferRowCaps.update(arr => { while (arr.length < this.transferRows.length) arr = [...arr, null]; return arr; });
  }

  removeTransferRow(i: number): void {
    if (this.transferRows.length <= 1) return;
    this.transferRows.removeAt(i);
    this.transferRowCaps.update(arr => arr.filter((_, idx) => idx !== i));
  }

  onTransferRowLocChange(i: number, locId: number | null): void {
    this.transferRowCaps.update(arr => { const a = [...arr]; a[i] = null; return a; });
    if (locId) {
      this.wSvc.getLocationCapacity(locId).subscribe({
        next: r => this.transferRowCaps.update(arr => { const a = [...arr]; if (i < a.length) a[i] = r.data; return a; }),
        error: () => {},
      });
    }
  }

  // ── Toggle distribución ──────────────────────────────────────

  toggleDistribution(): void {
    const next = !this.useDistribution();
    this.useDistribution.set(next);
    this.errors.set([]);
    if (next) {
      this.form.get('location_id')!.setValue(null);
      this.form.get('location_to_id')!.setValue(null);
      this.singleLocCapacity.set(null);
      this.destLocCapacity.set(null);
    }
  }

  private _resetDistRows(): void {
    while (this.entryRows.length > 0) this.entryRows.removeAt(0);
    while (this.transferRows.length > 0) this.transferRows.removeAt(0);
    this.entryRowCaps.set([]);
    this.transferRowCaps.set([]);
    this._addEntryRow();
    this._addTransferRow();
  }

  // ── Capacidad ────────────────────────────────────────────────

  private _loadLocCap(locId: number, target: 'single' | 'dest'): void {
    if (target === 'single') this.loadingSingleCap.set(true);
    else this.loadingDestCap.set(true);

    this.wSvc.getLocationCapacity(locId).subscribe({
      next: r => {
        if (target === 'single') { this.singleLocCapacity.set(r.data); this.loadingSingleCap.set(false); }
        else { this.destLocCapacity.set(r.data); this.loadingDestCap.set(false); }
      },
      error: () => {
        if (target === 'single') this.loadingSingleCap.set(false);
        else this.loadingDestCap.set(false);
      },
    });
  }

  private _capErrors(cap: LocationCapacity | null, qty: number): string[] {
    const errs: string[] = [];
    if (!cap || qty <= 0) return errs;
    const prod = this.selectedProduct;
    if (!prod) return errs;
    if (cap.capacity_volume.max_cm3 !== null && prod.volume_cm3 != null) {
      const need = qty * prod.volume_cm3, avail = cap.capacity_volume.available_cm3 ?? 0;
      if (need > avail) errs.push(`Volumen insuficiente en "${cap.name}": necesita ${this._fmtVol(need)}, disponible ${this._fmtVol(avail)}.`);
    }
    if (cap.capacity_weight.max_kg !== null && prod.weight_kg != null) {
      const need = qty * prod.weight_kg, avail = cap.capacity_weight.available_kg ?? 0;
      if (need > avail) errs.push(`Peso insuficiente en "${cap.name}": necesita ${this._fmtKg(need)}, disponible ${this._fmtKg(avail)}.`);
    }
    return errs;
  }

  projStatus(cap: LocationCapacity | null, qty: number): 'ok' | 'warn' | 'danger' | 'nodata' | 'nodims' {
    if (!cap) return 'nodata';
    const prod = this.selectedProduct;
    if (!prod) return 'nodata';
    const hasVolLim = cap.capacity_volume.max_cm3 !== null;
    const hasWgtLim = cap.capacity_weight.max_kg  !== null;
    if (!hasVolLim && !hasWgtLim) return 'nodata';
    if (!prod.volume_cm3 && !prod.weight_kg) return 'nodims';

    const grades: ('ok' | 'warn' | 'danger')[] = [];
    if (hasVolLim && prod.volume_cm3 != null && qty > 0) {
      const need = qty * prod.volume_cm3, avail = cap.capacity_volume.available_cm3 ?? 0;
      grades.push(need > avail ? 'danger' : need > avail * 0.8 ? 'warn' : 'ok');
    }
    if (hasWgtLim && prod.weight_kg != null && qty > 0) {
      const need = qty * prod.weight_kg, avail = cap.capacity_weight.available_kg ?? 0;
      grades.push(need > avail ? 'danger' : need > avail * 0.8 ? 'warn' : 'ok');
    }
    if (grades.length === 0) return 'ok';
    if (grades.includes('danger')) return 'danger';
    if (grades.includes('warn')) return 'warn';
    return 'ok';
  }

  // ── Helpers de clasificación ──────────────────────────────────

  classIcon(cls: ProductClassification): string {
    const m: Record<string, string> = { MED: 'medication', DM: 'medical_services' };
    return m[cls.code] || 'inventory_2';
  }

  zoneTypeIcon(type: string): string {
    const m: Record<string, string> = { ambient: 'thermostat', cold: 'ac_unit', frozen: 'severe_cold', controlled: 'security' };
    return m[type] || 'place';
  }

  poStatusLabel(status: string): string {
    const m: Record<string, string> = {
      sent: 'Enviada', partially_received: 'Rec. Parcial',
    };
    return m[status] || status;
  }

  // ── Format helpers ────────────────────────────────────────────

  _fmtVol(val: number | null): string {
    if (val === null) return '—';
    return val >= 1_000_000 ? `${(val / 1_000_000).toFixed(2)} m³` : `${val.toLocaleString(undefined, { maximumFractionDigits: 0 })} cm³`;
  }

  _fmtKg(val: number | null): string {
    if (val === null) return '—';
    return val >= 1000 ? `${(val / 1000).toFixed(2)} t` : `${val.toFixed(2)} kg`;
  }

  fmtPct(val: number | null): string { return val !== null ? `${val.toFixed(1)} %` : '—'; }

  neededVol(qty: number): number | null {
    const v = this.selectedProduct?.volume_cm3;
    return v != null && qty > 0 ? qty * v : null;
  }

  neededWgt(qty: number): number | null {
    const w = this.selectedProduct?.weight_kg;
    return w != null && qty > 0 ? qty * w : null;
  }

  asGroup(ctrl: AbstractControl): FormGroup { return ctrl as FormGroup; }

  // ── Actualizar OC tras ingreso ────────────────────────────────

  /**
   * Llama a /purchase-orders/{id}/receive después de un ingreso exitoso.
   * Si falla (lotNumber vacío, etc.), el inventario ya fue guardado → cierra igual.
   */
  private _notifyPoReceive(formValue: any, onDone: () => void): void {
    const po   = this._linkedPo;
    const item = this._linkedPoItem;
    if (!po || !item?.id) { onDone(); return; }

    const qtyReceived = this.usePresentationMode()
      ? (Number(formValue.quantity_in_presentation) || 0)
      : (this.useDistribution() ? this.entryDistTotal : (Number(formValue.quantity_base) || 0));

    this.purchasingSvc.receive(po.id, [{
      item_id:           item.id,
      quantity_received: qtyReceived,
      lot_number:        formValue.lot_number || '',
      expiration_date:   formValue.expiration_date || '',
      location_id:       formValue.location_id || undefined,
    }]).subscribe({
      next:  () => onDone(),
      error: () => onDone(), // El inventario ya fue guardado → cerrar igual
    });
  }

  // ── Guardar ──────────────────────────────────────────────────

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.errors.set([]);

    if (this.isEntry && this.useDistribution()) {
      if (this.entryRows.invalid) { this.errors.set(['Completa todas las filas de distribución.']); return; }
      const capErrors: string[] = [];
      (this.entryRows.value as any[]).forEach((row: any, i: number) =>
        capErrors.push(...this._capErrors(this.entryRowCaps()[i], Number(row.quantity_base) || 0))
      );
      if (capErrors.length) { this.errors.set(capErrors); return; }
    }

    if (this.isTransfer && this.useDistribution()) {
      if (this.transferRows.invalid) { this.errors.set(['Completa todas las filas de distribución.']); return; }
      const capErrors: string[] = [];
      (this.transferRows.value as any[]).forEach((row: any, i: number) =>
        capErrors.push(...this._capErrors(this.transferRowCaps()[i], Number(row.quantity) || 0))
      );
      if (capErrors.length) { this.errors.set(capErrors); return; }
    }

    if (this.isEntry && !this.useDistribution()) {
      const errs = this._capErrors(this.singleLocCapacity(), this.effectiveBaseQty);
      if (errs.length) { this.errors.set(errs); return; }
    }

    if (this.isTransfer && !this.useDistribution()) {
      const errs = this._capErrors(this.destLocCapacity(), Number(this.form.value.quantity) || 0);
      if (errs.length) { this.errors.set(errs); return; }
    }

    this.saving.set(true);
    const v = this.form.value;

    const basePayload: Record<string, unknown> = {
      product_id:   v.product_id,
      warehouse_id: v.warehouse_id,
      reason:       v.reason || undefined,
    };

    // Adjuntar referencia OC si hay una vinculada
    const linkedPo   = this._linkedPo;
    const linkedItem = this._linkedPoItem;
    if (linkedPo)       basePayload['purchase_order_id']      = linkedPo.id;
    if (linkedItem?.id) basePayload['purchase_order_item_id'] = linkedItem.id;

    // ── ENTRADA ─────────────────────────────────────────────────
    if (this.isEntry) {
      const lotInfo = {
        lot_number:         v.lot_number         || undefined,
        expiration_date:    v.expiration_date     || undefined,
        manufacturing_date: v.manufacturing_date  || undefined,
        notes:              v.notes               || undefined,
      };

      if (this.useDistribution()) {
        const calls = (this.entryRows.value as any[]).map((row: any) =>
          this.data.inventorySvc.entry({ ...basePayload, ...lotInfo, location_id: row.location_id, quantity_base: Number(row.quantity_base) })
        );
        forkJoin(calls).subscribe({
          next: () => this._notifyPoReceive(v, () => this.ref.close(true)),
          error: err => this._handleError(err),
        });
        return;
      }

      const entryPayload: Record<string, unknown> = { ...basePayload, ...lotInfo, location_id: v.location_id || undefined };
      if (this.usePresentationMode() && v.product_presentation_id) {
        entryPayload['product_presentation_id'] = v.product_presentation_id as any;
        entryPayload['quantity_in_presentation'] = v.quantity_in_presentation as any;
      } else {
        entryPayload['quantity_base'] = (v.quantity_base || v.quantity) as any;
      }
      this.data.inventorySvc.entry(entryPayload).subscribe({
        next: () => this._notifyPoReceive(v, () => this.ref.close(true)),
        error: err => this._handleError(err),
      });
      return;
    }

    // ── TRANSFERENCIA ────────────────────────────────────────────
    if (this.isTransfer) {
      if (this.useDistribution()) {
        const calls = (this.transferRows.value as any[]).map((row: any) =>
          this.data.inventorySvc.transfer({ ...basePayload, location_from_id: v.location_from_id, location_to_id: row.location_to_id, quantity: Number(row.quantity) })
        );
        forkJoin(calls).subscribe({ next: () => this.ref.close(true), error: err => this._handleError(err) });
        return;
      }
      this.data.inventorySvc.transfer({ ...basePayload, location_from_id: v.location_from_id, location_to_id: v.location_to_id, quantity: v.quantity })
        .subscribe({ next: () => this.ref.close(true), error: err => this._handleError(err) });
      return;
    }

    // ── AJUSTE ───────────────────────────────────────────────────
    if (this.isAdjustment) {
      this.data.inventorySvc.adjustment({ ...basePayload, location_id: v.location_id || undefined, quantity: v.quantity, reason: v.reason })
        .subscribe({
          next: res => this._printPdfAndClose(res.data, 'adjustment'),
          error: err => this._handleError(err),
        });
      return;
    }

    // ── SALIDA ───────────────────────────────────────────────────
    if (this.isExit) {
      const exitPayload: Record<string, unknown> = {
        ...basePayload,
        location_id:    v.location_id    || undefined,
        quantity:       v.quantity,
        cost_center_id: v.cost_center_id,
      };

      if (this.isExternalCenter) {
        exitPayload['service_id']          = v.service_id;
        exitPayload['patient_document']    = v.patient_document    || undefined;
        exitPayload['patient_external_id'] = v.patient_external_id || undefined;
      }

      this.data.inventorySvc.exit(exitPayload).subscribe({
        next: res => {
          const batchId = res?.data?.batch_id;
          if (batchId) {
            this.data.inventorySvc.getBatchById(batchId).subscribe({
              next: b => this.ref.close({ ok: true, batch: b.data }),
              error: () => this.ref.close({ ok: true, batch: null }),
            });
          } else {
            this.ref.close({ ok: true, batch: null });
          }
        },
        error: err => this._handleError(err),
      });
      return;
    }

    // ── BAJA DE INVENTARIO ───────────────────────────────────────
    if (this.isLoss) {
      const categoryLabel = LOSS_REASON_OPTIONS.find(o => o.value === v.loss_reason_category)?.label ?? v.loss_reason_category;
      const detail = v.reason?.trim();
      const reason = detail ? `${categoryLabel}: ${detail}` : categoryLabel;

      this.data.inventorySvc.loss({ ...basePayload, batch_id: v.batch_id, location_id: v.location_id, quantity: v.quantity, reason })
        .subscribe({
          next: res => this._printPdfAndClose(res.data, 'loss'),
          error: err => this._handleError(err),
        });
      return;
    }

    // ── DEVOLUCIÓN ───────────────────────────────────────────────
    this.data.inventorySvc.return_({ ...basePayload, location_id: v.location_id || undefined, quantity: v.quantity })
      .subscribe({
        next: res => this._printPdfAndClose(res.data, 'return'),
        error: err => this._handleError(err),
      });
  }

  private _printPdfAndClose(movement: any, type: string): void {
    const expiry$ = movement.batch_id
      ? this.data.inventorySvc.getBatchById(movement.batch_id).pipe(map(b => b.data.expiration_date), catchError(() => of(null)))
      : of(null);

    expiry$.subscribe(expiration_date => {
      const wh = this.data.warehouses.find(w => w.id === movement.warehouse_id);
      const whTo = movement.warehouse_to_id
        ? this.data.warehouses.find(w => w.id === movement.warehouse_to_id)
        : null;
      this.pdfSvc.generateAndPrint({
        movement_type:     type,
        doc_id:            movement.id,
        date:              movement.created_at,
        user_name:         movement.user_name,
        warehouse_name:    wh?.name ?? `Almacén ${movement.warehouse_id}`,
        warehouse_to_name: whTo?.name ?? null,
        reason:            movement.reason,
        cost_center_name:  movement.cost_center?.name ?? null,
        lines: [{ product_name: movement.product_name, lot_number: movement.batch_lot_number, expiration_date, quantity: movement.quantity }],
      });
      this.ref.close(true);
    });
  }

  private _handleError(err: any): void {
    this.saving.set(false);
    if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
    else if (err.status === 409 && err.error?.error_code === 'EXPIRED_STOCK')
      this.errors.set([err.error?.message || 'El producto solo tiene stock vencido en este almacén. Gestione el lote vencido mediante una devolución, un ajuste o una baja por vencimiento antes de continuar.']);
    else if (err.status === 409) this.errors.set([err.error?.message || 'Error de capacidad o negocio']);
    else this.errors.set([err.error?.message || 'Error al registrar el movimiento']);
  }
}

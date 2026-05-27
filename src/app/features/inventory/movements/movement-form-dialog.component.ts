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
import { forkJoin, finalize } from 'rxjs';
import { InventoryService, StockSummary, BatchDetail } from '../inventory.service';
import { WarehouseService, Warehouse, Location, LocationCapacity } from '../../warehouse/warehouse.service';
import { CatalogService, Product, ProductPresentation } from '../../catalog/catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

const TYPE_LABELS: Record<string, string> = {
  entry: 'Entrada de Mercancía', exit: 'Salida de Stock', transfer: 'Transferencia',
  adjustment: 'Ajuste de Inventario', return: 'Devolución a Proveedor',
};

@Component({
  selector: 'app-movement-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule, FormErrorsComponent,
  ],
  templateUrl: './movement-form-dialog.component.html',
  styleUrl: './movement-form-dialog.component.scss',
})
export class MovementFormDialogComponent implements OnInit {
  data: { type: string; warehouses: Warehouse[]; products: Product[]; inventorySvc: InventoryService } = inject(MAT_DIALOG_DATA);
  private ref  = inject(MatDialogRef<MovementFormDialogComponent>);
  private fb   = inject(FormBuilder);
  private wSvc = inject(WarehouseService);
  private cSvc = inject(CatalogService);

  saving = signal(false);
  errors = signal<string[]>([]);
  locations = signal<Location[]>([]);
  presentations = signal<ProductPresentation[]>([]);
  usePresentationMode = signal(false);

  // ── Capacidad — ubicación única ──────────────────────────────
  /** Capacidad de la ubicación de entrada (modo única) */
  singleLocCapacity = signal<LocationCapacity | null>(null);
  loadingSingleCap  = signal(false);
  /** Capacidad de la ubicación destino (transferencia) */
  destLocCapacity   = signal<LocationCapacity | null>(null);
  loadingDestCap    = signal(false);

  // ── Modo multi-ubicación ─────────────────────────────────────
  useDistribution = signal(false);

  /** FormArray para filas de entrada multi-ubicación */
  distributionForm = this.fb.group({
    entryRows:    this.fb.array([]),
    transferRows: this.fb.array([]),
  });
  get entryRows(): FormArray    { return this.distributionForm.get('entryRows')    as FormArray; }
  get transferRows(): FormArray { return this.distributionForm.get('transferRows') as FormArray; }

  /** Capacidades cargadas por fila (paralelo al FormArray) */
  entryRowCaps    = signal<(LocationCapacity | null)[]>([]);
  transferRowCaps = signal<(LocationCapacity | null)[]>([]);

  // ── FEFO / Stock (solo para EXIT) ───────────────────────────
  /** Resumen de stock del producto en el almacén seleccionado (Paso 2) */
  stockSummary      = signal<StockSummary | null>(null);
  loadingStock      = signal(false);
  /** Lotes en orden FEFO (Paso 3) */
  fefoLotes         = signal<BatchDetail[]>([]);
  loadingFefo       = signal(false);
  /** Confirmación post-salida: lote efectivamente descontado (Paso 5) */
  exitConfirmation  = signal<BatchDetail | null>(null);

  // ── Getters ──────────────────────────────────────────────────

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

  /** Unidades base efectivas del movimiento actual */
  get effectiveBaseQty(): number {
    if (this.usePresentationMode() && this.previewBaseUnits !== null) return this.previewBaseUnits;
    const v = this.form.value;
    return Number(v.quantity_base) || 0;
  }

  /** Suma de cantidades en filas de distribución de entrada */
  get entryDistTotal(): number {
    return (this.entryRows.value as any[]).reduce((s: number, r: any) => s + (Number(r.quantity_base) || 0), 0);
  }

  /** Suma de cantidades en filas de distribución de transferencia */
  get transferDistTotal(): number {
    return (this.transferRows.value as any[]).reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
  }

  /** Nombre del almacén seleccionado (para mostrar en el panel de stock) */
  get selectedWarehouseName(): string {
    const id = this.form.get('warehouse_id')?.value;
    return this.data.warehouses.find(w => w.id === id)?.name ?? '';
  }

  /** True cuando el stock ya fue consultado y vale 0 → bloquear formulario */
  get hasZeroStock(): boolean {
    const s = this.stockSummary();
    return this.isExit && s !== null && s.available_quantity === 0;
  }

  /** Stock disponible con color semáforo para el panel de salida */
  get stockStatusClass(): 'ok' | 'warn' | 'danger' | 'loading' | 'none' {
    if (this.loadingStock()) return 'loading';
    const s = this.stockSummary();
    if (!s) return 'none';
    if (s.available_quantity === 0) return 'danger';
    const requested = Number(this.form.get('quantity')?.value) || 0;
    if (requested > 0 && requested > s.available_quantity) return 'danger';
    if (requested > 0 && requested > s.available_quantity * 0.8) return 'warn';
    return 'ok';
  }

  /**
   * Validación reactiva del botón Registrar.
   * Reemplaza `form.invalid` para manejar correctamente los casos condicionales
   * (entrada vs distribución, tipo de movimiento, etc.).
   */
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

    if (this.isAdjustment) return !!(v.quantity) && !!v.reason;

    // exit, return
    if (!v.quantity || (v.quantity ?? 0) < 1) return false;
    // Bloquear si ya sabemos que no hay stock (Paso 2)
    if (this.isExit) {
      const s = this.stockSummary();
      if (s !== null && s.available_quantity === 0) return false;
    }
    return true;
  }

  get typeLabel()    { return TYPE_LABELS[this.data.type] || this.data.type; }
  get isEntry()      { return this.data.type === 'entry'; }
  get isExit()       { return this.data.type === 'exit'; }
  get isTransfer()   { return this.data.type === 'transfer'; }
  get isAdjustment() { return this.data.type === 'adjustment'; }
  get isReturn()     { return this.data.type === 'return'; }

  form = this.fb.group({
    product_id:               [null as number | null, Validators.required],
    warehouse_id:             [null as number | null, Validators.required],
    location_id:              [null as number | null],
    location_from_id:         [null as number | null],
    location_to_id:           [null as number | null],
    quantity:                 [null as number | null, [Validators.min(1)]],
    quantity_base:            [null as number | null],
    product_presentation_id:  [null as number | null],
    quantity_in_presentation: [null as number | null],
    lot_number:               [''],
    expiration_date:          [''],
    manufacturing_date:       [''],
    reason:                   [''],
    notes:                    [''],
  });

  ngOnInit(): void {
    // Almacén → cargar ubicaciones + FEFO si es EXIT
    this.form.get('warehouse_id')!.valueChanges.subscribe(wId => {
      this.singleLocCapacity.set(null);
      this.destLocCapacity.set(null);
      this._resetDistRows();
      if (wId) {
        this.wSvc.getWarehouseLocations(Number(wId)).subscribe({ next: r => this.locations.set(r.data), error: () => {} });
        this._loadExitData();
      } else {
        this.stockSummary.set(null);
        this.fefoLotes.set([]);
      }
    });

    // Producto → cargar presentaciones + FEFO si es EXIT
    this.form.get('product_id')!.valueChanges.subscribe(pId => {
      this.singleLocCapacity.set(null);
      this.destLocCapacity.set(null);
      if (pId) {
        this.cSvc.getPresentations(Number(pId)).subscribe({ next: r => this.presentations.set(r.data), error: () => {} });
        this._loadExitData();
      } else {
        this.stockSummary.set(null);
        this.fefoLotes.set([]);
      }
    });

    // Ubicación de entrada (modo única) → cargar capacidad
    this.form.get('location_id')!.valueChanges.subscribe(locId => {
      this.singleLocCapacity.set(null);
      this.errors.set([]);
      if (locId) this._loadLocCap(Number(locId), 'single');
    });

    // Ubicación destino (transferencia) → cargar capacidad
    this.form.get('location_to_id')!.valueChanges.subscribe(locId => {
      this.destLocCapacity.set(null);
      this.errors.set([]);
      if (locId) this._loadLocCap(Number(locId), 'dest');
    });

    // Inicializar filas de distribución
    this._addEntryRow();
    this._addTransferRow();
  }

  // ── FEFO helpers ─────────────────────────────────────────────

  /**
   * Carga Paso 2 (stock summary) y Paso 3 (lotes FEFO) con llamadas independientes.
   * Si una falla, la otra sigue mostrándose correctamente.
   * Solo actúa si el tipo es EXIT y ambos campos están seleccionados.
   */
  private _loadExitData(): void {
    if (!this.isExit) return;
    const pId = this.form.get('product_id')?.value;
    const wId = this.form.get('warehouse_id')?.value;
    if (!pId || !wId) return;

    this.stockSummary.set(null);
    this.fefoLotes.set([]);
    this.loadingStock.set(true);
    this.loadingFefo.set(true);

    // Paso 2 — stock summary (independiente de los lotes)
    this.data.inventorySvc.getStockSummary(Number(wId), Number(pId))
      .pipe(finalize(() => this.loadingStock.set(false)))
      .subscribe({
        next: r  => this.stockSummary.set(r.data),
        error: () => this.stockSummary.set(null),
      });

    // Paso 3 — lotes FEFO (independiente del stock summary)
    this.data.inventorySvc.getProductBatches(Number(pId))
      .pipe(finalize(() => this.loadingFefo.set(false)))
      .subscribe({
        next: r  => this.fefoLotes.set(r.data.filter(b => b.status === 'active' && b.quantity_available > 0)),
        error: () => this.fefoLotes.set([]),
      });
  }

  /** Etiqueta descriptiva de la ubicación del primer lote FEFO */
  get fefoFirstLocation(): string {
    const first = this.fefoLotes()[0];
    if (!first || !first.locations?.length) return '';
    const loc = first.locations[0];
    const parts: string[] = [loc.location_name];
    if (loc.zone?.zone_name) parts.push(loc.zone.zone_name);
    return parts.join(' · ');
  }

  // ── Distribución — filas de entrada ──────────────────────────

  addEntryRow(): void {
    this._addEntryRow();
  }

  private _addEntryRow(): void {
    this.entryRows.push(this.fb.group({
      location_id:   [null as number | null, Validators.required],
      quantity_base: [null as number | null, [Validators.required, Validators.min(1)]],
    }));
    // Mantener array de capacidades sincronizado con las filas
    this.entryRowCaps.update(arr => {
      while (arr.length < this.entryRows.length) arr = [...arr, null];
      return arr;
    });
  }

  removeEntryRow(i: number): void {
    if (this.entryRows.length <= 1) return;
    this.entryRows.removeAt(i);
    this.entryRowCaps.update(arr => arr.filter((_, idx) => idx !== i));
  }

  onEntryRowLocChange(i: number, locId: number | null): void {
    this.entryRowCaps.update(arr => {
      const a = [...arr];
      a[i] = null;
      return a;
    });
    if (locId) {
      this.wSvc.getLocationCapacity(locId).subscribe({
        next: r => this.entryRowCaps.update(arr => {
          const a = [...arr];
          if (i < a.length) a[i] = r.data;
          return a;
        }),
        error: () => {},
      });
    }
  }

  // ── Distribución — filas de transferencia ────────────────────

  addTransferRow(): void {
    this._addTransferRow();
  }

  private _addTransferRow(): void {
    this.transferRows.push(this.fb.group({
      location_to_id: [null as number | null, Validators.required],
      quantity:       [null as number | null, [Validators.required, Validators.min(1)]],
    }));
    this.transferRowCaps.update(arr => {
      while (arr.length < this.transferRows.length) arr = [...arr, null];
      return arr;
    });
  }

  removeTransferRow(i: number): void {
    if (this.transferRows.length <= 1) return;
    this.transferRows.removeAt(i);
    this.transferRowCaps.update(arr => arr.filter((_, idx) => idx !== i));
  }

  onTransferRowLocChange(i: number, locId: number | null): void {
    this.transferRowCaps.update(arr => {
      const a = [...arr];
      a[i] = null;
      return a;
    });
    if (locId) {
      this.wSvc.getLocationCapacity(locId).subscribe({
        next: r => this.transferRowCaps.update(arr => {
          const a = [...arr];
          if (i < a.length) a[i] = r.data;
          return a;
        }),
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
      // Limpiar la ubicación única al activar distribución
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

  // ── Capacidad — helpers ──────────────────────────────────────

  private _loadLocCap(locId: number, target: 'single' | 'dest'): void {
    if (target === 'single') { this.loadingSingleCap.set(true); }
    else { this.loadingDestCap.set(true); }

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

  /**
   * Valida si `qty` unidades del producto seleccionado caben en la ubicación.
   * Retorna lista de mensajes de error (vacía = sin problemas).
   */
  private _capErrors(cap: LocationCapacity | null, qty: number): string[] {
    const errs: string[] = [];
    if (!cap || qty <= 0) return errs;
    const prod = this.selectedProduct;
    if (!prod) return errs;

    if (cap.capacity_volume.max_cm3 !== null && prod.volume_cm3 != null) {
      const need  = qty * prod.volume_cm3;
      const avail = cap.capacity_volume.available_cm3 ?? 0;
      if (need > avail) {
        errs.push(`Volumen insuficiente en "${cap.name}": necesita ${this._fmtVol(need)}, disponible ${this._fmtVol(avail)}.`);
      }
    }

    if (cap.capacity_weight.max_kg !== null && prod.weight_kg != null) {
      const need  = qty * prod.weight_kg;
      const avail = cap.capacity_weight.available_kg ?? 0;
      if (need > avail) {
        errs.push(`Peso insuficiente en "${cap.name}": necesita ${this._fmtKg(need)}, disponible ${this._fmtKg(avail)}.`);
      }
    }

    return errs;
  }

  /** Estado proyectado de la ubicación tras el movimiento */
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
      const need  = qty * prod.volume_cm3;
      const avail = cap.capacity_volume.available_cm3 ?? 0;
      grades.push(need > avail ? 'danger' : need > avail * 0.8 ? 'warn' : 'ok');
    }

    if (hasWgtLim && prod.weight_kg != null && qty > 0) {
      const need  = qty * prod.weight_kg;
      const avail = cap.capacity_weight.available_kg ?? 0;
      grades.push(need > avail ? 'danger' : need > avail * 0.8 ? 'warn' : 'ok');
    }

    if (grades.length === 0) return 'ok';
    if (grades.includes('danger')) return 'danger';
    if (grades.includes('warn')) return 'warn';
    return 'ok';
  }

  _fmtVol(val: number | null): string {
    if (val === null) return '—';
    return val >= 1_000_000
      ? `${(val / 1_000_000).toFixed(2)} m³`
      : `${val.toLocaleString(undefined, { maximumFractionDigits: 0 })} cm³`;
  }

  _fmtKg(val: number | null): string {
    if (val === null) return '—';
    return val >= 1000 ? `${(val / 1000).toFixed(2)} t` : `${val.toFixed(2)} kg`;
  }

  fmtPct(val: number | null): string {
    return val !== null ? `${val.toFixed(1)} %` : '—';
  }

  neededVol(qty: number): number | null {
    const v = this.selectedProduct?.volume_cm3;
    return v != null && qty > 0 ? qty * v : null;
  }

  neededWgt(qty: number): number | null {
    const w = this.selectedProduct?.weight_kg;
    return w != null && qty > 0 ? qty * w : null;
  }

  /** Helper de template para castear AbstractControl a FormGroup */
  asGroup(ctrl: AbstractControl): FormGroup { return ctrl as FormGroup; }

  // ── Guardar ──────────────────────────────────────────────────

  save(): void {
    if (this.form.invalid || this.saving()) return;

    this.errors.set([]);

    // ── Validación de capacidad en modo distribución de entrada ──
    if (this.isEntry && this.useDistribution()) {
      if (this.entryRows.invalid) {
        this.errors.set(['Completa todas las filas de distribución (ubicación y cantidad ≥ 1).']);
        return;
      }
      const capErrors: string[] = [];
      (this.entryRows.value as any[]).forEach((row: any, i: number) => {
        const cap = this.entryRowCaps()[i];
        capErrors.push(...this._capErrors(cap, Number(row.quantity_base) || 0));
      });
      if (capErrors.length > 0) { this.errors.set(capErrors); return; }
    }

    // ── Validación de capacidad en modo distribución de transferencia ─
    if (this.isTransfer && this.useDistribution()) {
      if (this.transferRows.invalid) {
        this.errors.set(['Completa todas las filas de distribución (ubicación destino y cantidad ≥ 1).']);
        return;
      }
      const capErrors: string[] = [];
      (this.transferRows.value as any[]).forEach((row: any, i: number) => {
        const cap = this.transferRowCaps()[i];
        capErrors.push(...this._capErrors(cap, Number(row.quantity) || 0));
      });
      if (capErrors.length > 0) { this.errors.set(capErrors); return; }
    }

    // ── Validación de capacidad en modo ubicación única ──────────
    if (this.isEntry && !this.useDistribution()) {
      const errs = this._capErrors(this.singleLocCapacity(), this.effectiveBaseQty);
      if (errs.length > 0) { this.errors.set(errs); return; }
    }

    if (this.isTransfer && !this.useDistribution()) {
      const qty = Number(this.form.value.quantity) || 0;
      const errs = this._capErrors(this.destLocCapacity(), qty);
      if (errs.length > 0) { this.errors.set(errs); return; }
    }

    // ── Dispatch ────────────────────────────────────────────────
    this.saving.set(true);
    const v = this.form.value;
    const basePayload: Record<string, unknown> = {
      product_id:   v.product_id,
      warehouse_id: v.warehouse_id,
      reason:       v.reason || undefined,
    };

    // ENTRADA
    if (this.isEntry) {
      const lotInfo = {
        lot_number:           v.lot_number           || undefined,
        expiration_date:      v.expiration_date       || undefined,
        manufacturing_date:   v.manufacturing_date    || undefined,
        notes:                v.notes                 || undefined,
      };

      // Distribución multi-ubicación
      if (this.useDistribution()) {
        const calls = (this.entryRows.value as any[]).map((row: any) =>
          this.data.inventorySvc.entry({ ...basePayload, ...lotInfo, location_id: row.location_id, quantity_base: Number(row.quantity_base) })
        );
        forkJoin(calls).subscribe({
          next: () => this.ref.close(true),
          error: err => this._handleError(err),
        });
        return;
      }

      // Ubicación única
      const entryPayload: Record<string, unknown> = { ...basePayload, ...lotInfo, location_id: v.location_id || undefined };
      if (this.usePresentationMode() && v.product_presentation_id) {
        entryPayload['product_presentation_id'] = v.product_presentation_id as any;
        entryPayload['quantity_in_presentation'] = v.quantity_in_presentation as any;
      } else {
        entryPayload['quantity_base'] = (v.quantity_base || v.quantity) as any;
      }
      this.data.inventorySvc.entry(entryPayload).subscribe({
        next: () => this.ref.close(true),
        error: err => this._handleError(err),
      });
      return;
    }

    // TRANSFERENCIA
    if (this.isTransfer) {
      if (this.useDistribution()) {
        const calls = (this.transferRows.value as any[]).map((row: any) =>
          this.data.inventorySvc.transfer({ ...basePayload, location_from_id: v.location_from_id, location_to_id: row.location_to_id, quantity: Number(row.quantity) })
        );
        forkJoin(calls).subscribe({
          next: () => this.ref.close(true),
          error: err => this._handleError(err),
        });
        return;
      }
      this.data.inventorySvc.transfer({ ...basePayload, location_from_id: v.location_from_id, location_to_id: v.location_to_id, quantity: v.quantity }).subscribe({
        next: () => this.ref.close(true),
        error: err => this._handleError(err),
      });
      return;
    }

    // AJUSTE
    if (this.isAdjustment) {
      this.data.inventorySvc.adjustment({ ...basePayload, location_id: v.location_id || undefined, quantity: v.quantity, reason: v.reason }).subscribe({
        next: () => this.ref.close(true),
        error: err => this._handleError(err),
      });
      return;
    }

    // SALIDA — Paso 4: POST /movements/exit
    if (this.isExit) {
      const exitPayload = {
        ...basePayload,
        location_id: v.location_id || undefined,
        quantity:    v.quantity,
      };
      this.data.inventorySvc.exit(exitPayload).subscribe({
        next: res => {
          // Paso 5: si el backend retorna batch_id, cargamos el lote actualizado para mostrar confirmación
          const batchId = res?.data?.batch_id;
          if (batchId) {
            this.data.inventorySvc.getBatchById(batchId).subscribe({
              next: b => this.ref.close({ ok: true, batch: b.data }),
              error: ()  => this.ref.close({ ok: true, batch: null }),
            });
          } else {
            this.ref.close({ ok: true, batch: null });
          }
        },
        error: err => this._handleError(err),
      });
      return;
    }

    // DEVOLUCIÓN
    const simplePayload = { ...basePayload, location_id: v.location_id || undefined, quantity: v.quantity };
    this.data.inventorySvc.return_(simplePayload).subscribe({
      next: () => this.ref.close(true),
      error: err => this._handleError(err),
    });
  }

  private _handleError(err: any): void {
    this.saving.set(false);
    if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
    else if (err.status === 409) this.errors.set([err.error?.message || 'Error de capacidad o negocio']);
    else this.errors.set([err.error?.message || 'Error al registrar el movimiento']);
  }
}

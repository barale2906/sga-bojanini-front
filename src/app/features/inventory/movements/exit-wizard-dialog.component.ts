import { Component, inject, signal, computed, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl, FormArray, FormBuilder, FormGroup,
  ReactiveFormsModule, Validators,
} from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { forkJoin, finalize, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { InventoryService, StockSummary, BatchDetail, CostCenter } from '../inventory.service';
import { MovementConfirmDialogComponent, MovementConfirmResult } from './movement-confirm-dialog.component';
import { MovementPdfSignature } from '../../../shared/services/movement-pdf.service';
import { WarehouseService, Warehouse } from '../../warehouse/warehouse.service';
import { Product } from '../../catalog/catalog.service';
import { MedicalServicesService, MedicalServiceNode, ProcedurePrice } from '../medical-services.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { ProductSearchComponent } from '../../../shared/components/product-search/product-search.component';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';
import { MovementPdfService } from '../../../shared/services/movement-pdf.service';

export interface ExitWizardDialogData {
  warehouses: Warehouse[];
  products:   Product[];
  inventorySvc: InventoryService;
}

interface ExitSummaryLine {
  product_name:    string;
  lot_number:      string | null;
  expiration_date: string | null;
  quantity:        number;
}

interface ExitSummaryData {
  doc_id:           number;
  date:             string;
  user_name:        string;
  warehouse_name:   string;
  cost_center_name: string | null;
  reason:           string | null;
  lines:            ExitSummaryLine[];
  withRecords:      boolean;
}

interface CartItem {
  product:         Product;
  quantity:        number;
  summary:         StockSummary | null;
  fefo:            BatchDetail[];
  loadingStock:    boolean;
  loadingFefo:     boolean;
  checkingExpired: boolean;
  expiredOnly:     boolean;
  isKit:           boolean;
  kitAvailable:    number | null;
}

interface DispatchLine {
  product_name:    string;
  product_code:    string;
  lot_number:      string | null;
  expiration_date: string | null;
  quantity:        number;
  is_kit:          boolean;
}

@Component({
  selector: 'app-exit-wizard-dialog',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule, MatDividerModule,
    MatDatepickerModule, FormErrorsComponent, ProductSearchComponent,
  ],
  templateUrl: './exit-wizard-dialog.component.html',
  styleUrl:    './exit-wizard-dialog.component.scss',
})
export class ExitWizardDialogComponent implements OnInit {
  @ViewChild('scanner') scannerRef?: ProductSearchComponent;

  data: ExitWizardDialogData = inject(MAT_DIALOG_DATA);
  private ref    = inject(MatDialogRef<ExitWizardDialogComponent>);
  private fb     = inject(FormBuilder);
  private wSvc   = inject(WarehouseService);
  private medSvc = inject(MedicalServicesService);
  private pdfSvc = inject(MovementPdfService);
  private dialog = inject(MatDialog);

  // ── Wizard state ─────────────────────────────────────────────
  step            = signal<1 | 2 | 3>(1);
  saving          = signal(false);
  errors          = signal<string[]>([]);
  exitSummaryData = signal<ExitSummaryData | null>(null);
  exitSignatures  = signal<{ delivered_by: MovementPdfSignature; received_by: MovementPdfSignature } | null>(null);

  // ── Step 1: Scanner / Cart ────────────────────────────────────
  warehouseControl  = this.fb.control<number | null>(null, Validators.required);
  cartItems         = signal<CartItem[]>([]);
  scannerChecking   = signal(false);
  scanError         = signal<string | null>(null);

  // ── Step 2: Centro de costos y paciente ──────────────────────
  centerForm = this.fb.group({
    cost_center_id:      [null as number | null, Validators.required],
    reason:              [''],
    patient_document:    [null as string | null],
    patient_external_id: [null as string | null],
    patient_first_name:  [null as string | null],
    patient_last_name:   [null as string | null],
    service_date:        [new Date() as Date | null],
    filter_service_id:   [null as number | null],
  });
  procedureRows = this.fb.array<FormGroup>([]);

  costCenters        = signal<CostCenter[]>([]);
  loadingCostCenters = signal(false);
  servicesTree       = signal<MedicalServiceNode[]>([]);
  loadingTree        = signal(false);
  rowPrices          = signal<(ProcedurePrice | null)[]>([]);
  rowPricesLoading   = signal<boolean[]>([]);

  // ── Computed / helpers ────────────────────────────────────────

  get selectedCostCenter(): CostCenter | null {
    const id = this.centerForm.get('cost_center_id')?.value;
    return this.costCenters().find(c => c.id === id) ?? null;
  }

  get isExternalCenter(): boolean {
    return this.selectedCostCenter?.is_external === true;
  }

  /** Vista previa de despacho por lote (FEFO), calculada en el cliente antes de confirmar. */
  dispatchPreview = computed((): DispatchLine[] => {
    const lines: DispatchLine[] = [];
    for (const item of this.cartItems()) {
      if (item.isKit) {
        lines.push({ product_name: item.product.name, product_code: item.product.code, lot_number: null, expiration_date: null, quantity: item.quantity, is_kit: true });
        continue;
      }
      let remaining = item.quantity;
      for (const lote of item.fefo) {
        if (remaining <= 0) break;
        const fromLot = Math.min(remaining, lote.quantity_available);
        lines.push({ product_name: item.product.name, product_code: item.product.code, lot_number: lote.lot_number, expiration_date: lote.expiration_date, quantity: fromLot, is_kit: false });
        remaining -= fromLot;
      }
      if (remaining > 0) {
        lines.push({ product_name: item.product.name, product_code: item.product.code, lot_number: null, expiration_date: null, quantity: remaining, is_kit: false });
      }
    }
    return lines;
  });

  selectedProcedures = computed((): MedicalServiceNode[] => {
    const serviceId = this.centerForm.get('filter_service_id')?.value;
    if (!serviceId) return [];
    return this.servicesTree().find(s => s.id === serviceId)?.children ?? [];
  });

  get selectedWarehouseName(): string {
    const id = this.warehouseControl.value;
    return this.data.warehouses.find(w => w.id === id)?.name ?? '';
  }

  get isStep1Valid(): boolean {
    if (!this.warehouseControl.valid) return false;
    if (this.cartItems().length === 0) return false;
    return this.cartItems().every((item, i) => {
      if (item.quantity < 1) return false;
      if (item.loadingStock || item.loadingFefo || item.checkingExpired) return false;
      const exitable = this.cartExitableQty(i);
      if (exitable === 0) return false;
      if (item.quantity > exitable) return false;
      return true;
    });
  }

  get isStep2Valid(): boolean {
    if (!this.centerForm.get('cost_center_id')?.value) return false;
    if (this.isExternalCenter) {
      const v = this.centerForm.value;
      if (!v.patient_document?.trim() || !v.patient_external_id?.trim()) return false;
      if (!v.patient_first_name?.trim() || !v.patient_last_name?.trim()) return false;
      if (!v.service_date) return false;
      if (this.procedureRows.length === 0) return false;
      return this.procedureRows.controls.every(row => {
        const rv = (row as FormGroup).value;
        return rv.procedure_id && rv.quantity >= 1 && rv.unit_price !== null && rv.unit_price >= 0 && rv.notes?.trim();
      });
    }
    return true;
  }

  ngOnInit(): void {
    this.warehouseControl.valueChanges.subscribe(wId => {
      if (wId) {
        // Recargar stock de todos los items del carrito con el nuevo almacén
        this.cartItems().forEach((_, i) => this._loadCartItemStock(i));
      } else {
        // Limpiar info de stock si se quita el almacén
        this.cartItems.update(arr => arr.map(item => ({
          ...item,
          summary: null, fefo: [], checkingExpired: false, expiredOnly: false,
          loadingStock: false, loadingFefo: false,
        })));
      }
    });

    this.loadingCostCenters.set(true);
    this.data.inventorySvc.getCostCenters({ is_active: true })
      .pipe(finalize(() => this.loadingCostCenters.set(false)))
      .subscribe({ next: r => this.costCenters.set(r.data), error: () => {} });

    this.centerForm.get('cost_center_id')!.valueChanges.subscribe(() => {
      this.procedureRows.clear();
      this.rowPrices.set([]);
      this.rowPricesLoading.set([]);
      this.centerForm.patchValue(
        { patient_document: null, patient_external_id: null, patient_first_name: null, patient_last_name: null, filter_service_id: null },
        { emitEvent: false },
      );
      if (this.isExternalCenter && !this.servicesTree().length) this._loadServicesTree();
    });

    this.centerForm.get('filter_service_id')!.valueChanges.subscribe(() => {
      this.procedureRows.clear();
      this.rowPrices.set([]);
      this.rowPricesLoading.set([]);
    });
  }

  // ── Gestión del carrito ───────────────────────────────────────

  onScanProduct(product: Product | null): void {
    if (!product || !this.warehouseControl.value) return;
    this.scanError.set(null);

    const existing = this.cartItems().findIndex(item => item.product.id === product.id);

    if (existing >= 0) {
      // Producto ya en carrito: validar antes de acumular
      const item     = this.cartItems()[existing];
      const exitable = this.cartExitableQty(existing);
      const loading  = item.loadingStock || item.loadingFefo;

      if (!loading && exitable === 0) {
        this.scanError.set(`"${product.name}" no tiene stock disponible en ${this.selectedWarehouseName}`);
        this.scannerRef?.clear();
        return;
      }
      if (!loading && item.quantity >= exitable) {
        this.scanError.set(`Stock insuficiente: solo hay ${exitable} unidad(es) de "${product.name}"`);
        this.scannerRef?.clear();
        return;
      }
      this.cartItems.update(arr => {
        const u = [...arr]; u[existing] = { ...u[existing], quantity: u[existing].quantity + 1 }; return u;
      });
      this.scannerRef?.clear();
      return;
    }

    // Producto nuevo: verificar stock ANTES de agregar al carrito
    this.scannerChecking.set(true);
    this._preCheckAndAdd(product);
  }

  private _preCheckAndAdd(product: Product): void {
    const wId   = this.warehouseControl.value!;
    const pId   = product.id;
    const isKit = product.product_type === 'kit';

    if (isKit) {
      this.data.inventorySvc.getKitAvailability(pId, Number(wId))
        .pipe(finalize(() => this.scannerChecking.set(false)))
        .subscribe({
          next: r => {
            if (r.data.available_kits === 0) {
              this.scanError.set(`Sin stock de "${product.name}" en ${this.selectedWarehouseName}`);
            } else {
              this.cartItems.update(arr => [...arr, {
                product, quantity: 1,
                summary: null, fefo: [], loadingStock: false, loadingFefo: false,
                checkingExpired: false, expiredOnly: false,
                isKit: true, kitAvailable: r.data.available_kits,
              }]);
            }
            this.scannerRef?.clear();
          },
          error: () => {
            this.scanError.set(`No se pudo verificar el stock de "${product.name}"`);
            this.scannerRef?.clear();
          },
        });
      return;
    }

    // Producto simple: verificar lotes FEFO disponibles
    this.data.inventorySvc.getProductBatches(pId, true)
      .pipe(finalize(() => this.scannerChecking.set(false)))
      .subscribe({
        next: r => {
          const available = r.data.filter(b => b.status === 'active' && b.quantity_available > 0);
          if (available.length === 0) {
            this.scanError.set(`Sin stock disponible para "${product.name}" en ${this.selectedWarehouseName}`);
            this.scannerRef?.clear();
            return;
          }
          // Agregar al carrito con FEFO ya cargado; solo cargar el summary
          const newIdx = this.cartItems().length;
          this.cartItems.update(arr => [...arr, {
            product, quantity: 1,
            summary: null, fefo: available,
            loadingStock: true, loadingFefo: false,
            checkingExpired: false, expiredOnly: false,
            isKit: false, kitAvailable: null,
          }]);
          this._loadCartItemSummaryOnly(newIdx);
          this.scannerRef?.clear();
        },
        error: () => {
          this.scanError.set(`No se pudo verificar el stock de "${product.name}"`);
          this.scannerRef?.clear();
        },
      });
  }

  /** Carga solo el resumen de stock (cuando los lotes FEFO ya fueron pre-cargados). */
  private _loadCartItemSummaryOnly(idx: number): void {
    const item = this.cartItems()[idx];
    const wId  = this.warehouseControl.value;
    if (!item || !wId) return;
    this.data.inventorySvc.getStockSummary(Number(wId), item.product.id)
      .pipe(finalize(() => this.cartItems.update(arr => {
        const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], loadingStock: false }; return u;
      })))
      .subscribe({
        next:  r => this.cartItems.update(arr => {
          const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], summary: r.data }; return u;
        }),
        error: () => this.cartItems.update(arr => {
          const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], summary: null }; return u;
        }),
      });
  }

  removeCartItem(i: number): void {
    this.cartItems.update(arr => arr.filter((_, idx) => idx !== i));
  }

  updateCartQty(i: number, qty: number): void {
    const v = Math.max(1, Math.floor(qty) || 1);
    this.cartItems.update(arr => {
      const u = [...arr]; u[i] = { ...u[i], quantity: v }; return u;
    });
  }

  incrementCartQty(i: number): void {
    this.cartItems.update(arr => {
      const u = [...arr]; u[i] = { ...u[i], quantity: u[i].quantity + 1 }; return u;
    });
  }

  decrementCartQty(i: number): void {
    if ((this.cartItems()[i]?.quantity ?? 1) <= 1) return;
    this.cartItems.update(arr => {
      const u = [...arr]; u[i] = { ...u[i], quantity: u[i].quantity - 1 }; return u;
    });
  }

  cartExitableQty(i: number): number {
    const item = this.cartItems()[i];
    if (!item) return 0;
    if (item.isKit) return item.kitAvailable ?? 0;
    return item.fefo.reduce((sum, b) => sum + b.quantity_available, 0);
  }

  cartStockStatus(i: number): 'ok' | 'warn' | 'danger' | 'loading' | 'none' {
    const item = this.cartItems()[i];
    if (!item) return 'none';
    if (item.loadingStock || item.loadingFefo || item.checkingExpired) return 'loading';
    if (item.isKit) { if (item.kitAvailable === null) return 'none'; }
    else if (!item.summary) return 'none';
    const exitable = this.cartExitableQty(i);
    if (exitable === 0) return 'danger';
    if (item.quantity > exitable) return 'danger';
    if (item.quantity > 0 && item.quantity > exitable * 0.8) return 'warn';
    return 'ok';
  }

  private _loadCartItemStock(idx: number): void {
    const item = this.cartItems()[idx];
    const wId  = this.warehouseControl.value;
    if (!item || !wId) return;

    const pId   = item.product.id;
    const isKit = item.product.product_type === 'kit';

    this.cartItems.update(arr => {
      const u = [...arr];
      if (u[idx]) u[idx] = {
        ...u[idx], isKit,
        loadingStock: true, loadingFefo: !isKit,
        summary: null, fefo: [], kitAvailable: null,
        checkingExpired: false, expiredOnly: false,
      };
      return u;
    });

    if (isKit) {
      this.data.inventorySvc.getKitAvailability(pId, Number(wId))
        .pipe(finalize(() => this.cartItems.update(arr => {
          const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], loadingStock: false }; return u;
        })))
        .subscribe({
          next:  r => this.cartItems.update(arr => {
            const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], kitAvailable: r.data.available_kits }; return u;
          }),
          error: () => this.cartItems.update(arr => {
            const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], kitAvailable: 0 }; return u;
          }),
        });
      return;
    }

    this.data.inventorySvc.getStockSummary(Number(wId), pId)
      .pipe(finalize(() => this.cartItems.update(arr => {
        const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], loadingStock: false }; return u;
      })))
      .subscribe({
        next:  r => this.cartItems.update(arr => {
          const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], summary: r.data }; return u;
        }),
        error: () => this.cartItems.update(arr => {
          const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], summary: null }; return u;
        }),
      });

    this.data.inventorySvc.getProductBatches(pId, true)
      .pipe(finalize(() => this.cartItems.update(arr => {
        const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], loadingFefo: false }; return u;
      })))
      .subscribe({
        next: r => {
          const available = r.data.filter(b => b.status === 'active' && b.quantity_available > 0);
          this.cartItems.update(arr => {
            const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], fefo: available }; return u;
          });
          if (available.length === 0) this._checkCartItemExpired(idx, pId);
        },
        error: () => {},
      });
  }

  private _checkCartItemExpired(idx: number, productId: number): void {
    this.cartItems.update(arr => {
      const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], checkingExpired: true }; return u;
    });
    this.data.inventorySvc.getProductBatches(productId)
      .pipe(finalize(() => this.cartItems.update(arr => {
        const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], checkingExpired: false }; return u;
      })))
      .subscribe({
        next: r => {
          const hasExpiredStock = r.data.some(b => b.quantity_available > 0);
          this.cartItems.update(arr => {
            const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], expiredOnly: hasExpiredStock }; return u;
          });
        },
        error: () => {},
      });
  }

  asGroup(ctrl: AbstractControl): FormGroup { return ctrl as FormGroup; }

  // ── Filas de procedimientos ───────────────────────────────────

  addProcedureRow(): void {
    const row = this.fb.group({
      procedure_id: [null as number | null, Validators.required],
      quantity:     [1,                     [Validators.required, Validators.min(1)]],
      unit_price:   [null as number | null, [Validators.required, Validators.min(0)]],
      notes:        ['', Validators.required],
    });
    const idx = this.procedureRows.length;
    row.get('procedure_id')!.valueChanges.subscribe(procId => {
      if (procId) this._loadProcedurePrice(idx, Number(procId));
    });
    this.procedureRows.push(row);
    this.rowPrices.update(arr => [...arr, null]);
    this.rowPricesLoading.update(arr => [...arr, false]);
  }

  removeProcedureRow(i: number): void {
    if (this.procedureRows.length <= 1) return;
    this.procedureRows.removeAt(i);
    this.rowPrices.update(arr => arr.filter((_, idx) => idx !== i));
    this.rowPricesLoading.update(arr => arr.filter((_, idx) => idx !== i));
  }

  private _loadProcedurePrice(rowIdx: number, procedureId: number): void {
    this.rowPricesLoading.update(arr => { const a = [...arr]; a[rowIdx] = true; return a; });
    this.medSvc.getProcedurePrices(procedureId, { is_active: true })
      .pipe(finalize(() => this.rowPricesLoading.update(arr => { const a = [...arr]; a[rowIdx] = false; return a; })))
      .subscribe({
        next: r => {
          const valid = r.data.find(p => p.is_currently_valid) ?? r.data[0] ?? null;
          this.rowPrices.update(arr => { const a = [...arr]; a[rowIdx] = valid; return a; });
          if (valid) (this.procedureRows.at(rowIdx) as FormGroup)?.get('unit_price')?.setValue(valid.unit_price, { emitEvent: false });
        },
        error: () => this.rowPrices.update(arr => { const a = [...arr]; a[rowIdx] = null; return a; }),
      });
  }

  rowProcedureTotal(i: number): number {
    const row = this.procedureRows.at(i) as FormGroup;
    return (Number(row?.get('quantity')?.value) || 0) * (Number(row?.get('unit_price')?.value) || 0);
  }

  get proceduresGrandTotal(): number {
    return (this.procedureRows.value as any[]).reduce((sum, r) =>
      sum + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
  }

  // ── Servicios médicos ─────────────────────────────────────────

  private _loadServicesTree(): void {
    this.loadingTree.set(true);
    this.medSvc.getTree(true)
      .pipe(finalize(() => this.loadingTree.set(false)))
      .subscribe({ next: r => this.servicesTree.set(r.data), error: () => {} });
  }

  // ── Navegación ────────────────────────────────────────────────

  nextStep(): void {
    if (!this.isStep1Valid) return;
    this.errors.set([]);
    this.step.set(2);
    if (this.isExternalCenter && !this.servicesTree().length) this._loadServicesTree();
  }

  prevStep(): void { this.step.set(1); this.errors.set([]); }

  // ── Guardar ──────────────────────────────────────────────────

  save(): void {
    if (!this.isStep2Valid || this.saving()) return;
    this.errors.set([]);
    this.saving.set(true);

    const wId = this.warehouseControl.value!;
    const cv  = this.centerForm.value;

    const exitCalls = this.cartItems().map(item => {
      const payload: Record<string, unknown> = {
        product_id:     item.product.id,
        warehouse_id:   wId,
        quantity:       item.quantity,
        cost_center_id: cv.cost_center_id,
        reason:         cv.reason || undefined,
      };
      if (this.isExternalCenter) {
        payload['patient_document']    = cv.patient_document;
        payload['patient_external_id'] = cv.patient_external_id;
        const firstProc = (this.procedureRows.at(0) as FormGroup)?.value;
        if (firstProc?.procedure_id) payload['service_id'] = firstProc.procedure_id;
      }
      return this.data.inventorySvc.exit(payload);
    });

    forkJoin(exitCalls).subscribe({
      next: (results) => {
        // POST /movements/exit devuelve data como array (un elemento por lote FEFO afectado)
        // Los kits siguen devolviendo { kit_transaction_id, movements: [] }
        const flatMovements = results.flatMap(r => {
          if (r.data?.kit_transaction_id) return r.data.movements ?? [];
          if (Array.isArray(r.data)) return r.data;
          return [r.data]; // compatibilidad hacia atrás
        });
        const wh = this.data.warehouses.find(w => w.id === wId);
        const cc = this.costCenters().find(c => c.id === cv.cost_center_id);

        const expiry$ = forkJoin(flatMovements.map(m => m.batch_id
          ? this.data.inventorySvc.getBatchById(m.batch_id).pipe(map(b => b.data.expiration_date), catchError(() => of(null)))
          : of(null)));

        expiry$.subscribe(expirations => {
          this.exitSummaryData.set({
            doc_id:           flatMovements[0]?.id,
            date:             flatMovements[0]?.created_at,
            user_name:        flatMovements[0]?.user_name,
            warehouse_name:   wh?.name ?? `Almacén ${wId}`,
            cost_center_name: cc?.name ?? null,
            reason:           cv.reason || null,
            lines: flatMovements.map((m, i) => ({
              product_name:    m.product_name,
              lot_number:      m.batch_lot_number ?? null,
              expiration_date: expirations[i],
              quantity:        m.quantity,
            })),
            withRecords: false,
          });

          const needsSignature = flatMovements.some(m => m.status === 'pending_signature');

          const afterMovements = (withRecords: boolean) => {
            this.exitSummaryData.update(d => d ? { ...d, withRecords } : d);
            this.saving.set(false);

            if (needsSignature) {
              const ref = this.dialog.open(MovementConfirmDialogComponent, {
                width: '560px',
                maxWidth: '96vw',
                disableClose: true,
                data: {
                  movements:     flatMovements.map(m => ({
                    id:               m.id,
                    product_name:     m.product_name,
                    batch_lot_number: m.batch_lot_number ?? null,
                    quantity:         m.quantity,
                    movement_type:    m.movement_type,
                  })),
                  warehouseName: wh?.name ?? `Almacén ${wId}`,
                  inventorySvc:  this.data.inventorySvc,
                },
              });
              ref.afterClosed().subscribe((result: MovementConfirmResult | { cancelled: true } | undefined) => {
                if (result && 'confirmed' in result) {
                  this.exitSignatures.set({ delivered_by: result.delivered_by, received_by: result.received_by });
                  this.step.set(3);
                } else if (result && 'cancelled' in result) {
                  this.ref.close(false);
                }
              });
            } else {
              this.step.set(3);
            }
          };

          if (this.isExternalCenter && this.procedureRows.length > 0) {
            const serviceDate = this._toApiDate(cv.service_date!);
            const recordCalls = this.procedureRows.controls.map(ctrl => {
              const rv = (ctrl as FormGroup).value;
              return this.medSvc.createPatientProcedureRecord({
                medical_service_id:  rv.procedure_id,
                patient_external_id: cv.patient_external_id!,
                patient_document:    cv.patient_document!,
                patient_first_name:  cv.patient_first_name!,
                patient_last_name:   cv.patient_last_name!,
                quantity:            rv.quantity,
                unit_price:          rv.unit_price,
                service_date:        serviceDate,
                notes:               rv.notes || undefined,
              });
            });
            forkJoin(recordCalls).subscribe({
              next:  () => afterMovements(true),
              error: err => {
                this.saving.set(false);
                this.errors.set([
                  'Las salidas de inventario se registraron correctamente, pero ocurrió un error al guardar los registros de procedimientos del paciente: ' +
                  (err.error?.message || 'Error desconocido'),
                ]);
                this.step.set(3);
              },
            });
          } else {
            afterMovements(false);
          }
        });
      },
      error: err => {
        this.saving.set(false);
        if (err.status === 422)
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        else if (err.status === 409 && err.error?.error_code === 'EXPIRED_STOCK')
          this.errors.set([err.error?.message || 'El producto solo tiene stock vencido en este almacén. Gestione el lote vencido mediante una devolución, un ajuste o una baja por vencimiento antes de continuar.']);
        else if (err.status === 409)
          this.errors.set([err.error?.message || 'Error de stock o negocio']);
        else
          this.errors.set([err.error?.message || 'Error al registrar la salida']);
      },
    });
  }

  printComprobante(): void {
    const d   = this.exitSummaryData();
    const sig = this.exitSignatures();
    if (!d) return;
    this.pdfSvc.generateAndPrint({
      movement_type:    'exit',
      doc_id:           d.doc_id,
      date:             d.date,
      user_name:        d.user_name,
      warehouse_name:   d.warehouse_name,
      cost_center_name: d.cost_center_name,
      reason:           d.reason,
      lines:            d.lines,
      delivered_by:     sig?.delivered_by ?? null,
      received_by:      sig?.received_by  ?? null,
    });
  }

  closeDialog(): void {
    const d = this.exitSummaryData();
    this.ref.close(d ? { ok: true, withRecords: d.withRecords } : false);
  }

  private _toApiDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

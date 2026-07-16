import { Component, inject, signal, computed, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder, ReactiveFormsModule, Validators,
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
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { forkJoin, finalize, switchMap, of } from 'rxjs';
import { InventoryService, StockSummary, BatchDetail, CostCenter, MovementDocument } from '../inventory.service';
import { MovementConfirmDialogComponent, MovementConfirmResult } from './movement-confirm-dialog.component';
import { MovementPdfSignature } from '../../../shared/services/movement-pdf.service';
import { WarehouseService, Warehouse } from '../../warehouse/warehouse.service';
import { Product } from '../../catalog/catalog.service';
import { MedicalServicesService } from '../medical-services.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { ProductSearchComponent } from '../../../shared/components/product-search/product-search.component';
import { PatientSaleFormComponent } from '../../../shared/components/patient-sale-form/patient-sale-form.component';
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
  doc_number:       string;
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
    FormErrorsComponent, ProductSearchComponent, PatientSaleFormComponent,
  ],
  templateUrl: './exit-wizard-dialog.component.html',
  styleUrl:    './exit-wizard-dialog.component.scss',
})
export class ExitWizardDialogComponent implements OnInit {
  @ViewChild('scanner')        scannerRef?: ProductSearchComponent;
  @ViewChild('patientFormRef') patientFormRef?: PatientSaleFormComponent;

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

  // ── Step 2: Centro de costos ──────────────────────────────────
  centerForm = this.fb.group({
    cost_center_id: [null as number | null, Validators.required],
    reason:         [''],
  });

  costCenters        = signal<CostCenter[]>([]);
  loadingCostCenters = signal(false);

  // ── Computed / helpers ────────────────────────────────────────
  get selectedCostCenter(): CostCenter | null {
    const id = this.centerForm.get('cost_center_id')?.value;
    return this.costCenters().find(c => c.id === id) ?? null;
  }

  get isExternalCenter(): boolean {
    return this.selectedCostCenter?.is_external === true;
  }

  dispatchPreview = computed((): DispatchLine[] => {
    const lines: DispatchLine[] = [];
    for (const item of this.cartItems()) {
      if (item.isKit) {
        lines.push({ product_name: item.product.name, product_code: item.product.barcode, lot_number: null, expiration_date: null, quantity: item.quantity, is_kit: true });
        continue;
      }
      let remaining = item.quantity;
      for (const lote of item.fefo) {
        if (remaining <= 0) break;
        const fromLot = Math.min(remaining, lote.quantity_available);
        lines.push({ product_name: item.product.name, product_code: item.product.barcode, lot_number: lote.lot_number, expiration_date: lote.expiration_date, quantity: fromLot, is_kit: false });
        remaining -= fromLot;
      }
      if (remaining > 0) {
        lines.push({ product_name: item.product.name, product_code: item.product.barcode, lot_number: null, expiration_date: null, quantity: remaining, is_kit: false });
      }
    }
    return lines;
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
      return this.patientFormRef?.isValid ?? false;
    }
    return true;
  }

  ngOnInit(): void {
    this.warehouseControl.valueChanges.subscribe(wId => {
      if (wId) {
        this.cartItems().forEach((_, i) => this._loadCartItemStock(i));
      } else {
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
  }

  // ── Gestión del carrito ───────────────────────────────────────

  onScanProduct(product: Product | null): void {
    if (!product || !this.warehouseControl.value) return;
    this.scanError.set(null);

    const existing = this.cartItems().findIndex(item => item.product.id === product.id);

    if (existing >= 0) {
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

    this.data.inventorySvc.getProductBatches(pId, true, Number(this.warehouseControl.value))
      .pipe(finalize(() => this.scannerChecking.set(false)))
      .subscribe({
        next: r => {
          const available = r.data.filter(b => b.status === 'active' && b.quantity_available > 0);
          if (available.length === 0) {
            this.scanError.set(`Sin stock disponible para "${product.name}" en ${this.selectedWarehouseName}`);
            this.scannerRef?.clear();
            return;
          }
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

  private _loadCartItemSummaryOnly(idx: number): void {
    this.cartItems.update(arr => {
      const u = [...arr]; if (u[idx]) u[idx] = { ...u[idx], loadingStock: false }; return u;
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
    if (item.isKit && item.kitAvailable === null) return 'none';
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
        loadingStock: isKit, loadingFefo: !isKit,
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

    this.data.inventorySvc.getProductBatches(pId, true, Number(wId))
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

  // ── Navegación ────────────────────────────────────────────────

  nextStep(): void {
    if (!this.isStep1Valid) return;
    this.errors.set([]);
    this.step.set(2);
  }

  prevStep(): void { this.step.set(1); this.errors.set([]); }

  // ── Guardar ──────────────────────────────────────────────────

  save(): void {
    if (!this.isStep2Valid || this.saving()) return;
    this.errors.set([]);
    this.saving.set(true);

    const wId = this.warehouseControl.value!;
    const cv  = this.centerForm.value;

    const payload: Record<string, unknown> = {
      warehouse_id:   wId,
      cost_center_id: cv.cost_center_id,
      reason:         cv.reason || undefined,
      items: this.cartItems().map(item => ({
        generic_product_id: item.product.id,
        quantity:           item.quantity,
      })),
    };

    if (this.isExternalCenter && this.patientFormRef) {
      const pd = this.patientFormRef.getValue();
      payload['patient_document']    = pd.patient_document;
      payload['patient_external_id'] = pd.patient_external_id;
      payload['seller']              = pd.seller;
      payload['referrer']            = pd.referrer;
      if (pd.procedures[0]?.procedure_id) payload['service_id'] = pd.procedures[0].procedure_id;
    }

    this.data.inventorySvc.exit(payload).subscribe({
      next: (res) => {
        const document: MovementDocument = res.data;
        const flatMovements = document.movements ?? [];
        const wh = this.data.warehouses.find(w => w.id === wId);
        const cc = this.costCenters().find(c => c.id === cv.cost_center_id);
        const previewLines = this.dispatchPreview();

        const summaryLines: ExitSummaryLine[] = flatMovements.length > 0
          ? flatMovements.map(m => ({
              product_name:    m.product_name ?? m.product?.name ?? '—',
              lot_number:      m.batch_lot_number,
              expiration_date: m.batch_expiration_date,
              quantity:        Math.abs(m.quantity),
            }))
          : previewLines.map(line => ({
              product_name:    line.product_name,
              lot_number:      line.lot_number,
              expiration_date: line.expiration_date,
              quantity:        line.quantity,
            }));

        this.exitSummaryData.set({
          doc_id:           document.id,
          doc_number:       document.document_number,
          date:             document.created_at,
          user_name:        document.user_name,
          warehouse_name:   wh?.name ?? `Almacén ${wId}`,
          cost_center_name: cc?.name ?? null,
          reason:           cv.reason || null,
          lines:            summaryLines,
          withRecords: false,
        });

        const needsSignature = document.status === 'pending_signature';

        const afterMovements = (withRecords: boolean) => {
          this.exitSummaryData.update(d => d ? { ...d, withRecords } : d);
          this.saving.set(false);

          if (needsSignature) {
            const ref = this.dialog.open(MovementConfirmDialogComponent, {
              width: '560px', maxWidth: '96vw', disableClose: true,
              data: {
                document_id: document.id,
                movements: flatMovements.map((m, i) => ({
                  id:               m.id,
                  product_name:     previewLines[i]?.product_name ?? m.product_name ?? null,
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

        if (this.isExternalCenter && this.patientFormRef) {
          const pd          = this.patientFormRef.getValue();
          const serviceDate = this._toApiDate(pd.service_date);
          const recordCalls = pd.procedures.map(rv =>
            this.medSvc.createPatientProcedureRecord({
              medical_service_id:  rv.procedure_id,
              patient_external_id: pd.patient_external_id,
              patient_document:    pd.patient_document,
              patient_first_name:  pd.patient_first_name,
              patient_last_name:   pd.patient_last_name,
              quantity:            rv.quantity,
              unit_price:          rv.unit_price,
              service_date:        serviceDate,
              notes:               rv.notes || undefined,
              seller:              pd.seller || undefined,
              referrer:            pd.referrer || undefined,
            }).pipe(
              switchMap(res => rv.notes
                ? this.medSvc.createEvolution(res.data.id, { content: rv.notes })
                : of(null)
              )
            )
          );
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
      },
      error: err => {
        this.saving.set(false);
        if (err.status === 422)
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        else if (err.status === 409 && err.error?.error_code === 'EXPIRED_STOCK')
          this.errors.set([err.error?.message || 'El producto solo tiene stock vencido en este almacén.']);
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
      doc_number:       d.doc_number,
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

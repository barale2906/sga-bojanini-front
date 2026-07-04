import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { forkJoin, finalize, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { InventoryService, StockSummary, BatchDetail } from '../inventory.service';
import { MovementPdfService } from '../../../shared/services/movement-pdf.service';
import { MovementConfirmDialogComponent, MovementConfirmResult } from './movement-confirm-dialog.component';
import { MovementPdfSignature } from '../../../shared/services/movement-pdf.service';
import { WarehouseService, Warehouse, Location } from '../../warehouse/warehouse.service';
import { Product } from '../../catalog/catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { ProductSearchComponent } from '../../../shared/components/product-search/product-search.component';

export interface WarehouseTransferDialogData {
  warehouses: Warehouse[];
  products: Product[];
  inventorySvc: InventoryService;
}

@Component({
  selector: 'app-warehouse-transfer-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatDividerModule, FormErrorsComponent, ProductSearchComponent,
  ],
  templateUrl: './warehouse-transfer-dialog.component.html',
  styleUrl: './warehouse-transfer-dialog.component.scss',
})
export class WarehouseTransferDialogComponent implements OnInit {
  data: WarehouseTransferDialogData = inject(MAT_DIALOG_DATA);
  private ref    = inject(MatDialogRef<WarehouseTransferDialogComponent>);
  private fb     = inject(FormBuilder);
  private wSvc   = inject(WarehouseService);
  private pdfSvc = inject(MovementPdfService);
  private dialog = inject(MatDialog);

  saving = signal(false);
  errors = signal<string[]>([]);

  locationsFrom  = signal<Location[]>([]);
  locationsTo    = signal<Location[]>([]);
  loadingLocFrom = signal(false);
  loadingLocTo   = signal(false);

  stockSummary  = signal<StockSummary | null>(null);
  loadingStock  = signal(false);

  _selectedProductFull = signal<Product | null>(null);

  onProductSelected(product: Product | null): void {
    this._selectedProductFull.set(product);
    this.form.patchValue({ product_id: product?.id ?? null });
  }

  /** Lotes vigentes (no vencidos) disponibles para transferir */
  exitableLotes    = signal<BatchDetail[]>([]);
  loadingExitable  = signal(false);
  checkingExpired  = signal(false);
  /** true si el producto no tiene stock vigente pero sí stock vencido en el almacén de origen */
  expiredOnly   = signal(false);

  form = this.fb.group({
    warehouse_from_id: [null as number | null, Validators.required],
    location_from_id:  [null as number | null, Validators.required],
    product_id:        [null as number | null, Validators.required],
    warehouse_to_id:   [null as number | null, Validators.required],
    location_to_id:    [null as number | null, Validators.required],
    quantity:          [null as number | null, [Validators.required, Validators.min(1)]],
    reason:            [''],
  });

  ngOnInit(): void {
    const locFrom = this.form.get('location_from_id')!;
    const locTo   = this.form.get('location_to_id')!;
    locFrom.disable();
    locTo.disable();

    this.form.get('warehouse_from_id')!.valueChanges.subscribe(wId => {
      locFrom.setValue(null, { emitEvent: false });
      locFrom.disable();
      this.locationsFrom.set([]);
      this.stockSummary.set(null);
      if (wId) this._loadLocations(Number(wId), 'from');
    });

    this.form.get('warehouse_to_id')!.valueChanges.subscribe(wId => {
      locTo.setValue(null, { emitEvent: false });
      locTo.disable();
      this.locationsTo.set([]);
      if (wId) this._loadLocations(Number(wId), 'to');
    });

    this.form.get('product_id')!.valueChanges.subscribe(() => this._loadStock());
    this.form.get('warehouse_from_id')!.valueChanges.subscribe(() => this._loadStock());
  }

  private _loadLocations(warehouseId: number, side: 'from' | 'to'): void {
    if (side === 'from') this.loadingLocFrom.set(true);
    else this.loadingLocTo.set(true);

    this.wSvc.getWarehouseLocations(warehouseId)
      .pipe(finalize(() => {
        if (side === 'from') this.loadingLocFrom.set(false);
        else this.loadingLocTo.set(false);
      }))
      .subscribe({
        next: r => {
          if (side === 'from') {
            this.locationsFrom.set(r.data);
            this.form.get('location_from_id')!.enable();
          } else {
            this.locationsTo.set(r.data);
            this.form.get('location_to_id')!.enable();
          }
        },
        error: () => {},
      });
  }

  private _loadStock(): void {
    const wId = this.form.get('warehouse_from_id')?.value;
    const pId = this.form.get('product_id')?.value;
    this.expiredOnly.set(false);
    this.exitableLotes.set([]);
    if (!wId || !pId) { this.stockSummary.set(null); return; }

    this.loadingStock.set(true);
    this.stockSummary.set(null);

    this.data.inventorySvc.getStockSummary(Number(wId), Number(pId))
      .pipe(finalize(() => this.loadingStock.set(false)))
      .subscribe({
        next: r => this.stockSummary.set(r.data),
        error: () => this.stockSummary.set(null),
      });

    this.loadingExitable.set(true);
    this.data.inventorySvc.getProductBatches(Number(pId), true)
      .pipe(finalize(() => this.loadingExitable.set(false)))
      .subscribe({
        next: r => {
          const available = r.data.filter(b => b.status === 'active' && b.quantity_available > 0);
          this.exitableLotes.set(available);
          // Si no hay lotes vigentes, verificar si el producto tiene stock vencido en este almacén
          if (available.length === 0) this._checkExpiredOnly(Number(pId));
        },
        error: () => this.exitableLotes.set([]),
      });
  }

  /** Verifica si un producto sin stock vigente tiene, en cambio, stock vencido en el almacén. */
  private _checkExpiredOnly(productId: number): void {
    this.checkingExpired.set(true);
    this.data.inventorySvc.getProductBatches(productId)
      .pipe(finalize(() => this.checkingExpired.set(false)))
      .subscribe({
        next: r => this.expiredOnly.set(r.data.some(b => b.quantity_available > 0)),
        error: () => {},
      });
  }

  /** Cantidad realmente disponible para transferir (lotes vigentes, no vencidos). */
  get exitableQty(): number {
    return this.exitableLotes().reduce((sum, b) => sum + b.quantity_available, 0);
  }

  get stockStatusClass(): 'ok' | 'warn' | 'danger' | 'none' {
    const s = this.stockSummary();
    if (!s) return 'none';
    const exitable = this.exitableQty;
    if (exitable === 0) return 'danger';
    const qty = Number(this.form.get('quantity')?.value) || 0;
    if (qty > 0 && qty > exitable) return 'danger';
    return 'ok';
  }

  get hasNoStock(): boolean {
    if (this.stockSummary() === null) return false;
    if (this.loadingExitable() || this.checkingExpired()) return false;
    return this.exitableQty === 0;
  }

  get isReady(): boolean {
    const v = this.form.getRawValue();
    if (!v.warehouse_from_id || !v.location_from_id) return false;
    if (!v.product_id) return false;
    if (!v.warehouse_to_id || !v.location_to_id) return false;
    if (!v.quantity || v.quantity < 1) return false;
    if (this.loadingStock() || this.loadingExitable() || this.checkingExpired()) return false;
    if (this.hasNoStock) return false;
    if (Number(v.quantity) > this.exitableQty) return false;
    return true;
  }

  save(): void {
    if (!this.isReady || this.saving()) return;
    this.errors.set([]);
    this.saving.set(true);

    const v = this.form.getRawValue();
    const payload = {
      product_id:        v.product_id,
      warehouse_from_id: v.warehouse_from_id,
      warehouse_to_id:   v.warehouse_to_id,
      location_from_id:  v.location_from_id,
      location_to_id:    v.location_to_id,
      quantity:          v.quantity,
      reason:            v.reason || undefined,
    };

    this.data.inventorySvc.transfer(payload).subscribe({
      next: res => {
        // POST /movements/transfer devuelve data como array (un elemento por lote FEFO)
        const movements = Array.isArray(res.data) ? res.data : [res.data];
        const firstMov  = movements[0];
        const wFrom = this.data.warehouses.find(w => w.id === v.warehouse_from_id);
        const wTo   = this.data.warehouses.find(w => w.id === v.warehouse_to_id);

        const printAndClose = (
          expirations: (string | null)[],
          deliveredBy: MovementPdfSignature | null,
          receivedBy:  MovementPdfSignature | null,
        ) => {
          this.pdfSvc.generateAndPrint({
            movement_type:     'transfer',
            doc_id:            firstMov.id,
            date:              firstMov.created_at,
            user_name:         firstMov.user_name,
            warehouse_name:    wFrom?.name ?? `Almacén ${v.warehouse_from_id}`,
            warehouse_to_name: wTo?.name   ?? `Almacén ${v.warehouse_to_id}`,
            reason:            v.reason || null,
            lines: movements.map((m, i) => ({
              product_name:    m.product_name,
              lot_number:      m.batch_lot_number,
              expiration_date: expirations[i],
              quantity:        m.quantity,
            })),
            delivered_by: deliveredBy,
            received_by:  receivedBy,
          });
          this.ref.close(true);
        };

        const fetchExpirationsAndFinish = (
          deliveredBy: MovementPdfSignature | null,
          receivedBy:  MovementPdfSignature | null,
        ) => {
          forkJoin(movements.map(m =>
            m.batch_id
              ? this.data.inventorySvc.getBatchById(m.batch_id).pipe(map(b => b.data.expiration_date), catchError(() => of(null)))
              : of(null)
          )).subscribe(expirations => {
            this.saving.set(false);
            printAndClose(expirations, deliveredBy, receivedBy);
          });
        };

        const needsSignature = movements.some(m => m.status === 'pending_signature');

        if (!needsSignature) {
          fetchExpirationsAndFinish(null, null);
          return;
        }

        this.saving.set(false);
        const dialogRef = this.dialog.open(MovementConfirmDialogComponent, {
          width: '560px',
          maxWidth: '96vw',
          disableClose: true,
          data: {
            movements:     movements.map(m => ({
              id:               m.id,
              product_name:     m.product_name,
              batch_lot_number: m.batch_lot_number ?? null,
              quantity:         m.quantity,
              movement_type:    m.movement_type ?? 'transfer',
            })),
            warehouseName: wFrom?.name ?? `Almacén ${v.warehouse_from_id}`,
            inventorySvc:  this.data.inventorySvc,
          },
        });

        dialogRef.afterClosed().subscribe((result: MovementConfirmResult | { cancelled: true } | undefined) => {
          if (result && 'confirmed' in result) {
            fetchExpirationsAndFinish(result.delivered_by, result.received_by);
          } else {
            this.ref.close(false);
          }
        });
      },
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        } else if (err.status === 409 && err.error?.error_code === 'EXPIRED_STOCK') {
          this.errors.set([err.error?.message || 'El producto solo tiene stock vencido en este almacén. Gestione el lote vencido mediante una devolución, un ajuste o una baja por vencimiento antes de continuar.']);
        } else if (err.status === 409) {
          this.errors.set([err.error?.message || 'Stock insuficiente para realizar la transferencia.']);
        } else {
          this.errors.set([err.error?.message || 'Ocurrió un error inesperado. Intenta nuevamente.']);
        }
      },
    });
  }

  formatQty(v: number | undefined): string {
    return v !== undefined ? v.toLocaleString('es-CO') : '—';
  }
}

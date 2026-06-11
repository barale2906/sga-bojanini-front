import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { finalize, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { InventoryService, StockSummary } from '../inventory.service';
import { MovementPdfService } from '../../../shared/services/movement-pdf.service';
import { WarehouseService, Warehouse, Location } from '../../warehouse/warehouse.service';
import { Product } from '../../catalog/catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

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
    MatProgressSpinnerModule, MatDividerModule, FormErrorsComponent,
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

  saving = signal(false);
  errors = signal<string[]>([]);

  locationsFrom  = signal<Location[]>([]);
  locationsTo    = signal<Location[]>([]);
  loadingLocFrom = signal(false);
  loadingLocTo   = signal(false);

  stockSummary  = signal<StockSummary | null>(null);
  loadingStock  = signal(false);

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
    if (!wId || !pId) { this.stockSummary.set(null); return; }

    this.loadingStock.set(true);
    this.stockSummary.set(null);

    this.data.inventorySvc.getStockSummary(Number(wId), Number(pId))
      .pipe(finalize(() => this.loadingStock.set(false)))
      .subscribe({
        next: r => this.stockSummary.set(r.data),
        error: () => this.stockSummary.set(null),
      });
  }

  get stockStatusClass(): 'ok' | 'warn' | 'danger' | 'none' {
    const s = this.stockSummary();
    if (!s) return 'none';
    if (s.available_quantity === 0) return 'danger';
    const qty = Number(this.form.get('quantity')?.value) || 0;
    if (qty > 0 && qty > s.available_quantity) return 'danger';
    return 'ok';
  }

  get hasNoStock(): boolean {
    const s = this.stockSummary();
    return s !== null && s.available_quantity === 0;
  }

  get isReady(): boolean {
    const v = this.form.getRawValue();
    if (!v.warehouse_from_id || !v.location_from_id) return false;
    if (!v.product_id) return false;
    if (!v.warehouse_to_id || !v.location_to_id) return false;
    if (!v.quantity || v.quantity < 1) return false;
    if (this.hasNoStock) return false;
    const s = this.stockSummary();
    if (s && Number(v.quantity) > s.available_quantity) return false;
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
        const wFrom = this.data.warehouses.find(w => w.id === v.warehouse_from_id);
        const wTo   = this.data.warehouses.find(w => w.id === v.warehouse_to_id);
        const expiry$ = res.data.batch_id
          ? this.data.inventorySvc.getBatchById(res.data.batch_id).pipe(map(b => b.data.expiration_date), catchError(() => of(null)))
          : of(null);
        expiry$.subscribe(expiration_date => {
          this.pdfSvc.generateAndPrint({
            movement_type:     'transfer',
            doc_id:            res.data.id,
            date:              res.data.created_at,
            user_name:         res.data.user_name,
            warehouse_name:    wFrom?.name ?? `Almacén ${v.warehouse_from_id}`,
            warehouse_to_name: wTo?.name   ?? `Almacén ${v.warehouse_to_id}`,
            reason:            v.reason || null,
            lines: [{ product_name: res.data.product_name, lot_number: res.data.batch_lot_number, expiration_date, quantity: res.data.quantity }],
          });
          this.ref.close(true);
        });
      },
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
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

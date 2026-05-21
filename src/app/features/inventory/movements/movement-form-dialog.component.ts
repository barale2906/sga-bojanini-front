import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { InventoryService } from '../inventory.service';
import { WarehouseService, Warehouse, Location } from '../../warehouse/warehouse.service';
import { CatalogService, Product, ProductPresentation } from '../../catalog/catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

const TYPE_LABELS: Record<string, string> = {
  entry: 'Entrada de Mercancía', exit: 'Salida de Stock', transfer: 'Transferencia',
  adjustment: 'Ajuste de Inventario', return: 'Devolución a Proveedor',
};

@Component({
  selector: 'app-movement-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, FormErrorsComponent],
  templateUrl: './movement-form-dialog.component.html',
  styleUrl: './movement-form-dialog.component.scss',
})
export class MovementFormDialogComponent implements OnInit {
  data: { type: string; warehouses: Warehouse[]; products: Product[]; inventorySvc: InventoryService } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MovementFormDialogComponent>);
  private fb = inject(FormBuilder);
  private wSvc = inject(WarehouseService);
  private cSvc = inject(CatalogService);

  saving = signal(false);
  errors = signal<string[]>([]);
  locations = signal<Location[]>([]);
  presentations = signal<ProductPresentation[]>([]);
  usePresentationMode = signal(false);

  get typeLabel() { return TYPE_LABELS[this.data.type] || this.data.type; }
  get isEntry() { return this.data.type === 'entry'; }
  get isExit() { return this.data.type === 'exit'; }
  get isTransfer() { return this.data.type === 'transfer'; }
  get isAdjustment() { return this.data.type === 'adjustment'; }
  get isReturn() { return this.data.type === 'return'; }

  form = this.fb.group({
    product_id: [null as number | null, Validators.required],
    warehouse_id: [null as number | null, Validators.required],
    location_id: [null as number | null],
    location_from_id: [null as number | null],
    location_to_id: [null as number | null],
    quantity: [null as number | null, [Validators.required, Validators.min(1)]],
    quantity_base: [null as number | null],
    product_presentation_id: [null as number | null],
    quantity_in_presentation: [null as number | null],
    lot_number: [''],
    expiration_date: [''],
    manufacturing_date: [''],
    reason: [''],
    notes: [''],
  });

  ngOnInit(): void {
    this.form.get('warehouse_id')!.valueChanges.subscribe(wId => {
      if (wId) this.wSvc.getWarehouseLocations(Number(wId)).subscribe({ next: r => this.locations.set(r.data), error: () => {} });
    });
    this.form.get('product_id')!.valueChanges.subscribe(pId => {
      if (pId) this.cSvc.getPresentations(Number(pId)).subscribe({ next: r => this.presentations.set(r.data), error: () => {} });
    });
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const v = this.form.value;

    let payload: Record<string, unknown> = { product_id: v.product_id, warehouse_id: v.warehouse_id, reason: v.reason || undefined };

    if (this.isEntry) {
      Object.assign(payload, {
        location_id: v.location_id || undefined,
        lot_number: v.lot_number || undefined,
        expiration_date: v.expiration_date || undefined,
        manufacturing_date: v.manufacturing_date || undefined,
        notes: v.notes || undefined,
      });
      if (this.usePresentationMode() && v.product_presentation_id) {
        payload['product_presentation_id'] = v.product_presentation_id;
        payload['quantity_in_presentation'] = v.quantity_in_presentation;
      } else {
        payload['quantity_base'] = v.quantity_base || v.quantity;
      }
    } else if (this.isTransfer) {
      payload = { ...payload, location_from_id: v.location_from_id, location_to_id: v.location_to_id, quantity: v.quantity };
    } else if (this.isAdjustment) {
      payload = { ...payload, location_id: v.location_id || undefined, quantity: v.quantity, reason: v.reason };
    } else {
      payload = { ...payload, location_id: v.location_id || undefined, quantity: v.quantity };
    }

    const svc = this.data.inventorySvc;
    const req$ = this.isEntry ? svc.entry(payload) : this.isExit ? svc.exit(payload) : this.isTransfer ? svc.transfer(payload) : this.isAdjustment ? svc.adjustment(payload) : svc.return_(payload);

    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        else if (err.status === 409) this.errors.set([err.error?.message || 'Error de negocio']);
      },
    });
  }
}

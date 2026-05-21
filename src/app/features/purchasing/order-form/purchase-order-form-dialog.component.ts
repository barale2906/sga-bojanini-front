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
import { PurchasingService } from '../purchasing.service';
import { CatalogService, ProductPresentation } from '../../catalog/catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-purchase-order-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatTableModule, MatProgressSpinnerModule, FormErrorsComponent],
  templateUrl: './purchase-order-form-dialog.component.html',
  styleUrl: './purchase-order-form-dialog.component.scss',
})
export class PurchaseOrderFormDialogComponent implements OnInit {
  data: any = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<PurchaseOrderFormDialogComponent>);
  private fb = inject(FormBuilder);
  saving = signal(false); errors = signal<string[]>([]);
  presentationsMap = signal<Record<number, ProductPresentation[]>>({});

  form = this.fb.group({
    supplier_id: [null as number | null, Validators.required],
    warehouse_id: [null as number | null, Validators.required],
    notes: [''], expected_delivery_date: [''],
    items: this.fb.array([]),
  });

  get items() { return this.form.get('items') as FormArray; }

  ngOnInit(): void {
    this.addItem();
  }

  addItem(): void {
    this.items.push(this.fb.group({
      product_id: [null as number | null, Validators.required],
      product_presentation_id: [null as number | null, Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit_price: [0, [Validators.required, Validators.min(0)]],
      notes: [''],
    }));
  }

  removeItem(i: number): void { if (this.items.length > 1) this.items.removeAt(i); }

  onProductChange(i: number, productId: number): void {
    if (!productId) return;
    this.data.catalogSvc.getPresentations(productId).subscribe({
      next: (r: any) => this.presentationsMap.update(m => ({ ...m, [i]: r.data })),
      error: () => {},
    });
  }

  getItemPresentations(i: number): ProductPresentation[] {
    return this.presentationsMap()[i] || [];
  }

  calcTotal(): number {
    return this.items.controls.reduce((sum, c) => {
      const qty = c.get('quantity')?.value || 0;
      const price = c.get('unit_price')?.value || 0;
      return sum + qty * price;
    }, 0);
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
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

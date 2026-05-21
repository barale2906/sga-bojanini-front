import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CatalogService, Product, ProductPresentation, KitComponent, UnitOfMeasure } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-product-detail-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatTabsModule, MatTableModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule, FormErrorsComponent],
  templateUrl: './product-detail-dialog.component.html',
  styleUrl: './product-detail-dialog.component.scss',
})
export class ProductDetailDialogComponent implements OnInit {
  data: { product: Product; units: UnitOfMeasure[]; products: Product[] } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ProductDetailDialogComponent>);
  private svc = inject(CatalogService); private fb = inject(FormBuilder);
  private snack = inject(MatSnackBar);

  presentations = signal<ProductPresentation[]>([]);
  kitComponents = signal<KitComponent[]>([]);
  loading = signal(false);
  savingPresentation = signal(false);
  savingKit = signal(false);
  errors = signal<string[]>([]);

  presForm = this.fb.group({
    code: ['', Validators.required], name: ['', Validators.required],
    factor_to_base: [1, [Validators.required, Validators.min(1)]],
    quantity_per_parent: [null as number | null],
    parent_id: [null as number | null],
    barcode: [''], is_base_unit: [false],
  });

  kitRows = signal<{ component_product_id: number | null; quantity_per_kit: number }[]>([{ component_product_id: null, quantity_per_kit: 1 }]);

  get product() { return this.data.product; }
  get isKit() { return this.product.product_type === 'kit'; }
  get simpleProducts() { return this.data.products.filter(p => p.product_type === 'simple' && p.id !== this.product.id); }

  presCols = ['code', 'name', 'factor_to_base', 'is_base_unit', 'actions'];
  kitCols = ['component', 'quantity', 'actions'];

  ngOnInit(): void { this.loadPresentations(); if (this.isKit) this.loadKitComponents(); }

  loadPresentations(): void {
    this.loading.set(true);
    this.svc.getPresentations(this.product.id).subscribe({ next: r => { this.presentations.set(r.data); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  loadKitComponents(): void {
    this.svc.getKitComponents(this.product.id).subscribe({
      next: r => {
        this.kitComponents.set(r.data);
        if (r.data.length) this.kitRows.set(r.data.map(k => ({ component_product_id: k.component_product_id, quantity_per_kit: k.quantity_per_kit })));
      }, error: () => {},
    });
  }

  addPresentation(): void {
    if (this.presForm.invalid || this.savingPresentation()) return;
    this.savingPresentation.set(true);
    this.svc.createPresentation(this.product.id, this.presForm.value as any).subscribe({
      next: () => { this.snack.open('Presentación creada', 'OK', { duration: 3000 }); this.presForm.reset({ factor_to_base: 1, is_base_unit: false }); this.loadPresentations(); this.savingPresentation.set(false); },
      error: err => { this.savingPresentation.set(false); if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]); },
    });
  }

  deletePresentation(p: ProductPresentation): void {
    this.svc.deletePresentation(p.id).subscribe({ next: () => { this.snack.open('Presentación eliminada', 'OK', { duration: 3000 }); this.loadPresentations(); }, error: () => {} });
  }

  addKitRow(): void { this.kitRows.update(r => [...r, { component_product_id: null, quantity_per_kit: 1 }]); }
  removeKitRow(i: number): void { this.kitRows.update(r => r.filter((_, idx) => idx !== i)); }
  updateKitRow(i: number, field: string, value: unknown): void { this.kitRows.update(r => { const copy = [...r]; (copy[i] as any)[field] = value; return copy; }); }

  saveKit(): void {
    const components = this.kitRows().filter(r => r.component_product_id);
    if (!components.length || this.savingKit()) return;
    this.savingKit.set(true);
    this.svc.syncKitComponents(this.product.id, components as any).subscribe({
      next: () => { this.snack.open('Componentes del kit actualizados', 'OK', { duration: 3000 }); this.savingKit.set(false); this.loadKitComponents(); },
      error: () => this.savingKit.set(false),
    });
  }

  getProductName(id: number | null): string {
    if (!id) return '—';
    return this.data.products.find(p => p.id === id)?.name || '—';
  }
}

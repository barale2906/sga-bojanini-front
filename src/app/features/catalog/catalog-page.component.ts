import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterModule } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { CatalogService, Category, UnitOfMeasure, Product, Supplier } from './catalog.service';
import { PaginationMeta } from '../../core/models/api-response.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { CategoryFormDialogComponent } from './categories/category-form-dialog.component';
import { UomFormDialogComponent } from './units/uom-form-dialog.component';
import { ProductFormDialogComponent } from './products/product-form-dialog.component';
import { ProductDetailDialogComponent } from './products/product-detail-dialog.component';
import { SupplierFormDialogComponent } from './suppliers/supplier-form-dialog.component';
import { ImportDialogComponent } from './import/import-dialog.component';

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule, MatTabsModule, MatTableModule,
    MatPaginatorModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatChipsModule, MatTooltipModule, PageHeaderComponent,
    LoadingSpinnerComponent, PermissionDirective,
  ],
  templateUrl: './catalog-page.component.html',
  styleUrl: './catalog-page.component.scss',
})
export class CatalogPageComponent implements OnInit {
  private svc = inject(CatalogService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  // Categories
  categories = signal<Category[]>([]);
  catCols = ['code', 'name', 'parent', 'actions'];

  // UoM
  units = signal<UnitOfMeasure[]>([]);
  uomCols = ['name', 'abbreviation', 'actions'];

  // Products
  products = signal<Product[]>([]);
  productMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  productCols = ['code', 'name', 'type', 'category', 'uom', 'stock_levels', 'is_active', 'actions'];
  productFilters = this.fb.group({ search: [''], category_id: [''], product_type: [''], is_active: [''] });

  // Suppliers
  suppliers = signal<Supplier[]>([]);
  supplierMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  supplierCols = ['name', 'tax_id', 'contact_name', 'contact_phone', 'is_active', 'actions'];
  supplierFilters = this.fb.group({ search: [''], is_active: [''] });

  loading = signal(false);

  ngOnInit(): void {
    this.loadAll();
    this.productFilters.get('search')!.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.loadProducts(1));
    this.productFilters.get('category_id')!.valueChanges.subscribe(() => this.loadProducts(1));
    this.productFilters.get('product_type')!.valueChanges.subscribe(() => this.loadProducts(1));
    this.productFilters.get('is_active')!.valueChanges.subscribe(() => this.loadProducts(1));
    this.supplierFilters.get('search')!.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.loadSuppliers(1));
    this.supplierFilters.get('is_active')!.valueChanges.subscribe(() => this.loadSuppliers(1));
  }

  loadAll(): void {
    this.loadCategories(); this.loadUnits(); this.loadProducts(); this.loadSuppliers();
  }

  loadCategories(): void {
    this.svc.getCategories().subscribe({ next: r => this.categories.set(r.data), error: () => {} });
  }

  loadUnits(): void {
    this.svc.getUnits().subscribe({ next: r => this.units.set(r.data), error: () => {} });
  }

  loadProducts(page = 1): void {
    this.loading.set(true);
    const { search, category_id, product_type, is_active } = this.productFilters.value;
    this.svc.getProducts({
      search: search || undefined, category_id: category_id ? Number(category_id) : undefined,
      product_type: product_type || undefined, is_active: is_active || undefined,
      per_page: this.productMeta().per_page, page,
    }).subscribe({
      next: r => { this.products.set(r.data); this.productMeta.set(r.meta); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadSuppliers(page = 1): void {
    const { search, is_active } = this.supplierFilters.value;
    this.svc.getSuppliers({ search: search || undefined, is_active: is_active || undefined, per_page: this.supplierMeta().per_page, page }).subscribe({
      next: r => { this.suppliers.set(r.data); this.supplierMeta.set(r.meta); },
      error: () => {},
    });
  }

  // Category CRUD
  openCategoryForm(cat?: Category): void {
    this.dialog.open(CategoryFormDialogComponent, { data: { category: cat || null, all: this.categories() }, width: '500px' })
      .afterClosed().subscribe(ok => { if (ok) { this.snack.open(cat ? 'Categoría actualizada' : 'Categoría creada', 'OK', { duration: 3000 }); this.loadCategories(); } });
  }
  deleteCategory(cat: Category): void {
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Eliminar categoría', message: `¿Eliminar "${cat.name}"?`, confirmColor: 'warn' }, width: '420px' })
      .afterClosed().subscribe(ok => { if (ok) this.svc.deleteCategory(cat.id).subscribe(() => { this.snack.open('Categoría eliminada', 'OK', { duration: 3000 }); this.loadCategories(); }); });
  }

  // UoM CRUD
  openUomForm(uom?: UnitOfMeasure): void {
    this.dialog.open(UomFormDialogComponent, { data: uom || null, width: '420px' })
      .afterClosed().subscribe(ok => { if (ok) { this.snack.open(uom ? 'Unidad actualizada' : 'Unidad creada', 'OK', { duration: 3000 }); this.loadUnits(); } });
  }

  // Product CRUD
  openProductForm(product?: Product): void {
    this.dialog.open(ProductFormDialogComponent, {
      data: { product: product || null, categories: this.categories(), units: this.units() },
      width: '700px', maxWidth: '95vw'
    }).afterClosed().subscribe(ok => { if (ok) { this.snack.open(product ? 'Producto actualizado' : 'Producto creado', 'OK', { duration: 3000 }); this.loadProducts(this.productMeta().current_page); } });
  }

  openProductDetail(product: Product): void {
    this.dialog.open(ProductDetailDialogComponent, {
      data: { product, units: this.units(), products: this.products() },
      width: '800px', maxWidth: '95vw', maxHeight: '90vh'
    });
  }

  deleteProduct(p: Product): void {
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Eliminar producto', message: `¿Eliminar "${p.name}"?`, confirmColor: 'warn' }, width: '420px' })
      .afterClosed().subscribe(ok => { if (ok) this.svc.deleteProduct(p.id).subscribe(() => { this.snack.open('Producto eliminado', 'OK', { duration: 3000 }); this.loadProducts(this.productMeta().current_page); }); });
  }

  onProductPage(e: PageEvent): void {
    this.productMeta.update(m => ({ ...m, per_page: e.pageSize }));
    this.loadProducts(e.pageIndex + 1);
  }

  // Supplier CRUD
  openSupplierForm(sup?: Supplier): void {
    this.dialog.open(SupplierFormDialogComponent, { data: sup || null, width: '620px' })
      .afterClosed().subscribe(ok => { if (ok) { this.snack.open(sup ? 'Proveedor actualizado' : 'Proveedor creado', 'OK', { duration: 3000 }); this.loadSuppliers(); } });
  }
  deleteSupplier(s: Supplier): void {
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Eliminar proveedor', message: `¿Eliminar "${s.name}"?`, confirmColor: 'warn' }, width: '420px' })
      .afterClosed().subscribe(ok => { if (ok) this.svc.deleteSupplier(s.id).subscribe(() => { this.snack.open('Proveedor eliminado', 'OK', { duration: 3000 }); this.loadSuppliers(); }); });
  }

  onSupplierPage(e: PageEvent): void {
    this.supplierMeta.update(m => ({ ...m, per_page: e.pageSize }));
    this.loadSuppliers(e.pageIndex + 1);
  }

  // Import
  openImport(entity: 'products' | 'suppliers'): void {
    this.dialog.open(ImportDialogComponent, { data: { entity, catalogSvc: this.svc }, width: '560px' })
      .afterClosed().subscribe(() => entity === 'products' ? this.loadProducts() : this.loadSuppliers());
  }

  getParentName(cat: Category): string {
    if (!cat.parent_id) return '—';
    return this.categories().find(c => c.id === cat.parent_id)?.name || '—';
  }
}

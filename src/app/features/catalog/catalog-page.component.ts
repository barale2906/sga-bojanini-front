import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged, forkJoin, of, catchError, map } from 'rxjs';
import { CatalogService, Category, UnitOfMeasure, Product, ProductPresentation, Supplier } from './catalog.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { CategoryFormDialogComponent, CategoryDialogData } from './categories/category-form-dialog.component';
import { UomFormDialogComponent } from './units/uom-form-dialog.component';
import { ProductFormDialogComponent, ProductDialogData } from './products/product-form-dialog.component';
import { SupplierFormDialogComponent } from './suppliers/supplier-form-dialog.component';
import { ImportDialogComponent, ImportEntity } from './import/import-dialog.component';
import { PresentationFormDialogComponent, PresentationDialogData } from './products/presentation-form-dialog.component';

/** Presentación con la info del producto al que pertenece */
export interface PresentationRow extends ProductPresentation {
  product: Product;
}

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTabsModule, MatTableModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatTooltipModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective,
  ],
  templateUrl: './catalog-page.component.html',
  styleUrl: './catalog-page.component.scss',
})
export class CatalogPageComponent implements OnInit {
  private svc = inject(CatalogService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // ── State ──────────────────────────────────────────────────
  categories = signal<Category[]>([]);
  units = signal<UnitOfMeasure[]>([]);
  products = signal<Product[]>([]);
  suppliers = signal<Supplier[]>([]);
  loading = signal(false);

  /** Tab inicial (se puede forzar con ?tab=N en la URL) */
  initialTabIndex = signal(0);

  // ── Presentaciones (tab global) ────────────────────────────
  allPresentations = signal<PresentationRow[]>([]);
  filteredPresentations = signal<PresentationRow[]>([]);
  allSimpleProducts = signal<Product[]>([]);
  loadingPresentations = signal(false);
  presTabLoaded = signal(false);
  presProductFilter = this.fb.control<number | ''>('' as const);

  // ── Column defs ────────────────────────────────────────────
  catCols = ['actions', 'code', 'name', 'parent', 'is_active'];
  uomCols = ['actions', 'abbreviation', 'name', 'is_base', 'is_active'];
  prodCols = ['actions', 'code', 'name', 'product_type', 'category', 'base_unit', 'is_active'];
  suppCols = ['actions', 'name', 'tax_id', 'contact_name', 'phone', 'is_active'];
  globalPresCols = ['product', 'pres_name', 'unit_type', 'factor', 'is_purchase_default', 'is_active', 'pres_actions'];

  // ── Filters ────────────────────────────────────────────────
  catFilters = this.fb.group({ search: [''], is_active: [''] });
  uomFilters = this.fb.group({ search: [''], is_active: [''], is_base: [''] });
  prodFilters = this.fb.group({ search: [''], category_id: [''], product_type: [''], is_active: [''] });
  suppFilters = this.fb.group({ search: [''], is_active: [''] });

  ngOnInit(): void {
    // Si la URL tiene ?tab=N, abre ese tab directamente (ej: desde detalle de producto)
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam !== null) {
      const idx = Number(tabParam);
      this.initialTabIndex.set(idx);
      if (idx === 4) this.loadAllPresentations(); // pre-carga el tab de empaques
    }

    this.loadAll();
    this.setupFilterSubscriptions();
    this.presProductFilter.valueChanges.subscribe(() => this.filterPresentations());
  }

  private loadAll(): void {
    this.loadCategories();
    this.loadUnits();
    this.loadProducts();
    this.loadSuppliers();
  }

  private setupFilterSubscriptions(): void {
    this.catFilters.get('search')!.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.loadCategories());
    this.catFilters.get('is_active')!.valueChanges.subscribe(() => this.loadCategories());

    this.uomFilters.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => this.loadUnits());

    this.prodFilters.get('search')!.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.loadProducts());
    this.prodFilters.get('category_id')!.valueChanges.subscribe(() => this.loadProducts());
    this.prodFilters.get('product_type')!.valueChanges.subscribe(() => this.loadProducts());
    this.prodFilters.get('is_active')!.valueChanges.subscribe(() => this.loadProducts());

    this.suppFilters.get('search')!.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.loadSuppliers());
    this.suppFilters.get('is_active')!.valueChanges.subscribe(() => this.loadSuppliers());
  }

  // ── Loaders ────────────────────────────────────────────────

  loadCategories(): void {
    const { search, is_active } = this.catFilters.value;
    this.svc.getCategories({ search: search || undefined, is_active: is_active || undefined })
      .subscribe({ next: r => this.categories.set(r.data), error: () => {} });
  }

  loadUnits(): void {
    const { search, is_active, is_base } = this.uomFilters.value;
    this.svc.getUnits({ search: search || undefined, is_active: is_active || undefined, is_base: is_base || undefined })
      .subscribe({ next: r => this.units.set(r.data), error: () => {} });
  }

  loadProducts(): void {
    this.loading.set(true);
    const { search, category_id, product_type, is_active } = this.prodFilters.value;
    this.svc.getProducts({
      search: search || undefined,
      category_id: category_id ? Number(category_id) : undefined,
      product_type: product_type || undefined,
      is_active: is_active || undefined,
    }).subscribe({
      next: r => { this.products.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadSuppliers(): void {
    const { search, is_active } = this.suppFilters.value;
    this.svc.getSuppliers({ search: search || undefined, is_active: is_active || undefined })
      .subscribe({ next: r => this.suppliers.set(r.data), error: () => {} });
  }

  // ── Helpers ────────────────────────────────────────────────

  getCategoryName(id: number): string {
    return this.categories().find(c => c.id === id)?.name ?? '—';
  }

  getParentName(parentId: number | null): string {
    if (!parentId) return '—';
    return this.categories().find(c => c.id === parentId)?.name ?? String(parentId);
  }

  // ── Categorías ─────────────────────────────────────────────

  openCategoryForm(cat?: Category): void {
    const data: CategoryDialogData = { category: cat ?? null, categories: this.categories() };
    this.dialog.open(CategoryFormDialogComponent, { data, width: '520px' })
      .afterClosed().subscribe(saved => {
        if (saved) { this.snack.open(cat ? 'Categoría actualizada' : 'Categoría creada', 'OK', { duration: 3000 }); this.loadCategories(); }
      });
  }

  deleteCategory(cat: Category): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar categoría', message: `¿Eliminar "${cat.name}"?`, confirmColor: 'warn' }, width: '420px',
    }).afterClosed().subscribe(ok => {
      if (ok) this.svc.deleteCategory(cat.id).subscribe({
        next: () => { this.snack.open('Categoría eliminada', 'OK', { duration: 3000 }); this.loadCategories(); },
        error: err => this.snack.open(err.error?.message || 'Error', 'OK', { duration: 4000 }),
      });
    });
  }

  // ── Unidades ────────────────────────────────────────────────

  openUomForm(unit?: UnitOfMeasure): void {
    this.dialog.open(UomFormDialogComponent, { data: unit ?? null, width: '440px' })
      .afterClosed().subscribe(saved => {
        if (saved) { this.snack.open(unit ? 'Unidad actualizada' : 'Unidad creada', 'OK', { duration: 3000 }); this.loadUnits(); }
      });
  }

  deleteUnit(unit: UnitOfMeasure): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Desactivar unidad', message: `¿Desactivar "${unit.name}"?`, confirmColor: 'warn' }, width: '420px',
    }).afterClosed().subscribe(ok => {
      if (ok) this.svc.deleteUnit(unit.id).subscribe({
        next: () => { this.snack.open('Unidad desactivada', 'OK', { duration: 3000 }); this.loadUnits(); },
        error: err => this.snack.open(err.error?.message || 'Error', 'OK', { duration: 4000 }),
      });
    });
  }

  // ── Productos ───────────────────────────────────────────────

  openProductForm(prod?: Product): void {
    // Cargamos TODOS los simples activos (sin filtros de tabla) para el selector de componentes del kit
    this.svc.getProducts({ product_type: 'simple', is_active: 'true' }).subscribe({
      next: r => {
        const simples = r.data.filter(p => p.id !== prod?.id);
        const data: ProductDialogData = {
          product: prod ?? null,
          categories: this.categories(),
          units: this.units(),
          simpleProducts: simples,
        };
        this.dialog.open(ProductFormDialogComponent, { data, width: '720px', maxHeight: '92vh' })
          .afterClosed().subscribe(saved => {
            if (saved) {
              this.snack.open(prod ? 'Producto actualizado' : 'Producto creado', 'OK', { duration: 3000 });
              this.loadProducts();
            }
          });
      },
      error: () => {
        // Si falla la carga de simples, abrimos igual con lista vacía
        const data: ProductDialogData = {
          product: prod ?? null,
          categories: this.categories(),
          units: this.units(),
          simpleProducts: [],
        };
        this.dialog.open(ProductFormDialogComponent, { data, width: '720px', maxHeight: '92vh' })
          .afterClosed().subscribe(saved => {
            if (saved) {
              this.snack.open(prod ? 'Producto actualizado' : 'Producto creado', 'OK', { duration: 3000 });
              this.loadProducts();
            }
          });
      },
    });
  }

  goToProduct(prod: Product): void {
    this.router.navigate(['/catalog/products', prod.id]);
  }

  deleteProduct(prod: Product): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar producto', message: `¿Eliminar "${prod.name}"?`, confirmColor: 'warn' }, width: '420px',
    }).afterClosed().subscribe(ok => {
      if (ok) this.svc.deleteProduct(prod.id).subscribe({
        next: () => { this.snack.open('Producto eliminado', 'OK', { duration: 3000 }); this.loadProducts(); },
        error: err => this.snack.open(err.error?.message || 'Error', 'OK', { duration: 4000 }),
      });
    });
  }

  // ── Proveedores ─────────────────────────────────────────────

  openSupplierForm(sup?: Supplier): void {
    this.dialog.open(SupplierFormDialogComponent, { data: sup ?? null, width: '560px' })
      .afterClosed().subscribe(saved => {
        if (saved) { this.snack.open(sup ? 'Proveedor actualizado' : 'Proveedor creado', 'OK', { duration: 3000 }); this.loadSuppliers(); }
      });
  }

  deleteSupplier(sup: Supplier): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar proveedor', message: `¿Eliminar "${sup.name}"?`, confirmColor: 'warn' }, width: '420px',
    }).afterClosed().subscribe(ok => {
      if (ok) this.svc.deleteSupplier(sup.id).subscribe({
        next: () => { this.snack.open('Proveedor eliminado', 'OK', { duration: 3000 }); this.loadSuppliers(); },
        error: err => this.snack.open(err.error?.message || 'Error', 'OK', { duration: 4000 }),
      });
    });
  }

  // ── Importación ─────────────────────────────────────────────

  openImport(entity: ImportEntity): void {
    this.dialog.open(ImportDialogComponent, { data: entity, width: '560px' })
      .afterClosed().subscribe(imported => {
        if (imported) {
          if (entity === 'products') this.loadProducts();
          else this.loadSuppliers();
        }
      });
  }

  // ── Tab Empaques / Presentaciones ───────────────────────────

  /** Lazy-load la primera vez que el usuario abre el tab de Empaques (índice 4) */
  onTabIndexChange(index: number): void {
    if (index === 4 && !this.presTabLoaded()) {
      this.loadAllPresentations();
    }
  }

  /** Carga todos los productos simples y sus presentaciones en paralelo (forkJoin) */
  loadAllPresentations(): void {
    this.loadingPresentations.set(true);
    this.svc.getProducts({ product_type: 'simple', is_active: 'true' }).subscribe({
      next: r => {
        const simples = r.data;
        this.allSimpleProducts.set(simples);

        if (simples.length === 0) {
          this.allPresentations.set([]);
          this.filteredPresentations.set([]);
          this.loadingPresentations.set(false);
          this.presTabLoaded.set(true);
          return;
        }

        forkJoin(
          simples.map(p =>
            this.svc.getPresentations(p.id).pipe(
              map(res => res.data.map(pr => ({ ...pr, product: p }) as PresentationRow)),
              catchError(() => of([] as PresentationRow[]))
            )
          )
        ).subscribe(results => {
          const rows = (results as PresentationRow[][]).flat()
            .sort((a, b) => a.product.name.localeCompare(b.product.name) || a.level - b.level || a.sort_order - b.sort_order);
          this.allPresentations.set(rows);
          this.filterPresentations();
          this.loadingPresentations.set(false);
          this.presTabLoaded.set(true);
        });
      },
      error: () => {
        this.loadingPresentations.set(false);
        this.presTabLoaded.set(true);
      },
    });
  }

  filterPresentations(): void {
    const productId = this.presProductFilter.value;
    if (!productId) {
      this.filteredPresentations.set(this.allPresentations());
    } else {
      this.filteredPresentations.set(this.allPresentations().filter(r => r.product_id === Number(productId)));
    }
  }

  /** Devuelve la abreviatura del tipo de empaque (unidad de medida) de una presentación */
  getPresUnitAbbr(pres: PresentationRow): string {
    return this.units().find(u => u.id === pres.units_of_measure_id)?.abbreviation ?? '—';
  }

  openGlobalPresForm(pres?: PresentationRow): void {
    const openDialog = (simpleProds: Product[]) => {
      const productId = pres?.product_id ?? 0;
      const data: PresentationDialogData = {
        presentation: pres ?? null,
        productId,
        units: this.units(),
        existingPresentations: pres
          ? this.allPresentations().filter(r => r.product_id === productId)
          : [],
        products: simpleProds,
      };
      this.dialog.open(PresentationFormDialogComponent, { data, width: '580px' })
        .afterClosed().subscribe(saved => {
          if (saved) {
            this.snack.open(pres ? 'Empaque actualizado' : 'Empaque creado', 'OK', { duration: 3000 });
            this.presTabLoaded.set(false);
            this.loadAllPresentations();
          }
        });
    };

    // Asegurarse de que tengamos el listado de productos simples
    if (this.allSimpleProducts().length > 0) {
      openDialog(this.allSimpleProducts());
    } else {
      this.svc.getProducts({ product_type: 'simple', is_active: 'true' }).subscribe({
        next: r => { this.allSimpleProducts.set(r.data); openDialog(r.data); },
        error: () => openDialog([]),
      });
    }
  }

  deleteGlobalPresentation(pres: PresentationRow): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar empaque',
        message: `¿Eliminar "${pres.name}" del producto ${pres.product.name}?`,
        confirmColor: 'warn',
      },
      width: '420px',
    }).afterClosed().subscribe(ok => {
      if (ok) {
        this.svc.deletePresentation(pres.id).subscribe({
          next: () => {
            this.snack.open('Empaque eliminado', 'OK', { duration: 3000 });
            // Actualización local sin recargar todo
            const updated = this.allPresentations().filter(r => r.id !== pres.id);
            this.allPresentations.set(updated);
            this.filterPresentations();
          },
          error: err => this.snack.open(err.error?.message || 'Error al eliminar', 'OK', { duration: 4000 }),
        });
      }
    });
  }
}

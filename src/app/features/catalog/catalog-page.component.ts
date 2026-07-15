import { Component, inject, signal, computed, OnInit } from '@angular/core';
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
import { CatalogService, Category, UnitOfMeasure, Product, ProductPresentation, Supplier, ProductClassification } from './catalog.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { CategoryFormDialogComponent, CategoryDialogData } from './categories/category-form-dialog.component';
import { UomFormDialogComponent } from './units/uom-form-dialog.component';
import { ProductFormDialogComponent, ProductDialogData } from './products/product-form-dialog.component';
import { SupplierFormDialogComponent, SupplierDialogData } from './suppliers/supplier-form-dialog.component';
import { ImportDialogComponent, ImportEntity } from './import/import-dialog.component';
import { PresentationFormDialogComponent, PresentationDialogData } from './products/presentation-form-dialog.component';
import { PresProductsDialogComponent, PresProductsDialogData } from './products/pres-products-dialog.component';

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

  // ── Presentaciones (catálogo global M:N) ───────────────────
  /** Todas las presentaciones del catálogo global */
  catalogPresentations = signal<ProductPresentation[]>([]);
  /** Presentaciones filtradas por búsqueda */
  filteredCatalogPresentations = signal<ProductPresentation[]>([]);
  loadingPresentations = signal(false);
  presTabLoaded = signal(false);
  presSearch = this.fb.control('');

  /**
   * Mapa presentationId → productos que la usan.
   * Se carga en background al abrir el tab.
   */
  presProductsMap = signal<Map<number, Product[]>>(new Map());
  presProductsMapLoaded = signal(false);

  // ── Column defs ────────────────────────────────────────────
  catCols  = ['actions', 'code', 'name', 'parent', 'is_active'];
  uomCols  = ['actions', 'abbreviation', 'name', 'is_base', 'is_active'];
  prodCols = ['actions', 'code', 'name', 'product_type', 'category', 'base_unit', 'is_active'];
  suppCols = ['actions', 'name', 'tax_id', 'contact_name', 'phone', 'is_active'];
  /** Columnas del tab global de empaques: acciones al inicio, sin columna producto */
  globalPresCols = ['pres_actions', 'pres_name', 'unit_type', 'factor', 'level_col', 'is_active'];

  // ── Filters ────────────────────────────────────────────────
  catFilters  = this.fb.group({ search: [''], is_active: [''] });
  uomFilters  = this.fb.group({ search: [''], is_active: [''], is_base: [''] });
  prodFilters = this.fb.group({ search: [''], category_id: [''], product_type: [''], is_active: [''] });
  suppFilters = this.fb.group({ search: [''], is_active: [''] });

  ngOnInit(): void {
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam !== null) {
      const idx = Number(tabParam);
      this.initialTabIndex.set(idx);
      if (idx === 3) this.loadCatalogPresentations();
    }

    this.loadAll();
    this.setupFilterSubscriptions();

    // Filtro de búsqueda en empaques
    this.presSearch.valueChanges.pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => this.filterCatalogPresentations());
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
      .subscribe({ next: r => this.categories.set(r.data ?? []), error: () => {} });
  }

  loadUnits(): void {
    const { search, is_active, is_base } = this.uomFilters.value;
    this.svc.getUnits({ search: search || undefined, is_active: is_active || undefined, is_base: is_base || undefined })
      .subscribe({ next: r => this.units.set(r.data ?? []), error: () => {} });
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
      next: r => { this.products.set(r.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadSuppliers(): void {
    const { search, is_active } = this.suppFilters.value;
    this.svc.getSuppliers({ search: search || undefined, is_active: is_active || undefined })
      .subscribe({ next: r => this.suppliers.set(r.data ?? []), error: () => {} });
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
    const open = (simples: Product[], pres: ProductPresentation[], classifications: ProductClassification[]) => {
      const data: ProductDialogData = {
        product:              prod ?? null,
        categories:           this.categories(),
        units:                this.units(),
        simpleProducts:       simples.filter(p => p.id !== prod?.id),
        catalogPresentations: pres,
        classifications,
      };
      this.dialog.open(ProductFormDialogComponent, { data, width: '720px', maxHeight: '92vh' })
        .afterClosed().subscribe(saved => {
          if (saved) {
            this.snack.open(prod ? 'Producto actualizado' : 'Producto creado', 'OK', { duration: 3000 });
            this.loadProducts();
          }
        });
    };

    forkJoin({
      simples:         this.svc.getProducts({ product_type: 'simple', is_active: '1' }),
      pres:            this.svc.getCatalogPresentations(),
      classifications: this.svc.getProductClassifications({ is_active: '1' }),
    }).subscribe({
      next:  ({ simples, pres, classifications }) => open(simples.data, pres.data, classifications.data),
      error: ()                                   => open([], [], []),
    });
  }

  goToProduct(prod: Product): void {
    this.router.navigate(['/catalog/products', prod.id]);
  }

  /** Abre la etiqueta de barcode del producto en ventana nueva y lanza la impresión. */
  printProductBarcode(prod: Product): void {
    const win = window.open('', '_blank', 'width=520,height=420');
    if (!win) { this.snack.open('Permite ventanas emergentes para imprimir', 'OK', { duration: 4000 }); return; }
    win.document.write('<html><body style="font-family:sans-serif;text-align:center;padding:2rem">Cargando etiqueta…</body></html>');
    this.svc.getBarcodePrintHtml(prod.id).subscribe({
      next: html => { win.document.open(); win.document.write(html); win.document.close(); },
      error: () => { win.close(); this.snack.open('No se pudo obtener la etiqueta', 'OK', { duration: 4000 }); },
    });
  }

  /** Imprime la lista completa de barcodes con gráfica, aplicando los filtros activos. */
  printBarcodeList(): void {
    const { search, category_id, product_type, is_active } = this.prodFilters.value;
    const win = window.open('', '_blank');
    if (!win) { this.snack.open('Permite ventanas emergentes para imprimir', 'OK', { duration: 4000 }); return; }
    win.document.write('<html><body style="font-family:sans-serif;text-align:center;padding:2rem">Cargando lista…</body></html>');

    this.svc.getProducts({
      search: search || undefined,
      category_id: category_id ? Number(category_id) : undefined,
      product_type: product_type || undefined,
      is_active: is_active || undefined,
      per_page: 9999,
    }).subscribe({
      next: r => {
        const products = r.data ?? [];
        const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const items = products.map(p => `
          <div class="bc-item">
            <div class="bc-name">${escape(p.name)}</div>
            <svg class="bc-svg" data-code="${escape(p.barcode)}"></svg>
            <div class="bc-code">${escape(p.barcode)}</div>
          </div>`).join('');

        const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Listado Código de Barras</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:sans-serif;padding:1.5rem}
    h1{font-size:1.1rem;margin-bottom:1.2rem;text-align:center}
    .grid{display:flex;flex-wrap:wrap;gap:0.75rem;justify-content:flex-start}
    .bc-item{border:1px solid #ccc;border-radius:4px;padding:0.6rem;text-align:center;width:180px}
    .bc-name{font-size:0.72rem;font-weight:600;margin-bottom:0.4rem;line-height:1.2;word-break:break-word}
    .bc-svg{width:100%;height:auto}
    .bc-code{font-size:0.7rem;color:#555;margin-top:0.25rem;font-family:monospace}
    @media print{@page{margin:1cm}body{padding:0.5rem}}
  </style>
</head>
<body>
  <h1>Listado Código de Barras</h1>
  <div class="grid">${items}</div>
  <script>
    document.querySelectorAll('svg.bc-svg').forEach(function(el){
      var code = el.getAttribute('data-code');
      try{ JsBarcode(el, code, {format:'CODE128',width:1.4,height:48,displayValue:false,margin:2}); }
      catch(e){ console.warn('Barcode error',code,e); }
    });
    window.print();
  <\/script>
</body>
</html>`;
        win.document.open();
        win.document.write(html);
        win.document.close();
      },
      error: () => { win.close(); this.snack.open('No se pudo obtener la lista de barcodes', 'OK', { duration: 4000 }); },
    });
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
    const open = (prods: Product[], pres: ProductPresentation[]) => {
      const data: SupplierDialogData = {
        supplier:             sup ?? null,
        categories:           this.categories(),
        products:             prods,
        catalogPresentations: pres,
      };
      this.dialog.open(SupplierFormDialogComponent, { data, width: '780px', maxHeight: '92vh' })
        .afterClosed().subscribe(saved => {
          if (saved) {
            this.snack.open(sup ? 'Proveedor actualizado' : 'Proveedor creado', 'OK', { duration: 3000 });
            this.loadSuppliers();
          }
        });
    };

    forkJoin({
      prods: this.svc.getProducts({ is_active: '1', per_page: 9999, product_type: 'simple' }),
      pres:  this.svc.getCatalogPresentations({ is_active: '1' }),
    }).subscribe({
      next:  ({ prods, pres }) => open(prods.data, pres.data),
      error: ()                => open([], []),
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

  // ── Tab Empaques / Presentaciones (catálogo global) ─────────

  /** Lazy-load la primera vez que el usuario abre el tab de Empaques (índice 3) */
  onTabIndexChange(index: number): void {
    if (index === 3 && !this.presTabLoaded()) {
      this.loadCatalogPresentations();
    }
  }

  /**
   * Carga el catálogo global de presentaciones.
   * GET /api/v1/presentations
   * En paralelo carga los productos para el mapa "qué productos usan cada empaque".
   */
  loadCatalogPresentations(): void {
    this.loadingPresentations.set(true);

    // 1) Catálogo global (fuente principal de la tabla)
    this.svc.getCatalogPresentations().subscribe({
      next: r => {
        this.catalogPresentations.set(r.data ?? []);
        this.filterCatalogPresentations();
        this.loadingPresentations.set(false);
        this.presTabLoaded.set(true);
      },
      error: () => {
        this.loadingPresentations.set(false);
        this.presTabLoaded.set(true);
      },
    });

    // 2) En segundo plano, construye el mapa presentationId → productos
    this._loadPresProductsMap();
  }

  /**
   * Carga en background el mapa presentationId → productos que lo usan.
   * Se hace con forkJoin sobre todos los productos simples.
   */
  private _loadPresProductsMap(): void {
    this.svc.getProducts({ product_type: 'simple', is_active: '1', per_page: 9999 }).subscribe({
      next: r => {
        const simples = r.data ?? [];
        if (simples.length === 0) { this.presProductsMapLoaded.set(true); return; }

        forkJoin(
          simples.map(p =>
            this.svc.getPresentations(p.id).pipe(
              map(res => ({ product: p, presIds: (res.data ?? []).map((pr: ProductPresentation) => pr.id) })),
              catchError(() => of({ product: p, presIds: [] as number[] }))
            )
          )
        ).subscribe(results => {
          const map = new Map<number, Product[]>();
          for (const { product, presIds } of results) {
            for (const presId of presIds) {
              if (!map.has(presId)) map.set(presId, []);
              map.get(presId)!.push(product);
            }
          }
          this.presProductsMap.set(map);
          this.presProductsMapLoaded.set(true);
        });
      },
      error: () => this.presProductsMapLoaded.set(true),
    });
  }

  filterCatalogPresentations(): void {
    const q = (this.presSearch.value ?? '').toLowerCase().trim();
    if (!q) {
      this.filteredCatalogPresentations.set(this.catalogPresentations());
    } else {
      this.filteredCatalogPresentations.set(
        this.catalogPresentations().filter(p =>
          p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
        )
      );
    }
  }

  /** Devuelve la abreviatura de unidad de una presentación global */
  getPresUnitAbbr(pres: ProductPresentation): string {
    return this.units().find(u => u.id === pres.units_of_measure_id)?.abbreviation ?? '—';
  }

  /** Muestra los productos que usan una presentación */
  showPresentationProducts(pres: ProductPresentation): void {
    const products = this.presProductsMap().get(pres.id) ?? [];
    const data: PresProductsDialogData = {
      presentation: pres,
      products,
      loading: !this.presProductsMapLoaded(),
    };
    this.dialog.open(PresProductsDialogComponent, { data, width: '480px' });
  }

  /** Abre el wizard de crear/editar presentación del catálogo global */
  openGlobalPresForm(pres?: ProductPresentation): void {
    const data: PresentationDialogData = {
      presentation: pres ?? null,
      units: this.units(),
      catalogPresentations: pres
        ? this.catalogPresentations().filter(p => p.id !== pres.id)
        : this.catalogPresentations(),
      // No productId: creación en catálogo global sin vincular a ningún producto
    };
    this.dialog.open(PresentationFormDialogComponent, { data, width: '640px', maxHeight: '92vh' })
      .afterClosed().subscribe(saved => {
        if (saved) {
          this.snack.open(pres ? 'Empaque actualizado' : 'Empaque creado', 'OK', { duration: 3000 });
          this.presTabLoaded.set(false);
          this.loadCatalogPresentations();
        }
      });
  }

  /** Elimina una presentación del catálogo global (la desvincula de todos los productos) */
  deleteGlobalPresentation(pres: ProductPresentation): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar empaque',
        message: `¿Eliminar "${pres.name}" del catálogo?\nSe desvinculará de todos los productos que lo usan.`,
        confirmColor: 'warn',
      },
      width: '420px',
    }).afterClosed().subscribe(ok => {
      if (ok) {
        this.svc.deletePresentation(pres.id).subscribe({
          next: () => {
            this.snack.open('Empaque eliminado del catálogo', 'OK', { duration: 3000 });
            const updated = this.catalogPresentations().filter(p => p.id !== pres.id);
            this.catalogPresentations.set(updated);
            this.filterCatalogPresentations();
          },
          error: err => this.snack.open(err.error?.message || 'Error al eliminar', 'OK', { duration: 4000 }),
        });
      }
    });
  }
}

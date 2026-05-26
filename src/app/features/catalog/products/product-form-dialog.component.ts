import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormArray, FormGroup } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { switchMap, map, of } from 'rxjs';
import { CatalogService, Product, Category, UnitOfMeasure } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

export interface ProductDialogData {
  product: Product | null;
  categories: Category[];
  units: UnitOfMeasure[];
  simpleProducts: Product[]; // productos simples activos para elegir componentes de kit
}

@Component({
  selector: 'app-product-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatSlideToggleModule,
    MatProgressSpinnerModule, MatDividerModule, MatTooltipModule,
    FormErrorsComponent,
  ],
  templateUrl: './product-form-dialog.component.html',
  styles: [`
    .dialog-form { display:flex; flex-direction:column; gap:0.25rem; padding:0.5rem 0; }
    .w-full { width:100%; }
    .row-2 { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
    .section-title { font-size:0.85rem; font-weight:600; color:#4a5568; margin:0.5rem 0 0; text-transform:uppercase; letter-spacing:.05em; }
    .section-hint { font-size:0.8rem; color:#718096; margin:0 0 0.5rem; }
    .kit-row { display:grid; grid-template-columns:1fr 110px 36px; gap:0.5rem; align-items:flex-start; }
    .kit-row-num { font-size:0.78rem; color:#a0aec0; min-width:1.2rem; padding-top:1rem; text-align:right; }
    .kit-search { margin-bottom:0.25rem; }
    .bom-empty { text-align:center; color:#a0aec0; font-size:0.85rem; padding:0.75rem 0; }
    .bom-counter { font-size:0.78rem; color:#718096; margin-bottom:0.25rem; }
    .loading-wrap { display:flex; align-items:center; gap:0.5rem; color:#718096; font-size:0.85rem; padding:0.5rem 0; }
    mat-divider { margin:0.75rem 0; }
    .component-name { font-weight:500; }
    .component-code { font-size:0.78rem; color:#718096; margin-left:0.25rem; }
    .pkg-section-header {
      display:flex; justify-content:space-between; align-items:center;
      padding:0.5rem 0.75rem; border-radius:8px; cursor:pointer;
      background:#EBF8FF; border:1px solid #BEE3F8; margin:0.25rem 0;
      &:hover { background:#dbeafe; }
    }
    .pkg-body {
      padding:0.75rem; background:#F7FAFC; border:1px solid #E2E8F0;
      border-radius:0 0 8px 8px; border-top:none; display:flex;
      flex-direction:column; gap:0.25rem;
    }
    .pkg-preview {
      display:flex; align-items:center; gap:0.4rem;
      background:#F0FFF4; border:1px solid #9AE6B4; border-radius:6px;
      padding:0.4rem 0.75rem; font-size:0.82rem; color:#276749; margin-top:0.25rem;
    }
  `],
})
export class ProductFormDialogComponent implements OnInit {
  data: ProductDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ProductFormDialogComponent>);
  private svc = inject(CatalogService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  loadingComponents = signal(false);
  errors = signal<string[]>([]);
  fe = signal<Record<string, string[]>>({});

  /** Controla si se muestra la sección de empaque principal al crear un producto simple */
  pkgVisible = signal(false);

  /** Señal con todos los simples disponibles como componentes */
  simpleProducts = signal<Product[]>([]);

  /** Texto de búsqueda para filtrar opciones en los selectores de componente */
  componentSearch = signal('');

  /** Lista filtrada según búsqueda; siempre incluye el producto ya seleccionado en cada fila */
  filteredProducts = computed(() => {
    const q = this.componentSearch().toLowerCase().trim();
    const all = this.simpleProducts();
    if (!q) return all;
    return all.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q)
    );
  });

  /** Signal reactiva del tipo de producto (evita problema de computed sobre form.value no-reactivo) */
  private _productType = signal<string>('simple');
  isKit = computed(() => this._productType() === 'kit');

  form = this.fb.group({
    category_id: [null as number | null, Validators.required],
    base_unit_id: [null as number | null, Validators.required],
    product_type: ['simple', Validators.required],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    code: ['', [Validators.required, Validators.maxLength(50)]],
    sku: [null as string | null],
    description: [''],
    requires_cold_chain: [false],
    reorder_point: [0, [Validators.min(0)]],
    reorder_quantity: [0, [Validators.min(0)]],
    min_stock: [0, [Validators.min(0)]],
    max_stock: [0, [Validators.min(0)]],
    is_active: [true],
    components: this.fb.array([]),
    // ── Empaque principal (opcional, solo al crear un producto simple) ──
    pkg_name:    [''],
    pkg_code:    [''],
    pkg_unit_id: [null as number | null],
    pkg_factor:  [null as number | null, [Validators.min(1)]],
  });

  get componentsArray(): FormArray {
    return this.form.get('components') as FormArray;
  }

  /** Obtiene las opciones para una fila concreta:
   *  incluye SIEMPRE el producto ya seleccionado (para que mat-select muestre la etiqueta) */
  getRowOptions(rowIndex: number): Product[] {
    const filtered = this.filteredProducts();
    const selectedId = (this.componentsArray.at(rowIndex) as FormGroup)
      .get('component_product_id')?.value as number | null;
    if (!selectedId) return filtered;
    // Si el producto seleccionado ya está en la lista filtrada, devolver tal cual
    if (filtered.some(p => p.id === selectedId)) return filtered;
    // Incluirlo al inicio para que mat-select pueda mostrar su etiqueta
    const selectedProduct = this.simpleProducts().find(p => p.id === selectedId);
    return selectedProduct ? [selectedProduct, ...filtered] : filtered;
  }

  getProductLabel(id: number | null): string {
    if (!id) return '';
    const p = this.simpleProducts().find(p => p.id === id);
    return p ? `${p.name} (${p.code})` : String(id);
  }

  /** Abreviatura de la unidad base actualmente seleccionada */
  get selectedBaseUnitAbbr(): string {
    const id = this.form.get('base_unit_id')?.value;
    if (!id) return 'uds.';
    return this.data.units.find(u => u.id === id)?.abbreviation ?? 'uds.';
  }

  ngOnInit(): void {
    // Inicializar simpleProducts desde los datos pre-cargados
    this.simpleProducts.set(this.data.simpleProducts);

    // Mantener la señal _productType sincronizada con el form
    this.form.get('product_type')!.valueChanges.subscribe(v => {
      this._productType.set(v || 'simple');
    });

    if (this.data.product) {
      const p = this.data.product;
      this._productType.set(p.product_type);
      this.form.patchValue({
        category_id: p.category_id,
        base_unit_id: p.base_unit_id,
        product_type: p.product_type,
        name: p.name,
        code: p.code,
        sku: p.sku,
        description: p.description ?? '',
        requires_cold_chain: p.requires_cold_chain,
        reorder_point: p.reorder_point,
        reorder_quantity: p.reorder_quantity,
        min_stock: p.min_stock,
        max_stock: p.max_stock,
        is_active: p.is_active,
      });

      // Al editar un kit, cargar sus componentes actuales
      if (p.product_type === 'kit') {
        this.loadExistingComponents(p.id);
      }
    }
  }

  /** Carga los componentes actuales del kit desde la API y puebla el FormArray */
  private loadExistingComponents(productId: number): void {
    this.loadingComponents.set(true);
    this.svc.getKitComponents(productId).subscribe({
      next: r => {
        this.loadingComponents.set(false);
        while (this.componentsArray.length) this.componentsArray.removeAt(0);
        r.data.forEach(c => {
          this.componentsArray.push(this.fb.group({
            component_product_id: [c.component_product_id, Validators.required],
            quantity_per_kit: [c.quantity_per_kit, [Validators.required, Validators.min(1)]],
          }));
        });
      },
      error: () => {
        this.loadingComponents.set(false);
        this.errors.set(['No se pudieron cargar los componentes actuales del kit.']);
      },
    });
  }

  addComponentRow(): void {
    this.componentsArray.push(this.fb.group({
      component_product_id: [null as number | null, Validators.required],
      quantity_per_kit: [1, [Validators.required, Validators.min(1)]],
    }));
  }

  removeComponentRow(i: number): void {
    this.componentsArray.removeAt(i);
  }

  clearComponentSearch(): void {
    this.componentSearch.set('');
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    if (this.isKit() && this.componentsArray.length === 0) {
      this.errors.set(['Un kit debe tener al menos un componente.']);
      return;
    }
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const raw = this.form.value;
    const basePayload: any = {
      category_id: raw.category_id,
      base_unit_id: raw.base_unit_id,
      product_type: raw.product_type,
      name: raw.name,
      code: raw.code,
      sku: raw.sku || null,
      description: raw.description || null,
      requires_cold_chain: raw.requires_cold_chain,
      reorder_point: raw.reorder_point ?? 0,
      reorder_quantity: raw.reorder_quantity ?? 0,
      min_stock: raw.min_stock ?? 0,
      max_stock: raw.max_stock ?? 0,
      is_active: raw.is_active,
    };

    const kitComponents = (raw.components as any[]).map(c => ({
      component_product_id: c.component_product_id,
      quantity_per_kit: c.quantity_per_kit,
    }));

    if (!this.data.product) {
      // ── CREAR ──────────────────────────────────────────────────
      if (this.isKit()) {
        basePayload.components = kitComponents;
      }

      // Determinar si hay que crear un empaque principal después de crear el producto
      const hasPkg = !this.isKit() && this.pkgVisible()
        && raw.pkg_name && raw.pkg_code && raw.pkg_unit_id && (raw.pkg_factor ?? 0) >= 1;

      this.svc.createProduct(basePayload).pipe(
        switchMap(productRes => {
          if (hasPkg) {
            return this.svc.createPresentation(productRes.data.id, {
              parent_id: null,
              name: raw.pkg_name!,
              code: raw.pkg_code!,
              units_of_measure_id: raw.pkg_unit_id!,
              factor_to_base: raw.pkg_factor!,
              quantity_per_parent: null,
              level: 1,
              sort_order: 1,
              is_purchase_default: true,
            }).pipe(map(() => productRes));
          }
          return of(productRes);
        })
      ).subscribe({
        next: res => { this.saving.set(false); this.ref.close(res.data); },
        error: err => this.handleError(err),
      });

    } else {
      // ── EDITAR ─────────────────────────────────────────────────
      if (this.isKit()) {
        // 1) Actualizar cabecera del producto
        // 2) Sincronizar BOM (reemplaza todos los componentes)
        this.svc.updateProduct(this.data.product.id, basePayload).pipe(
          switchMap(productRes =>
            this.svc.syncKitComponents(this.data.product!.id, kitComponents).pipe(
              map(() => productRes)
            )
          )
        ).subscribe({
          next: res => { this.saving.set(false); this.ref.close(res.data); },
          error: err => this.handleError(err),
        });
      } else {
        this.svc.updateProduct(this.data.product.id, basePayload).subscribe({
          next: res => { this.saving.set(false); this.ref.close(res.data); },
          error: err => this.handleError(err),
        });
      }
    }
  }

  private handleError(err: any): void {
    this.saving.set(false);
    if (err.status === 422 || err.status === 409) {
      this.fe.set(err.error?.errors || {});
      const msgs = err.error?.errors
        ? (Object.values(err.error.errors).flat() as string[])
        : [err.error?.message || 'Error de validación'];
      this.errors.set(msgs);
    } else {
      this.errors.set([err.error?.message || 'Error al guardar el producto']);
    }
  }
}

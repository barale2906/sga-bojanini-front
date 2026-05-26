import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators, FormArray } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { CatalogService, Product, ProductPresentation, KitComponent, UnitOfMeasure } from '../catalog.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';

@Component({
  selector: 'app-product-detail-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTabsModule, MatTableModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSlideToggleModule, MatProgressSpinnerModule,
    MatTooltipModule, MatChipsModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective,
  ],
  templateUrl: './product-detail-page.component.html',
  styleUrl: './product-detail-page.component.scss',
})
export class ProductDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private svc = inject(CatalogService);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  product = signal<Product | null>(null);
  presentations = signal<ProductPresentation[]>([]);
  components = signal<KitComponent[]>([]);
  units = signal<UnitOfMeasure[]>([]);
  simpleProducts = signal<Product[]>([]);
  loading = signal(true);
  savingBom = signal(false);

  // 'actions' y 'name' eliminados: gestión de empaques movida al tab global de Catálogo
  presCols = ['hierarchy', 'unit_abbr', 'factor_to_base', 'quantity_per_parent', 'is_purchase_default', 'is_active'];
  bomCols = ['sort_order', 'component_code', 'component_name', 'quantity_per_kit', 'actions'];

  // BOM form
  bomForm = this.fb.group({ components: this.fb.array([]) });
  get bomArray(): FormArray { return this.bomForm.get('components') as FormArray; }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.svc.getUnits().subscribe({ next: r => this.units.set(r.data) });
    this.svc.getProducts({ product_type: 'simple', is_active: 'true' }).subscribe({ next: r => this.simpleProducts.set(r.data) });
    this.loadProduct(id);
  }

  loadProduct(id: number): void {
    this.loading.set(true);
    this.svc.getProduct(id).subscribe({
      next: r => {
        this.product.set(r.data);
        this.loading.set(false);
        if (r.data.product_type === 'simple') this.loadPresentations(id);
        else this.loadComponents(id);
      },
      error: () => { this.loading.set(false); this.router.navigate(['/catalog']); },
    });
  }

  loadPresentations(productId: number): void {
    this.svc.getPresentations(productId).subscribe({ next: r => this.presentations.set(r.data) });
  }

  loadComponents(productId: number): void {
    this.svc.getKitComponents(productId).subscribe({
      next: r => {
        this.components.set(r.data);
        this.rebuildBomForm(r.data);
      },
    });
  }

  rebuildBomForm(components: KitComponent[]): void {
    while (this.bomArray.length) this.bomArray.removeAt(0);
    components.forEach(c => {
      this.bomArray.push(this.fb.group({
        component_product_id: [c.component_product_id, Validators.required],
        quantity_per_kit: [c.quantity_per_kit, [Validators.required, Validators.min(1)]],
        sort_order: [c.sort_order ?? 0],
        notes: [c.notes ?? ''],
      }));
    });
  }

  addBomRow(): void {
    this.bomArray.push(this.fb.group({
      component_product_id: [null as number | null, Validators.required],
      quantity_per_kit: [1, [Validators.required, Validators.min(1)]],
      sort_order: [this.bomArray.length + 1],
      notes: [''],
    }));
  }

  removeBomRow(i: number): void { this.bomArray.removeAt(i); }

  saveBom(): void {
    if (this.bomForm.invalid || this.savingBom()) return;
    const p = this.product();
    if (!p) return;
    this.savingBom.set(true);
    const components = (this.bomForm.value.components as any[]).map(c => ({
      component_product_id: c.component_product_id,
      quantity_per_kit: c.quantity_per_kit,
      sort_order: c.sort_order ?? 0,
      notes: c.notes || null,
    }));
    this.svc.syncKitComponents(p.id, components).subscribe({
      next: () => {
        this.savingBom.set(false);
        this.snack.open('Receta actualizada', 'OK', { duration: 3000 });
        this.loadComponents(p.id);
      },
      error: err => {
        this.savingBom.set(false);
        this.snack.open(err.error?.message || 'Error al guardar receta', 'OK', { duration: 4000 });
      },
    });
  }

  /** Navega al tab global de Empaques/Presentaciones en Catálogo */
  goToGlobalPresentations(): void {
    this.router.navigate(['/catalog'], { queryParams: { tab: 4 } });
  }

  back(): void { this.router.navigate(['/catalog']); }

  getProductTypeBadge(type: string): string {
    return type === 'kit' ? '🧩 Kit' : '📦 Simple';
  }

  /** Devuelve la abreviatura de la unidad de medida de una presentación */
  getUnitAbbr(uomId: number): string {
    return this.units().find(u => u.id === uomId)?.abbreviation ?? '—';
  }

  /** Prefijo visual de jerarquía: Caja → ── Paquete → ──── Unidad */
  getHierarchyPrefix(level: number): string {
    if (level <= 1) return '';
    return '─'.repeat((level - 1) * 2) + ' ';
  }

  /** Presentaciones ordenadas de mayor a menor nivel para mostrar el árbol */
  get sortedPresentations(): ProductPresentation[] {
    return [...this.presentations()].sort((a, b) => a.level - b.level || a.sort_order - b.sort_order);
  }

  /** Nombre de la presentación padre dada su id */
  getParentPresName(parentId: number | null): string {
    if (!parentId) return '—';
    return this.presentations().find(p => p.id === parentId)?.name ?? '—';
  }
}

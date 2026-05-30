import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators, FormArray } from '@angular/forms';
import { forkJoin } from 'rxjs';
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
import { MatDialog } from '@angular/material/dialog';
import { CatalogService, Product, ProductPresentation, KitComponent, UnitOfMeasure, SanitaryRegistration } from '../catalog.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PresentationFormDialogComponent, PresentationDialogData } from './presentation-form-dialog.component';
import { SanitaryRegistrationFormDialogComponent, SanitaryRegistrationDialogData } from './sanitary-registration-form-dialog.component';

@Component({
  selector: 'app-product-detail-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTabsModule, MatTableModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSlideToggleModule, MatProgressSpinnerModule,
    MatTooltipModule, MatChipsModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective,
    ConfirmDialogComponent, PresentationFormDialogComponent,
    SanitaryRegistrationFormDialogComponent,
  ],
  templateUrl: './product-detail-page.component.html',
  styleUrl: './product-detail-page.component.scss',
})
export class ProductDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private svc = inject(CatalogService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private fb = inject(FormBuilder);

  product               = signal<Product | null>(null);
  presentations         = signal<ProductPresentation[]>([]);
  components            = signal<KitComponent[]>([]);
  units                 = signal<UnitOfMeasure[]>([]);
  sanitaryRegistrations = signal<SanitaryRegistration[]>([]);
  /** Todas las presentaciones del catálogo global (para el selector de padre en el dialog) */
  catalogPresentations = signal<ProductPresentation[]>([]);
  allActiveProducts     = signal<Product[]>([]);
  loading               = signal(true);
  savingBom             = signal(false);

  /**
   * Signal computado: productos disponibles como componentes del kit.
   * Excluye el producto actual para evitar referencias circulares.
   * Al ser computed(), Angular re-evalúa automáticamente cuando
   * allActiveProducts o product cambian.
   */
  availableComponents = computed(() => {
    const currentId = this.product()?.id;
    return this.allActiveProducts().filter(p => p.id !== currentId);
  });

  presCols = ['actions', 'hierarchy', 'unit_abbr', 'factor_to_base', 'quantity_per_parent', 'is_purchase_default', 'is_active'];
  bomCols  = ['sort_order', 'component_code', 'component_name', 'quantity_per_kit', 'actions'];
  regCols  = ['actions', 'registration_number', 'expiry_date', 'is_expired', 'is_active'];

  // BOM form
  bomForm = this.fb.group({ components: this.fb.array([]) });
  get bomArray(): FormArray { return this.bomForm.get('components') as FormArray; }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    // Datos maestros para el diálogo de presentaciones
    this.svc.getUnits().subscribe({ next: r => this.units.set(r.data) });
    this.svc.getCatalogPresentations().subscribe({ next: r => this.catalogPresentations.set(r.data) });
    this.loadProduct(id);
  }

  loadProduct(id: number): void {
    this.loading.set(true);
    this.svc.getProduct(id).subscribe({
      next: r => {
        this.product.set(r.data);
        this.loading.set(false);
        if (r.data.product_type === 'simple') {
          this.loadPresentations(id);
        } else {
          this.loadComponents(id);
        }
        if (r.data.classification?.has_sanitary_registration) {
          this.loadSanitaryRegistrations(id);
        }
      },
      error: () => { this.loading.set(false); this.router.navigate(['/catalog']); },
    });
  }

  loadPresentations(productId: number): void {
    this.svc.getPresentations(productId).subscribe({ next: r => this.presentations.set(r.data ?? []) });
  }

  loadSanitaryRegistrations(productId: number): void {
    this.svc.getSanitaryRegistrations(productId).subscribe({ next: r => this.sanitaryRegistrations.set(r.data ?? []) });
  }

  /**
   * Carga los componentes del kit y el catálogo de productos activos en paralelo
   * con forkJoin. De esta forma, cuando rebuildBomForm establece los valores del
   * formulario, las mat-option ya están disponibles y los selects muestran
   * correctamente los componentes guardados.
   *
   * GET /api/v1/products/{productId}/kit-components
   */
  loadComponents(productId: number): void {
    forkJoin({
      comps:    this.svc.getKitComponents(productId),
      products: this.svc.getProducts({ is_active: '1', per_page: 9999 }),
    }).subscribe({
      next: ({ comps, products }) => {
        this.allActiveProducts.set(products.data);
        this.components.set(comps.data);
        this.rebuildBomForm(comps.data);
      },
      error: err => {
        this.snack.open(err.error?.message || 'Error al cargar componentes del kit', 'OK', { duration: 4000 });
      },
    });
  }

  rebuildBomForm(components: KitComponent[]): void {
    while (this.bomArray.length) this.bomArray.removeAt(0);
    components.forEach(c => {
      this.bomArray.push(this.fb.group({
        id:                   [c.id],                                            // id del servidor (null = fila nueva)
        component_product_id: [Number(c.component_product_id), Validators.required],
        quantity_per_kit:     [c.quantity_per_kit, [Validators.required, Validators.min(1)]],
        sort_order:           [c.sort_order ?? 0],
        notes:                [c.notes ?? ''],
      }));
    });
  }

  addBomRow(): void {
    this.bomArray.push(this.fb.group({
      id:                   [null],                                              // sin id → fila nueva no persistida
      component_product_id: [null as number | null, Validators.required],
      quantity_per_kit:     [1, [Validators.required, Validators.min(1)]],
      sort_order:           [this.bomArray.length + 1],
      notes:                [''],
    }));
  }

  /**
   * Elimina un componente del kit.
   * - Fila nueva (sin id): se quita directo del FormArray sin llamar a la API.
   * - Fila persistida (con id): pide confirmación y llama a
   *   DELETE /api/v1/products/{productId}/kit-components/{componentId}
   */
  deleteKitComponent(index: number): void {
    const ctrl       = this.bomArray.at(index);
    const componentId: number | null = ctrl.get('id')?.value ?? null;

    // Fila no guardada aún → eliminar localmente
    if (!componentId) {
      this.bomArray.removeAt(index);
      return;
    }

    const p = this.product();
    if (!p) return;

    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title:        'Eliminar componente',
        message:      '¿Eliminar este componente del kit? Esta acción no se puede deshacer.',
        confirmColor: 'warn',
      },
      width: '420px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.deleteKitComponent(p.id, componentId).subscribe({
        next: () => {
          this.snack.open('Componente eliminado del kit', 'OK', { duration: 3000 });
          this.bomArray.removeAt(index);
          this.components.update(comps => comps.filter(c => c.id !== componentId));
        },
        error: err => {
          this.snack.open(err.error?.message || 'Error al eliminar componente', 'OK', { duration: 4000 });
        },
      });
    });
  }

  /**
   * Sincroniza la receta completa del kit.
   * PUT /api/v1/products/{productId}/kit-components  →  body: { components: [...] }
   */
  saveBom(): void {
    if (this.bomForm.invalid || this.savingBom()) return;
    const p = this.product();
    if (!p) return;
    this.savingBom.set(true);
    const components = (this.bomForm.value.components as any[]).map(c => ({
      component_product_id: Number(c.component_product_id),
      quantity_per_kit:     c.quantity_per_kit,
      sort_order:           c.sort_order ?? 0,
      notes:                c.notes || null,
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

  /** Abre el wizard para crear o editar un empaque del producto actual */
  openPresentationForm(pres?: ProductPresentation): void {
    const p = this.product();
    if (!p) return;
    // Las opciones de padre son el catálogo global excluyendo la presentación en edición
    const catalogPres = pres
      ? this.catalogPresentations().filter(pr => pr.id !== pres.id)
      : this.catalogPresentations();
    const data: PresentationDialogData = {
      presentation: pres ?? null,
      productId: p.id,
      productName: p.name,
      units: this.units(),
      catalogPresentations: catalogPres,
    };
    this.dialog.open(PresentationFormDialogComponent, { data, width: '640px', maxHeight: '92vh' })
      .afterClosed().subscribe(saved => {
        if (saved) {
          this.snack.open(pres ? 'Empaque actualizado' : 'Empaque creado y vinculado', 'OK', { duration: 3000 });
          this.loadPresentations(p.id);
          // Actualizar catálogo local con el nuevo empaque
          this.svc.getCatalogPresentations().subscribe({ next: r => this.catalogPresentations.set(r.data) });
        }
      });
  }

  /**
   * Desvincula un empaque de este producto (no lo elimina del catálogo global).
   * DELETE /api/v1/products/{productId}/presentations/{presentationId}
   */
  deletePresentation(pres: ProductPresentation): void {
    const p = this.product();
    if (!p) return;
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Desvincular empaque',
        message: `¿Quitar el empaque "${pres.name}" de este producto?\nEl empaque seguirá disponible en el catálogo global.`,
        confirmColor: 'warn',
      },
      width: '420px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.detachPresentation(p.id, pres.id).subscribe({
        next: () => {
          this.snack.open('Empaque desvinculado del producto', 'OK', { duration: 3000 });
          this.loadPresentations(p.id);
        },
        error: err => this.snack.open(err.error?.message || 'Error al desvincular', 'OK', { duration: 4000 }),
      });
    });
  }

  openSanitaryRegForm(reg?: SanitaryRegistration): void {
    const p = this.product();
    if (!p) return;
    const data: SanitaryRegistrationDialogData = {
      registration: reg ?? null,
      productId:    p.id,
      productName:  p.name,
    };
    this.dialog.open(SanitaryRegistrationFormDialogComponent, { data, width: '480px' })
      .afterClosed().subscribe(saved => {
        if (saved) {
          this.snack.open(reg ? 'Registro sanitario actualizado' : 'Registro sanitario creado', 'OK', { duration: 3000 });
          this.loadSanitaryRegistrations(p.id);
        }
      });
  }

  deleteSanitaryReg(reg: SanitaryRegistration): void {
    const p = this.product();
    if (!p) return;
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title:        'Eliminar registro sanitario',
        message:      `¿Eliminar el registro "${reg.registration_number}"? Esta acción no se puede deshacer.`,
        confirmColor: 'warn',
      },
      width: '420px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.deleteSanitaryRegistration(p.id, reg.id).subscribe({
        next: () => {
          this.snack.open('Registro sanitario eliminado', 'OK', { duration: 3000 });
          this.sanitaryRegistrations.update(regs => regs.filter(r => r.id !== reg.id));
        },
        error: err => this.snack.open(err.error?.message || 'Error al eliminar', 'OK', { duration: 4000 }),
      });
    });
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

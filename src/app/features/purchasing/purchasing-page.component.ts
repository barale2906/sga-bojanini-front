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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SelectionModel } from '@angular/cdk/collections';
import { PurchasingService, PurchaseOrder, ReorderSuggestion } from './purchasing.service';
import { CatalogService } from '../catalog/catalog.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import { PaginationMeta } from '../../core/models/api-response.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PurchaseOrderFormDialogComponent } from './order-form/purchase-order-form-dialog.component';
import { PurchaseOrderDetailDialogComponent } from './order-detail/purchase-order-detail-dialog.component';

@Component({
  selector: 'app-purchasing-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTabsModule, MatTableModule, MatPaginatorModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule, MatCheckboxModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective, DateFormatPipe,
  ],
  templateUrl: './purchasing-page.component.html',
  styleUrl: './purchasing-page.component.scss',
})
export class PurchasingPageComponent implements OnInit {
  private svc = inject(PurchasingService);
  private cSvc = inject(CatalogService);
  private wSvc = inject(WarehouseService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  orders = signal<PurchaseOrder[]>([]);
  meta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  suggestions = signal<ReorderSuggestion[]>([]);
  loading = signal(false);

  cols = ['actions', 'code', 'supplier', 'warehouse', 'status', 'total', 'created_at'];
  suggCols = ['select', 'product', 'current_stock', 'reorder_point', 'suggested_qty', 'supplier', 'actions'];
  filters = this.fb.group({ status: [''] });
  selectedSugg = new SelectionModel<ReorderSuggestion>(true, []);

  statuses = ['draft','pending_approval','approved','sent','partially_received','received','rejected','cancelled'];

  suppliers = signal<any[]>([]);
  warehouses = signal<any[]>([]);
  products = signal<any[]>([]);

  ngOnInit(): void {
    this.loadOrders();
    this.loadSuggestions();
    this.cSvc.getSuppliers({ per_page: 200 }).subscribe({ next: r => this.suppliers.set(r.data ?? []), error: () => {} });
    this.wSvc.getWarehouses().subscribe({ next: r => this.warehouses.set(r.data ?? []), error: () => {} });
    this.cSvc.getProducts({ per_page: 200, product_type: 'simple' }).subscribe({ next: r => this.products.set(r.data ?? []), error: () => {} });
    this.filters.get('status')!.valueChanges.subscribe(() => this.loadOrders(1));
  }

  loadOrders(page = 1): void {
    this.loading.set(true);
    const { status } = this.filters.value;
    this.svc.getOrders({ status: status || undefined, per_page: this.meta().per_page, page }).subscribe({
      next: r => { this.orders.set(r.data ?? []); this.meta.set(r.meta); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadSuggestions(): void {
    this.svc.getSuggestions().subscribe({
      next: r => { this.suggestions.set(r.data ?? []); this.selectedSugg.clear(); },
      error: () => {},
    });
  }

  openNewOrder(): void {
    this.dialog.open(PurchaseOrderFormDialogComponent, {
      data: { order: null, suppliers: this.suppliers(), warehouses: this.warehouses(), products: this.products(), purchasingSvc: this.svc, catalogSvc: this.cSvc },
      width: '900px', maxWidth: '95vw', maxHeight: '90vh',
    }).afterClosed().subscribe(ok => {
      if (ok) {
        this.snack.open('Orden creada', 'OK', { duration: 3000 });
        this.loadOrders();
        this.loadSuggestions();
      }
    });
  }

  openDetail(order: PurchaseOrder): void {
    this.dialog.open(PurchaseOrderDetailDialogComponent, {
      data: { order, purchasingSvc: this.svc, warehouses: this.warehouses() },
      width: '1000px', maxWidth: '96vw', maxHeight: '92vh',
    }).afterClosed().subscribe(() => this.loadOrders(this.meta().current_page));
  }

  onPage(e: PageEvent): void { this.meta.update(m => ({ ...m, per_page: e.pageSize })); this.loadOrders(e.pageIndex + 1); }

  getStatusClass(status: string): string {
    const m: Record<string, string> = {
      draft: 'st-draft', pending_approval: 'st-pending', approved: 'st-approved',
      sent: 'st-sent', partially_received: 'st-partial', received: 'st-done',
      rejected: 'st-rejected', cancelled: 'st-cancelled',
    };
    return m[status] || '';
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  }

  isAllSuggSelected(): boolean {
    return this.suggestions().length > 0 && this.selectedSugg.selected.length === this.suggestions().length;
  }

  toggleAllSugg(): void {
    if (this.isAllSuggSelected()) {
      this.selectedSugg.clear();
    } else {
      this.suggestions().forEach(s => this.selectedSugg.select(s));
    }
  }

  createOrdersFromSuggestions(): void {
    const selected = this.selectedSugg.selected;
    if (!selected.length) return;

    const groupMap = new Map<string, { supplier: ReorderSuggestion['preferred_supplier'] | null; items: ReorderSuggestion[] }>();
    for (const s of selected) {
      const key = s.preferred_supplier ? String(s.preferred_supplier.id) : '__sin_proveedor__';
      if (!groupMap.has(key)) groupMap.set(key, { supplier: s.preferred_supplier ?? null, items: [] });
      groupMap.get(key)!.items.push(s);
    }
    const groups = Array.from(groupMap.values());
    this.openSuggOrderSequentially(groups, 0);
  }

  private openSuggOrderSequentially(
    groups: Array<{ supplier: ReorderSuggestion['preferred_supplier'] | null; items: ReorderSuggestion[] }>,
    index: number
  ): void {
    if (index >= groups.length) return;
    const group = groups[index];
    const total = groups.length;

    this.dialog.open(PurchaseOrderFormDialogComponent, {
      data: {
        order: null,
        suppliers: this.suppliers(),
        warehouses: this.warehouses(),
        products: this.products(),
        purchasingSvc: this.svc,
        catalogSvc: this.cSvc,
        prefillSupplierId: group.supplier?.id ?? null,
        prefillItems: group.items.map(s => ({ product_id: s.product_id, suggested_quantity: s.suggested_quantity })),
        orderLabel: total > 1 ? `Orden ${index + 1} de ${total}${group.supplier ? ' — ' + group.supplier.name : ''}` : null,
      },
      width: '900px', maxWidth: '95vw', maxHeight: '90vh',
    }).afterClosed().subscribe(ok => {
      if (ok) {
        const msg = total > 1 ? `Orden ${index + 1}/${total} creada` : 'Orden creada';
        this.snack.open(msg, 'OK', { duration: 3000 });
        this.loadOrders();
        // Eliminar inmediatamente los productos gestionados de la lista
        const orderedIds = new Set(group.items.map(s => s.product_id));
        this.suggestions.update(list => list.filter(s => !orderedIds.has(s.product_id)));
        group.items.forEach(s => this.selectedSugg.deselect(s));
        // Recargar desde el backend para sincronizar estado real
        this.loadSuggestions();
      }
      this.openSuggOrderSequentially(groups, index + 1);
    });
  }
}

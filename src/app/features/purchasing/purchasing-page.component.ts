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
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PurchasingService, PurchaseOrder } from './purchasing.service';
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
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule,
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
  suggestions = signal<any[]>([]);
  loading = signal(false);

  cols = ['actions', 'code', 'supplier', 'warehouse', 'status', 'total', 'created_at'];
  suggCols = ['product', 'current_stock', 'reorder_point', 'suggested_qty', 'supplier'];
  filters = this.fb.group({ status: [''] });

  statuses = ['draft','pending_approval','approved','sent','partially_received','received','rejected','cancelled'];

  suppliers = signal<any[]>([]);
  warehouses = signal<any[]>([]);
  products = signal<any[]>([]);

  ngOnInit(): void {
    this.loadOrders();
    this.loadSuggestions();
    this.cSvc.getSuppliers({ per_page: 200 }).subscribe({ next: r => this.suppliers.set(r.data), error: () => {} });
    this.wSvc.getWarehouses().subscribe({ next: r => this.warehouses.set(r.data), error: () => {} });
    this.cSvc.getProducts({ per_page: 200, product_type: 'simple' }).subscribe({ next: r => this.products.set(r.data), error: () => {} });
    this.filters.get('status')!.valueChanges.subscribe(() => this.loadOrders(1));
  }

  loadOrders(page = 1): void {
    this.loading.set(true);
    const { status } = this.filters.value;
    this.svc.getOrders({ status: status || undefined, per_page: this.meta().per_page, page }).subscribe({
      next: r => { this.orders.set(r.data); this.meta.set(r.meta); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadSuggestions(): void {
    this.svc.getSuggestions().subscribe({ next: r => this.suggestions.set(r.data), error: () => {} });
  }

  openNewOrder(): void {
    this.dialog.open(PurchaseOrderFormDialogComponent, {
      data: { order: null, suppliers: this.suppliers(), warehouses: this.warehouses(), products: this.products(), purchasingSvc: this.svc, catalogSvc: this.cSvc },
      width: '900px', maxWidth: '95vw', maxHeight: '90vh',
    }).afterClosed().subscribe(ok => { if (ok) { this.snack.open('Orden creada', 'OK', { duration: 3000 }); this.loadOrders(); } });
  }

  openDetail(order: PurchaseOrder): void {
    this.dialog.open(PurchaseOrderDetailDialogComponent, {
      data: { order, purchasingSvc: this.svc, warehouses: this.warehouses() },
      width: '900px', maxWidth: '95vw', maxHeight: '90vh',
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
}

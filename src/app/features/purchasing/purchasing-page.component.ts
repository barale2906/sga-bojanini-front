import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
import { PurchasingService, PurchaseOrder, ReorderSuggestion, ApprovalFlow, ConsolidatedOrder } from './purchasing.service';
import { ExpenseOrderService, ExpenseOrder } from './expense-orders/expense-order.service';
import { ExpenseOrderFormDialogComponent } from './expense-orders/expense-order-form-dialog.component';
import { ExpenseOrderDetailDialogComponent } from './expense-orders/expense-order-detail-dialog.component';
import { ExpenseOrderPdfService } from './services/expense-order-pdf.service';
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
import { PurchaseOrderPdfService } from './services/purchase-order-pdf.service';
import { ConsolidatedOrderPdfService } from './services/consolidated-order-pdf.service';
import { ApprovalFlowFormDialogComponent } from './approval-flows/approval-flow-form-dialog.component';
import { ConsolidatedOrderDetailDialogComponent } from './consolidation/consolidated-order-detail-dialog.component';

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
  private svc        = inject(PurchasingService);
  private expenseSvc = inject(ExpenseOrderService);
  private cSvc       = inject(CatalogService);
  private wSvc       = inject(WarehouseService);
  private dialog     = inject(MatDialog);
  private snack      = inject(MatSnackBar);
  private fb         = inject(FormBuilder);
  private router     = inject(Router);
  private pdfSvc     = inject(PurchaseOrderPdfService);
  private occPdfSvc  = inject(ConsolidatedOrderPdfService);
  private ogPdfSvc   = inject(ExpenseOrderPdfService);

  orders = signal<PurchaseOrder[]>([]);
  meta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  suggestions = signal<ReorderSuggestion[]>([]);
  approvalFlows = signal<ApprovalFlow[]>([]);
  loading = signal(false);
  pdfLoadingId = signal<number | null>(null);

  // Órdenes de Gasto
  expenseOrders      = signal<ExpenseOrder[]>([]);
  expenseMeta        = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  loadingExpense     = signal(false);
  ogPdfLoadingId     = signal<number | null>(null);
  ogFilters          = this.fb.group({ status: [''], payment_status: [''] });
  ogCols             = ['actions', 'code', 'supplier', 'status', 'payment_status', 'total', 'created_at'];
  ogStatuses         = ['draft','pending_approval','approved','sent','partially_received','received','rejected','cancelled'];
  ogPaymentStatuses  = ['unpaid', 'partial', 'paid'];

  // Consolidados
  consolidatedOrders  = signal<ConsolidatedOrder[]>([]);
  consolidatedMeta    = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  loadingConsolidated = signal(false);
  occPdfLoadingId     = signal<number | null>(null);
  occFilters          = this.fb.group({ date_from: [''], date_to: [''] });
  occCols             = ['code', 'supplier', 'period', 'total', 'created_at', 'occ_actions'];

  cols = ['actions', 'code', 'supplier', 'warehouse', 'status', 'total', 'created_at'];
  suggCols = ['actions', 'select', 'product', 'current_stock', 'reorder_point', 'suggested_qty', 'supplier'];
  filters = this.fb.group({ status: [''] });
  selectedSugg = new SelectionModel<ReorderSuggestion>(true, []);

  statuses = ['draft','pending_approval','approved','sent','partially_received','received','rejected','cancelled'];

  suppliers = signal<any[]>([]);
  warehouses = signal<any[]>([]);
  products = signal<any[]>([]);

  ngOnInit(): void {
    this.loadOrders();
    this.loadSuggestions();
    this.loadApprovalFlows();
    this.loadConsolidatedOrders();
    this.loadExpenseOrders();
    this.cSvc.getSuppliers({ per_page: 200 }).subscribe({ next: r => this.suppliers.set(r.data ?? []), error: () => {} });
    this.wSvc.getWarehouses().subscribe({ next: r => this.warehouses.set(r.data ?? []), error: () => {} });
    this.cSvc.getProducts({ per_page: 200, product_type: 'simple' }).subscribe({ next: r => this.products.set(r.data ?? []), error: () => {} });
    this.filters.get('status')!.valueChanges.subscribe(() => this.loadOrders(1));
    this.ogFilters.valueChanges.subscribe(() => this.loadExpenseOrders(1));
  }

  loadConsolidatedOrders(page = 1): void {
    this.loadingConsolidated.set(true);
    const { date_from, date_to } = this.occFilters.value;
    this.svc.getConsolidatedOrders({
      date_from: date_from || undefined,
      date_to: date_to || undefined,
      per_page: this.consolidatedMeta().per_page,
      page,
    }).subscribe({
      next: r => {
        this.consolidatedOrders.set(r.data ?? []);
        this.consolidatedMeta.set(r.meta);
        this.loadingConsolidated.set(false);
      },
      error: () => this.loadingConsolidated.set(false),
    });
  }

  openConsolidatedDetail(occ: ConsolidatedOrder): void {
    this.dialog.open(ConsolidatedOrderDetailDialogComponent, {
      data: { order: occ, purchasingSvc: this.svc },
      width: '1000px', maxWidth: '96vw', maxHeight: '92vh',
    });
  }

  downloadOccPdf(occ: ConsolidatedOrder): void {
    if (this.occPdfLoadingId() !== null) return;
    this.occPdfLoadingId.set(occ.id);
    this.svc.getConsolidatedOrder(occ.id).subscribe({
      next: r => { this.occPdfLoadingId.set(null); this.occPdfSvc.generate(r.data!); },
      error: () => { this.occPdfLoadingId.set(null); this.snack.open('No se pudo generar el PDF', 'OK', { duration: 3000 }); },
    });
  }

  onOccPage(e: PageEvent): void {
    this.consolidatedMeta.update(m => ({ ...m, per_page: e.pageSize }));
    this.loadConsolidatedOrders(e.pageIndex + 1);
  }

  goToConsolidar(): void {
    this.router.navigate(['/purchasing/consolidar']);
  }

  viewConsolidatedFromOrder(consolidatedOrderId: number): void {
    this.svc.getConsolidatedOrder(consolidatedOrderId).subscribe({
      next: r => this.openConsolidatedDetail(r.data!),
      error: () => this.snack.open('No se pudo cargar el consolidado', 'OK', { duration: 3000 }),
    });
  }

  formatPeriod(occ: ConsolidatedOrder): string {
    const fmt = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };
    return `${fmt(occ.period_from)} — ${fmt(occ.period_to)}`;
  }

  loadApprovalFlows(): void {
    this.svc.getApprovalFlows().subscribe({ next: r => this.approvalFlows.set(r.data ?? []), error: () => {} });
  }

  loadOrders(page = 1): void {
    this.loading.set(true);
    const { status } = this.filters.value;
    this.svc.getOrders({ status: status || undefined, order_type: 'purchase', per_page: this.meta().per_page, page }).subscribe({
      next: r => {
        // Doble filtro: parámetro al backend + filtro local por código/tipo
        const onlyOC = (r.data ?? []).filter(o =>
          !String(o.code ?? '').startsWith('OG-') &&
          (!(o as any).order_type || (o as any).order_type === 'purchase')
        );
        this.orders.set(onlyOC);
        this.meta.set(r.meta);
        this.loading.set(false);
      },
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
      width: '90vw', maxWidth: '98vw', maxHeight: '92vh',
    }).afterClosed().subscribe(ok => {
      if (ok) {
        this.snack.open('Orden creada', 'OK', { duration: 3000 });
        this.loadOrders();
        this.loadSuggestions();
      }
    });
  }

  openDetail(order: PurchaseOrder): void {
    // Guardia: si el backend devuelve una OG aquí, abrir el diálogo correcto
    if ((order as any).order_type === 'expense' || order.code?.startsWith('OG-')) {
      this.openExpenseDetail(order as any);
      return;
    }
    this.dialog.open(PurchaseOrderDetailDialogComponent, {
      data: {
        order,
        purchasingSvc: this.svc,
        warehouses: this.warehouses(),
        suppliers: this.suppliers(),
        products: this.products(),
        catalogSvc: this.cSvc,
      },
      width: '1000px', maxWidth: '96vw', maxHeight: '92vh',
    }).afterClosed().subscribe((result?: { action: string; order?: PurchaseOrder }) => {
      if (result?.action === 'edit' && result.order) {
        this.openEdit(result.order);
      } else {
        this.loadOrders(this.meta().current_page);
      }
    });
  }

  openEdit(order: PurchaseOrder): void {
    this.dialog.open(PurchaseOrderFormDialogComponent, {
      data: {
        order,
        suppliers: this.suppliers(),
        warehouses: this.warehouses(),
        products: this.products(),
        purchasingSvc: this.svc,
        catalogSvc: this.cSvc,
      },
      width: '90vw', maxWidth: '98vw', maxHeight: '92vh',
    }).afterClosed().subscribe(ok => {
      if (ok) {
        this.snack.open('Orden actualizada', 'OK', { duration: 3000 });
        this.loadOrders(this.meta().current_page);
      }
    });
  }

  confirmDelete(order: PurchaseOrder): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar orden', message: `¿Eliminar la orden ${order.code}? Esta acción no se puede deshacer.` },
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.deleteOrder(order.id).subscribe({
        next: () => { this.snack.open('Orden eliminada', 'OK', { duration: 3000 }); this.loadOrders(this.meta().current_page); },
        error: err => this.snack.open(err.error?.message || 'No se pudo eliminar', 'OK', { duration: 4000 }),
      });
    });
  }

  onPage(e: PageEvent): void { this.meta.update(m => ({ ...m, per_page: e.pageSize })); this.loadOrders(e.pageIndex + 1); }

  downloadPdf(order: PurchaseOrder): void {
    if (this.pdfLoadingId() !== null) return;
    this.pdfLoadingId.set(order.id);
    this.svc.getOrder(order.id).subscribe({
      next: r => {
        this.pdfLoadingId.set(null);
        const data = r.data as any;
        if (data?.order_type === 'expense' || String(data?.code ?? '').startsWith('OG-')) {
          this.ogPdfSvc.generate(data);
        } else {
          this.pdfSvc.generate(r.data);
        }
      },
      error: () => {
        this.pdfLoadingId.set(null);
        this.snack.open('No se pudo generar el PDF', 'OK', { duration: 3000 });
      },
    });
  }

  statusLabel(status: string): string {
    const m: Record<string, string> = {
      draft: 'Borrador', pending_approval: 'Pend. Aprobación', approved: 'Aprobada',
      sent: 'Enviada', partially_received: 'Recibida parcialmente', received: 'Recibida',
      rejected: 'Rechazada', cancelled: 'Cancelada',
    };
    return m[status] || status;
  }

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

  openFlowForm(flow: ApprovalFlow | null = null): void {
    this.dialog.open(ApprovalFlowFormDialogComponent, {
      data: { flow, purchasingSvc: this.svc },
      width: '680px', maxWidth: '95vw', maxHeight: '90vh',
    }).afterClosed().subscribe(result => {
      if (result) {
        this.snack.open(flow ? 'Flujo actualizado' : 'Flujo creado', 'OK', { duration: 3000 });
        this.loadApprovalFlows();
      }
    });
  }

  confirmDeleteFlow(flow: ApprovalFlow): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar flujo', message: `¿Eliminar el flujo "${flow.name}"? Esta acción no se puede deshacer.` },
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.deleteApprovalFlow(flow.id).subscribe({
        next: () => { this.snack.open('Flujo eliminado', 'OK', { duration: 3000 }); this.loadApprovalFlows(); },
        error: err => this.snack.open(err.error?.message || 'No se pudo eliminar', 'OK', { duration: 4000 }),
      });
    });
  }

  toggleFlowActive(flow: ApprovalFlow): void {
    this.svc.updateApprovalFlow(flow.id, { ...flow, is_active: !flow.is_active }).subscribe({
      next: () => this.loadApprovalFlows(),
      error: err => this.snack.open(err.error?.message || 'Error al actualizar', 'OK', { duration: 4000 }),
    });
  }

  flowConditionLabel(flow: ApprovalFlow): string {
    if (!flow.conditions?.amount_gte && flow.conditions?.amount_gte !== 0) return 'Todas las órdenes';
    return `Órdenes ≥ ${this.formatCurrency(flow.conditions.amount_gte)}`;
  }

  // ── Órdenes de Gasto ──────────────────────────────────────────

  loadExpenseOrders(page = 1): void {
    this.loadingExpense.set(true);
    const { status, payment_status } = this.ogFilters.value;
    this.expenseSvc.getOrders({
      status: status || undefined,
      payment_status: payment_status || undefined,
      per_page: this.expenseMeta().per_page,
      page,
    }).subscribe({
      next: r => {
        this.expenseOrders.set(r.data ?? []);
        this.expenseMeta.set(r.meta);
        this.loadingExpense.set(false);
      },
      error: () => this.loadingExpense.set(false),
    });
  }

  openNewExpenseOrder(): void {
    this.dialog.open(ExpenseOrderFormDialogComponent, {
      data: { order: null, expenseSvc: this.expenseSvc },
      width: '90vw', maxWidth: '98vw', maxHeight: '92vh',
    }).afterClosed().subscribe(ok => {
      if (ok) { this.snack.open('Orden de gasto creada', 'OK', { duration: 3000 }); this.loadExpenseOrders(); }
    });
  }

  openExpenseDetail(order: ExpenseOrder): void {
    this.dialog.open(ExpenseOrderDetailDialogComponent, {
      data: { order, expenseSvc: this.expenseSvc },
      width: '92vw', maxWidth: '1300px', maxHeight: '92vh',
    }).afterClosed().subscribe((result?: { action: string; order?: ExpenseOrder }) => {
      if (result?.action === 'edit' && result.order) {
        this.openExpenseEdit(result.order);
      } else {
        this.loadExpenseOrders(this.expenseMeta().current_page);
      }
    });
  }

  openExpenseEdit(order: ExpenseOrder): void {
    this.dialog.open(ExpenseOrderFormDialogComponent, {
      data: { order, expenseSvc: this.expenseSvc },
      width: '90vw', maxWidth: '98vw', maxHeight: '92vh',
    }).afterClosed().subscribe(ok => {
      if (ok) { this.snack.open('Orden de gasto actualizada', 'OK', { duration: 3000 }); this.loadExpenseOrders(this.expenseMeta().current_page); }
    });
  }

  downloadExpensePdf(order: ExpenseOrder): void {
    if (this.ogPdfLoadingId() !== null) return;
    this.ogPdfLoadingId.set(order.id);
    this.expenseSvc.getOrder(order.id).subscribe({
      next: r => { this.ogPdfLoadingId.set(null); this.ogPdfSvc.generate(r.data!); },
      error: () => { this.ogPdfLoadingId.set(null); this.snack.open('No se pudo generar el PDF', 'OK', { duration: 3000 }); },
    });
  }

  onExpensePage(e: PageEvent): void {
    this.expenseMeta.update(m => ({ ...m, per_page: e.pageSize }));
    this.loadExpenseOrders(e.pageIndex + 1);
  }

  ogStatusLabel(status: string): string {
    const m: Record<string, string> = {
      draft: 'Borrador', pending_approval: 'En Aprobación', approved: 'Aprobado',
      sent: 'Enviado', partially_received: 'Recibido Parcial',
      received: 'Recibido', rejected: 'Rechazado', cancelled: 'Cancelado',
    };
    return m[status] || status;
  }

  ogPaymentLabel(s: string): string {
    return { unpaid: 'Sin pago', partial: 'Pago parcial', paid: 'Pagado' }[s] ?? s;
  }

  ogStatusClass(status: string): string {
    const m: Record<string, string> = {
      draft: 'st-draft', pending_approval: 'st-pending', approved: 'st-approved',
      sent: 'st-sent', partially_received: 'st-partial', received: 'st-done',
      rejected: 'st-rejected', cancelled: 'st-cancelled',
    };
    return m[status] || '';
  }

  ogPaymentClass(s: string): string {
    return { unpaid: 'pay-unpaid', partial: 'pay-partial', paid: 'pay-paid' }[s] ?? '';
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
        prefillItems: group.items.map(s => ({ product_variant_id: s.generic_product_id, suggested_quantity: s.suggested_quantity })),
        orderLabel: total > 1 ? `Orden ${index + 1} de ${total}${group.supplier ? ' — ' + group.supplier.name : ''}` : null,
      },
      width: '90vw', maxWidth: '98vw', maxHeight: '92vh',
    }).afterClosed().subscribe(ok => {
      if (ok) {
        const msg = total > 1 ? `Orden ${index + 1}/${total} creada` : 'Orden creada';
        this.snack.open(msg, 'OK', { duration: 3000 });
        this.loadOrders();
        // Eliminar inmediatamente los productos gestionados de la lista
        const orderedIds = new Set(group.items.map(s => s.generic_product_id));
        this.suggestions.update(list => list.filter(s => !orderedIds.has(s.generic_product_id)));
        group.items.forEach(s => this.selectedSugg.deselect(s));
        // Recargar desde el backend para sincronizar estado real
        this.loadSuggestions();
      }
      this.openSuggOrderSequentially(groups, index + 1);
    });
  }
}

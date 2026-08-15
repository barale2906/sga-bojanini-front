import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatStepperModule } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { PurchasingService, ConsolidableSupplier, PurchaseOrder, PurchaseOrderItem, ConsolidationPreviewItem, ConsolidationPreview, TaxBreakdownEntry } from '../purchasing.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';
import { ConsolidatedOrderDetailDialogComponent } from './consolidated-order-detail-dialog.component';

@Component({
  selector: 'app-consolidation-wizard-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatStepperModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule, MatCheckboxModule,
    MatTooltipModule, MatProgressSpinnerModule, MatDividerModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective, DateFormatPipe,
  ],
  templateUrl: './consolidation-wizard-page.component.html',
  styleUrl: './consolidation-wizard-page.component.scss',
})
export class ConsolidationWizardPageComponent implements OnInit {
  private svc    = inject(PurchasingService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snack  = inject(MatSnackBar);
  private fb     = inject(FormBuilder);

  // Estado
  suppliers       = signal<ConsolidableSupplier[]>([]);
  selectedSupplier = signal<ConsolidableSupplier | null>(null);
  inRange          = signal<PurchaseOrder[]>([]);
  pending          = signal<PurchaseOrder[]>([]);
  loadingSuppliers = signal(false);
  loadingOrders    = signal(false);
  creating         = signal(false);

  // IDs seleccionados (signal para reactividad)
  selectedIds = signal<Set<number>>(new Set());

  // Forms
  step1Form   = this.fb.group({ supplier_id: [null as number | null] });
  periodForm  = this.fb.group({ date_from: [''], date_to: [''] });
  confirmForm = this.fb.group({ notes: [''] });

  ocCols            = ['select', 'code', 'warehouse', 'received_at', 'total', 'expand'];
  expandedOrderIds  = signal<Set<number>>(new Set());
  orderDetails      = signal<Record<number, PurchaseOrderItem[]>>({});
  loadingDetails    = signal<Record<number, boolean>>({});

  // Vista previa del backend (paso 3)
  previewItems        = signal<ConsolidationPreviewItem[]>([]);
  previewOcList       = signal<ConsolidationPreview['purchase_orders']>([]);
  previewSubtotal     = signal(0);
  previewTax          = signal(0);
  previewTotal        = signal(0);
  previewTaxBreakdown = signal<TaxBreakdownEntry[]>([]);
  previewLoading      = signal(false);
  previewError        = signal<string | null>(null);

  // Computed: órdenes actualmente seleccionadas (para resumen)
  selectedOrders = computed<PurchaseOrder[]>(() => {
    const ids = this.selectedIds();
    return [...this.inRange(), ...this.pending()].filter(o => ids.has(o.id));
  });

  summarySubtotal = computed(() => this.selectedOrders().reduce((a, o) => a + Number(o.subtotal), 0));
  summaryTax      = computed(() => this.selectedOrders().reduce((a, o) => a + Number(o.tax_amount), 0));
  summaryTotal    = computed(() => this.selectedOrders().reduce((a, o) => a + Number(o.total_amount), 0));


  ngOnInit(): void {
    this.loadSuppliers();
  }

  loadSuppliers(): void {
    this.loadingSuppliers.set(true);
    this.svc.getConsolidableSuppliers().subscribe({
      next: r => { this.suppliers.set(r.data ?? []); this.loadingSuppliers.set(false); },
      error: () => this.loadingSuppliers.set(false),
    });
  }

  onSupplierChange(supplierId: number | null): void {
    const supplier = this.suppliers().find(s => s.id === supplierId) ?? null;
    this.selectedSupplier.set(supplier);
    this.inRange.set([]);
    this.pending.set([]);
    this.selectedIds.set(new Set());
    this.periodForm.reset();
    if (supplierId) this.loadOrders();
  }

  loadOrders(): void {
    const supplierId = this.step1Form.value.supplier_id;
    if (!supplierId) return;
    this.loadingOrders.set(true);
    const { date_from, date_to } = this.periodForm.value;
    this.svc.getConsolidableOrders({
      supplier_id: supplierId,
      date_from: date_from || undefined,
      date_to: date_to || undefined,
    }).subscribe({
      next: r => {
        this.inRange.set(r.data?.in_range ?? []);
        this.pending.set(r.data?.pending ?? []);
        this.selectedIds.set(new Set());
        this.loadingOrders.set(false);
      },
      error: () => this.loadingOrders.set(false),
    });
  }

  // Selección individual
  toggleOrder(order: PurchaseOrder): void {
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(order.id)) next.delete(order.id);
      else next.add(order.id);
      return next;
    });
  }

  isSelected(order: PurchaseOrder): boolean {
    return this.selectedIds().has(order.id);
  }

  // Seleccionar todo "en rango"
  isAllInRangeSelected(): boolean {
    const ids = this.selectedIds();
    return this.inRange().length > 0 && this.inRange().every(o => ids.has(o.id));
  }

  isSomeInRangeSelected(): boolean {
    const ids = this.selectedIds();
    return this.inRange().some(o => ids.has(o.id)) && !this.isAllInRangeSelected();
  }

  toggleAllInRange(): void {
    if (this.isAllInRangeSelected()) {
      this.selectedIds.update(ids => {
        const next = new Set(ids);
        this.inRange().forEach(o => next.delete(o.id));
        return next;
      });
    } else {
      this.selectedIds.update(ids => {
        const next = new Set(ids);
        this.inRange().forEach(o => next.add(o.id));
        return next;
      });
    }
  }

  // Seleccionar todo "pendientes"
  isAllPendingSelected(): boolean {
    const ids = this.selectedIds();
    return this.pending().length > 0 && this.pending().every(o => ids.has(o.id));
  }

  isSomePendingSelected(): boolean {
    const ids = this.selectedIds();
    return this.pending().some(o => ids.has(o.id)) && !this.isAllPendingSelected();
  }

  toggleAllPending(): void {
    if (this.isAllPendingSelected()) {
      this.selectedIds.update(ids => {
        const next = new Set(ids);
        this.pending().forEach(o => next.delete(o.id));
        return next;
      });
    } else {
      this.selectedIds.update(ids => {
        const next = new Set(ids);
        this.pending().forEach(o => next.add(o.id));
        return next;
      });
    }
  }

  // ─── Detalle de ítems por OC ───────────────────────────────────────────────
  isExpanded(order: PurchaseOrder): boolean {
    return this.expandedOrderIds().has(order.id);
  }

  toggleExpand(order: PurchaseOrder): void {
    this.expandedOrderIds.update(ids => {
      const next = new Set(ids);
      if (next.has(order.id)) { next.delete(order.id); }
      else {
        next.add(order.id);
        if (!this.orderDetails()[order.id] && !this.loadingDetails()[order.id]) {
          this.loadOrderDetail(order.id);
        }
      }
      return next;
    });
  }

  loadOrderDetail(id: number): void {
    this.loadingDetails.update(m => ({ ...m, [id]: true }));
    this.svc.getOrder(id).subscribe({
      next: r => {
        this.orderDetails.update(m => ({ ...m, [id]: r.data?.items ?? [] }));
        this.loadingDetails.update(m => ({ ...m, [id]: false }));
      },
      error: () => this.loadingDetails.update(m => ({ ...m, [id]: false })),
    });
  }

  onStepChange(event: any): void {
    if (event.selectedIndex === 2) {
      this.loadConsolidationPreview();
    }
  }

  loadConsolidationPreview(): void {
    const ids = Array.from(this.selectedIds());
    if (!ids.length) return;
    this.previewLoading.set(true);
    this.previewError.set(null);
    this.svc.getConsolidationPreview(ids).subscribe({
      next: r => {
        const d = r.data!;
        this.previewItems.set(d.items ?? []);
        this.previewOcList.set(d.purchase_orders ?? []);
        this.previewSubtotal.set(d.subtotal ?? 0);
        this.previewTax.set(d.tax_amount ?? 0);
        this.previewTotal.set(d.total_amount ?? 0);
        this.previewTaxBreakdown.set(d.tax_breakdown ?? []);
        this.previewLoading.set(false);
      },
      error: err => {
        this.previewError.set(err.error?.message || 'No se pudo cargar la vista previa');
        this.previewLoading.set(false);
      },
    });
  }

  getOrderItems(id: number): PurchaseOrderItem[] {
    return this.orderDetails()[id] ?? [];
  }

  create(): void {
    const ids = Array.from(this.selectedIds());
    if (!ids.length) return;
    this.creating.set(true);
    const notes = this.confirmForm.value.notes?.trim() || undefined;
    this.svc.createConsolidatedOrder({ purchase_order_ids: ids, notes }).subscribe({
      next: r => {
        this.creating.set(false);
        this.snack.open(`Consolidado creado: ${r.data!.code}`, 'OK', { duration: 5000 });
        this.dialog.open(ConsolidatedOrderDetailDialogComponent, {
          data: { order: r.data, purchasingSvc: this.svc },
          width: '1000px', maxWidth: '96vw', maxHeight: '92vh',
        }).afterClosed().subscribe(() => {
          this.router.navigate(['/purchasing']);
        });
      },
      error: err => {
        this.creating.set(false);
        this.snack.open(err.error?.message || 'No se pudo crear el consolidado', 'OK', { duration: 6000 });
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/purchasing']);
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try { return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)); }
    catch { return iso; }
  }
}

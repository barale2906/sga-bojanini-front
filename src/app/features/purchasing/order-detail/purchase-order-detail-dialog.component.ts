import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PurchasingService, PurchaseOrder, PurchaseOrderItem, PurchaseOrderApprovalRecord } from '../purchasing.service';
import { PurchaseReceiveContextService } from '../purchase-receive-context.service';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-purchase-order-detail-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatTableModule, MatProgressSpinnerModule,
    MatDividerModule, MatTooltipModule, DateFormatPipe, FormErrorsComponent, PermissionDirective,
  ],
  templateUrl: './purchase-order-detail-dialog.component.html',
  styleUrl: './purchase-order-detail-dialog.component.scss',
})
export class PurchaseOrderDetailDialogComponent implements OnInit {
  data: {
    order: PurchaseOrder; purchasingSvc: PurchasingService; warehouses: any[];
    suppliers?: any[]; products?: any[]; catalogSvc?: any;
  } = inject(MAT_DIALOG_DATA);
  private ref         = inject(MatDialogRef<PurchaseOrderDetailDialogComponent>);
  private snack       = inject(MatSnackBar);
  private fb          = inject(FormBuilder);
  private router      = inject(Router);
  private receiveCtx  = inject(PurchaseReceiveContextService);
  private authSvc     = inject(AuthService);
  private dialog      = inject(MatDialog);

  order   = signal<PurchaseOrder>(this.data.order);
  saving  = signal(false);
  errors  = signal<string[]>([]);
  commentsForm = this.fb.group({ comments: [''] });

  itemCols = ['product', 'presentation', 'quantity', 'received', 'unit_price', 'tax_rate', 'subtotal'];

  get status()    { return this.order().status; }
  get isDraft()   { return this.status === 'draft'; }
  get isPending() { return this.status === 'pending_approval'; }
  get isApproved(){ return this.status === 'approved'; }
  get isSent()    { return this.status === 'sent'; }
  get canReceive(){ return this.isSent || this.status === 'partially_received'; }

  hasPermission(p: string): boolean { return this.authSvc.hasAnyPermission([p]); }

  statusLabel(status: string): string {
    const m: Record<string, string> = {
      draft: 'Borrador', pending_approval: 'Pendiente de Aprobación', approved: 'Aprobada',
      sent: 'Enviada al Proveedor', partially_received: 'Recibida Parcialmente',
      received: 'Recibida', rejected: 'Rechazada', cancelled: 'Cancelada',
    };
    return m[status] || status;
  }

  /** ¿Algún ítem tiene quantity_received en la respuesta? */
  get hasReceivedTracking(): boolean {
    return (this.order().items ?? []).some(i => i.quantity_received !== undefined);
  }

  ngOnInit(): void {
    this.loadOrder();
  }

  loadOrder(): void {
    this.data.purchasingSvc.getOrder(this.order().id).subscribe({
      next: r => this.order.set(r.data),
      error: () => {},
    });
  }

  action(type: 'submit' | 'approve' | 'reject' | 'send' | 'cancel'): void {
    if (this.saving()) return;
    this.saving.set(true);
    const comments = this.commentsForm.value.comments || '';
    const svc = this.data.purchasingSvc;
    const id  = this.order().id;
    const req$ =
      type === 'submit'  ? svc.submit(id) :
      type === 'approve' ? svc.approve(id, comments) :
      type === 'reject'  ? svc.reject(id, comments) :
      type === 'send'    ? svc.send(id) : svc.cancel(id);

    req$.subscribe({
      next: r => {
        this.order.set(r.data);
        this.saving.set(false);
        this.commentsForm.reset();
        this.errors.set([]);
        this.snack.open('Acción completada', 'OK', { duration: 3000 });
      },
      error: err => {
        this.saving.set(false);
        const msg = err.error?.message || err.error?.error || 'Error al ejecutar la acción';
        this.errors.set([msg]);
      },
    });
  }

  editOrder(): void {
    this.ref.close({ action: 'edit', order: this.order() });
  }

  confirmDelete(): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar orden', message: `¿Eliminar la orden ${this.order().code}? Esta acción no se puede deshacer.` },
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.saving.set(true);
      this.data.purchasingSvc.deleteOrder(this.order().id).subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('Orden eliminada', 'OK', { duration: 3000 });
          this.ref.close({ action: 'deleted' });
        },
        error: err => {
          this.saving.set(false);
          this.errors.set([err.error?.message || 'No se pudo eliminar la orden']);
        },
      });
    });
  }

  goToInventoryEntry(): void {
    this.receiveCtx.setOrder(this.order());
    this.ref.close(null);
    this.router.navigate(['/inventory']);
  }

  approvalStatusIcon(status: string): string {
    return status === 'approved' ? 'check_circle' : status === 'rejected' ? 'cancel' : 'hourglass_empty';
  }

  approvalStatusClass(status: string): string {
    return status === 'approved' ? 'recv-done' : status === 'rejected' ? 'text-danger' : 'text-muted';
  }

  receiveStatusClass(item: PurchaseOrderItem): string {
    const rec = item.quantity_received ?? 0;
    if (rec >= item.quantity_requested) return 'recv-done';
    if (rec > 0) return 'recv-partial';
    return 'recv-pending';
  }

  formatCurrency(v: number | string): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(v));
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PurchasingService, PurchaseOrder, PurchaseOrderItem } from '../purchasing.service';
import { PurchaseReceiveContextService } from '../purchase-receive-context.service';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-purchase-order-detail-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatTableModule, MatProgressSpinnerModule,
    MatDividerModule, DateFormatPipe, FormErrorsComponent,
  ],
  templateUrl: './purchase-order-detail-dialog.component.html',
  styleUrl: './purchase-order-detail-dialog.component.scss',
})
export class PurchaseOrderDetailDialogComponent implements OnInit {
  data: { order: PurchaseOrder; purchasingSvc: PurchasingService; warehouses: any[] } = inject(MAT_DIALOG_DATA);
  private ref         = inject(MatDialogRef<PurchaseOrderDetailDialogComponent>);
  private snack       = inject(MatSnackBar);
  private fb          = inject(FormBuilder);
  private router      = inject(Router);
  private receiveCtx  = inject(PurchaseReceiveContextService);

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
        this.snack.open('Acción completada', 'OK', { duration: 3000 });
      },
      error: err => {
        this.saving.set(false);
        if (err.status === 409) this.errors.set([err.error?.message]);
      },
    });
  }

  goToInventoryEntry(): void {
    this.receiveCtx.setOrder(this.order());
    this.ref.close(null);
    this.router.navigate(['/inventory']);
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

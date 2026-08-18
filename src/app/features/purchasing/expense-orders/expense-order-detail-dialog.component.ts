import { Component, inject, signal, OnInit, computed, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormArray, FormControl, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { COMMA, ENTER, SEMICOLON } from '@angular/cdk/keycodes';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ExpenseOrderService, ExpenseOrder, ExpenseOrderItem, ExpenseOrderPayment } from './expense-order.service';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';

import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'cash',     label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'check',    label: 'Cheque' },
  { value: 'other',    label: 'Otro' },
];

@Component({
  selector: 'app-expense-order-detail-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule, MatProgressSpinnerModule,
    MatDividerModule, MatTooltipModule, MatProgressBarModule, MatChipsModule, MatTabsModule,
    DateFormatPipe, PermissionDirective,
  ],
  templateUrl: './expense-order-detail-dialog.component.html',
  styleUrl: './expense-order-detail-dialog.component.scss',
})
export class ExpenseOrderDetailDialogComponent implements OnInit {
  data: { order: ExpenseOrder; expenseSvc: ExpenseOrderService; suppliers?: any[] } = inject(MAT_DIALOG_DATA);
  private ref     = inject(MatDialogRef<ExpenseOrderDetailDialogComponent>);
  private snack   = inject(MatSnackBar);
  private fb      = inject(FormBuilder);
  private dialog  = inject(MatDialog);
  private authSvc = inject(AuthService);

  order  = signal<ExpenseOrder>(this.data.order);
  saving = signal(false);

  // Panel recepción
  showReceiveForm = signal(false);
  receiveForm: FormArray = this.fb.array([]);

  // Panel pago
  showPaymentForm = signal(false);
  payingFull      = signal(false);
  paymentForm = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    payment_date: ['', Validators.required],
    payment_method: ['transfer', Validators.required],
    reference: [''],
    notes: [''],
  });

  // Panel factura
  showInvoiceForm = signal(false);
  invoiceForm = this.fb.group({
    invoice_number: ['', Validators.required],
    invoice_date: ['', Validators.required],
  });

  // Panel contabilidad
  showAccountingForm = signal(false);
  recipients     = signal<string[]>([]);
  attachments    = signal<File[]>([]);
  recipientCtrl  = new FormControl('');
  readonly separatorKeyCodes = [ENTER, COMMA, SEMICOLON] as const;

  readonly paymentMethods = PAYMENT_METHODS;
  readonly itemCols = ['description', 'unit', 'quantity', 'unit_price', 'tax_rate', 'total'];
  readonly paymentCols = ['date', 'method', 'amount', 'reference', 'registered_by', 'actions'];

  get status()     { return this.order().status; }
  get isDraft()    { return this.status === 'draft'; }
  get isPending()  { return this.status === 'pending_approval'; }
  get isApproved() { return this.status === 'approved'; }
  get isSent()     { return this.status === 'sent'; }
  get canReceive() { return this.isSent || this.status === 'partially_received'; }
  get isFinished() { return ['received', 'cancelled', 'rejected'].includes(this.status); }

  hasPermission(p: string): boolean { return this.authSvc.hasAnyPermission([p]); }

  commentsForm = this.fb.group({ comments: [''] });

  ngOnInit(): void { this.loadOrder(); }

  loadOrder(): void {
    this.data.expenseSvc.getOrder(this.order().id).subscribe({
      next: r => this.order.set(r.data!),
      error: err => {
        if (err.status !== 401) {
          this.snack.open('No se pudo actualizar la orden', 'Cerrar', { duration: 4000, panelClass: ['snack-warn'] });
        }
      },
    });
  }

  // ── Acciones de flujo ────────────────────────────────────────

  action(type: 'submit' | 'send' | 'cancel'): void {
    if (this.saving()) return;
    this.saving.set(true);
    const svc = this.data.expenseSvc;
    const id  = this.order().id;
    const req$ = type === 'submit' ? svc.submit(id) : type === 'send' ? svc.send(id) : svc.cancel(id);
    req$.subscribe({
      next: r => {
        this.order.set(r.data!);
        this.saving.set(false);
        this.loadOrder();
      },
      error: err => {
        this.saving.set(false);
        this.snack.open(err.error?.message || 'Error al ejecutar la acción', 'Cerrar', { duration: 5000, panelClass: ['snack-warn'] });
      },
    });
  }

  approveOrReject(type: 'approve' | 'reject'): void {
    if (this.saving()) return;
    const comments = this.commentsForm.value.comments || '';
    const records = (this.order() as any).approval_records ?? [];
    const pending = records.find((r: any) => r.status === 'pending');
    const recordId: number | null = pending?.id ?? null;
    this.saving.set(true);
    const req$ = type === 'approve'
      ? this.data.expenseSvc.approve(this.order().id, recordId, comments)
      : this.data.expenseSvc.reject(this.order().id, recordId, comments);
    req$.subscribe({
      next: r => {
        this.order.set(r.data!);
        this.saving.set(false);
        this.commentsForm.reset();
        this.loadOrder();
      },
      error: err => {
        this.saving.set(false);
        const msgs = err.status === 422
          ? (Object.values(err.error?.errors ?? {}).flat() as string[]).join(', ') || err.error?.message
          : err.error?.message;
        this.snack.open(msgs || 'Error al aprobar/rechazar', 'Cerrar', { duration: 6000, panelClass: ['snack-warn'] });
      },
    });
  }

  editOrder(): void { this.ref.close({ action: 'edit', order: this.order() }); }

  confirmDelete(): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar orden', message: `¿Eliminar la orden ${this.order().code}? Esta acción no se puede deshacer.` },
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.saving.set(true);
      this.data.expenseSvc.deleteOrder(this.order().id).subscribe({
        next: () => { this.snack.open('Orden eliminada', 'OK', { duration: 3000 }); this.ref.close({ action: 'deleted' }); },
        error: err => { this.saving.set(false); this.snack.open(err.error?.message || 'No se pudo eliminar', 'Cerrar', { duration: 5000, panelClass: ['snack-warn'] }); },
      });
    });
  }

  // ── Recepción ────────────────────────────────────────────────

  openReceiveForm(): void {
    this.receiveForm = this.fb.array(
      (this.order().items ?? [])
        .filter(i => this.pendingQty(i) > 0)
        .map(i => this.fb.group({
          item_id: [i.id!],
          description: [i.description],
          pending: [this.pendingQty(i)],
          quantity_received: [null as number | null, [Validators.min(0.001), Validators.max(this.pendingQty(i))]],
        }))
    );
    this.showReceiveForm.set(true);
  }

  closeReceiveForm(): void { this.showReceiveForm.set(false); }

  submitReceive(): void {
    const items = (this.receiveForm.value as any[])
      .filter(r => r.quantity_received > 0)
      .map(r => ({ item_id: r.item_id, quantity_received: r.quantity_received }));
    if (!items.length) return;
    this.saving.set(true);
    this.data.expenseSvc.receive(this.order().id, items).subscribe({
      next: r => {
        this.order.set(r.data!);
        this.saving.set(false);
        this.showReceiveForm.set(false);
        this.snack.open('Recepción registrada', 'OK', { duration: 3000 });
      },
      error: err => {
        this.saving.set(false);
        this.snack.open(err.error?.message || 'Error al registrar recepción', 'Cerrar', { duration: 5000, panelClass: ['snack-warn'] });
      },
    });
  }

  pendingQty(item: ExpenseOrderItem): number {
    return Math.max(0, Number(item.quantity_requested) - Number(item.quantity_received ?? 0));
  }

  receiveProgress(item: ExpenseOrderItem): number {
    const req = Number(item.quantity_requested);
    if (!req) return 0;
    return Math.min(100, Math.round((Number(item.quantity_received ?? 0) / req) * 100));
  }

  receiveProgressClass(item: ExpenseOrderItem): string {
    const pct = this.receiveProgress(item);
    if (pct >= 100) return 'recv-done';
    if (pct > 0)    return 'recv-partial';
    return 'recv-pending';
  }

  // ── Pagos ────────────────────────────────────────────────────

  openPaymentForm(): void { this.payingFull.set(false); this.showPaymentForm.set(true); }

  openPaymentFormFull(): void {
    const pending = +this.order().total_amount - +this.order().amount_paid;
    this.payingFull.set(true);
    this.showPaymentForm.set(true);
    const today = new Date().toISOString().split('T')[0];
    this.paymentForm.patchValue({ amount: pending, payment_date: today });
  }

  closePaymentForm(): void {
    this.showPaymentForm.set(false);
    this.payingFull.set(false);
    this.paymentForm.reset({ payment_method: 'transfer' });
  }

  savePayment(): void {
    if (this.paymentForm.invalid || this.saving()) return;
    this.saving.set(true);
    const v = this.paymentForm.value as any;
    this.data.expenseSvc.addPayment(this.order().id, {
      amount: v.amount,
      payment_date: v.payment_date,
      payment_method: v.payment_method,
      reference: v.reference || undefined,
      notes: v.notes || undefined,
    }).subscribe({
      next: r => {
        this.order.set(r.data!);
        this.saving.set(false);
        this.showPaymentForm.set(false);
        this.paymentForm.reset({ payment_method: 'transfer' });
        this.snack.open('Pago registrado', 'OK', { duration: 3000 });
      },
      error: err => {
        this.saving.set(false);
        this.snack.open(err.error?.message || 'Error al registrar pago', 'Cerrar', { duration: 5000, panelClass: ['snack-warn'] });
      },
    });
  }

  deletePayment(payment: ExpenseOrderPayment): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar pago', message: `¿Eliminar el pago de ${this.formatCurrency(Number(payment.amount))}?` },
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.saving.set(true);
      this.data.expenseSvc.deletePayment(this.order().id, payment.id).subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('Pago eliminado', 'OK', { duration: 3000 });
          this.loadOrder();
        },
        error: err => { this.saving.set(false); this.snack.open(err.error?.message || 'Error al eliminar pago', 'Cerrar', { duration: 5000, panelClass: ['snack-warn'] }); },
      });
    });
  }

  paymentProgress(): number {
    const total = Number(this.order().total_amount);
    if (!total) return 0;
    return Math.min(100, Math.round((Number(this.order().amount_paid) / total) * 100));
  }

  paymentMethodLabel(method: string): string {
    return this.paymentMethods.find(m => m.value === method)?.label ?? method;
  }

  // ── Factura ──────────────────────────────────────────────────

  openInvoiceForm(): void {
    this.invoiceForm.patchValue({
      invoice_number: this.order().invoice_number || '',
      invoice_date: this.order().invoice_date || '',
    });
    this.showInvoiceForm.set(true);
  }

  closeInvoiceForm(): void { this.showInvoiceForm.set(false); }

  saveInvoice(): void {
    if (this.invoiceForm.invalid || this.saving()) return;
    this.saving.set(true);
    const v = this.invoiceForm.value as any;
    this.data.expenseSvc.registerInvoice(this.order().id, {
      invoice_number: v.invoice_number,
      invoice_date: v.invoice_date,
    }).subscribe({
      next: r => {
        this.order.set(r.data!);
        this.saving.set(false);
        this.showInvoiceForm.set(false);
        this.snack.open('Factura registrada', 'OK', { duration: 3000 });
      },
      error: err => {
        this.saving.set(false);
        this.snack.open(err.error?.message || 'Error al registrar factura', 'Cerrar', { duration: 5000, panelClass: ['snack-warn'] });
      },
    });
  }

  // ── Contabilidad ─────────────────────────────────────────────

  openAccountingForm(): void {
    this.recipients.set([]);
    this.attachments.set([]);
    this.recipientCtrl.setValue('');
    this.showAccountingForm.set(true);
  }
  closeAccountingForm(): void { this.showAccountingForm.set(false); }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.attachments.update(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...files.filter(f => !existing.has(f.name))];
    });
    input.value = '';
  }

  removeAttachment(name: string): void {
    this.attachments.update(a => a.filter(f => f.name !== name));
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  addRecipient(event: MatChipInputEvent): void {
    const value = (event.value ?? '').trim();
    if (value) {
      const ctrl = new FormControl(value, [Validators.email]);
      if (ctrl.valid) {
        const normalized = value.toLowerCase();
        if (!this.recipients().includes(normalized)) {
          this.recipients.update(r => [...r, normalized]);
        }
        event.chipInput?.clear();
        this.recipientCtrl.setValue('', { emitEvent: false });
      }
    }
  }

  removeRecipient(email: string): void {
    this.recipients.update(r => r.filter(e => e !== email));
  }

  sendAccounting(): void {
    const list = this.recipients();
    if (!list.length) {
      this.snack.open('Agrega al menos un destinatario', 'Cerrar', { duration: 4000, panelClass: ['snack-warn'] });
      return;
    }
    this.saving.set(true);
    this.data.expenseSvc.sendAccounting(this.order().id, list, this.attachments()).subscribe({
      next: r => {
        this.order.set(r.data!);
        this.saving.set(false);
        this.showAccountingForm.set(false);
        this.snack.open('Enviado a contabilidad', 'OK', { duration: 3000 });
      },
      error: err => {
        this.saving.set(false);
        this.snack.open(err.error?.message || 'Error al enviar a contabilidad', 'Cerrar', { duration: 5000, panelClass: ['snack-warn'] });
      },
    });
  }

  // ── IVA desglosado ───────────────────────────────────────────

  taxByRate = computed(() => {
    const groups: { rate: number; amount: number }[] = [];
    for (const item of this.order().items ?? []) {
      const rate = Number(item.tax_rate ?? 0);
      if (rate <= 0) continue;
      const taxAmount = item.tax_amount != null
        ? Number(item.tax_amount)
        : Number(item.quantity_requested) * Number(item.unit_price) * (rate / 100);
      const existing = groups.find(g => g.rate === rate);
      if (existing) existing.amount += taxAmount;
      else groups.push({ rate, amount: taxAmount });
    }
    return groups.sort((a, b) => a.rate - b.rate);
  });

  // ── Helpers de presentación ──────────────────────────────────

  statusLabel(status: string): string {
    const m: Record<string, string> = {
      draft: 'Borrador', pending_approval: 'En Aprobación', approved: 'Aprobado',
      sent: 'Enviado', partially_received: 'Recibido Parcial', received: 'Recibido',
      rejected: 'Rechazado', cancelled: 'Cancelado',
    };
    return m[status] || status;
  }

  paymentStatusLabel(s: string): string {
    return { unpaid: 'Sin pago', partial: 'Pago parcial', paid: 'Pagado' }[s] ?? s;
  }

  approvalStatusIcon(s: string): string {
    return s === 'approved' ? 'check_circle' : s === 'rejected' ? 'cancel' : 'hourglass_empty';
  }

  approvalStatusClass(s: string): string {
    return s === 'approved' ? 'recv-done' : s === 'rejected' ? 'text-danger' : 'text-muted';
  }

  formatCurrency(v: number | string): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(v));
  }

  // ── Actividad / timeline ─────────────────────────────────────

  activityLog = computed(() => {
    type ActivityEvent = { date: string; icon: string; text: string; cls: string };
    const events: ActivityEvent[] = [];
    const o = this.order();

    events.push({ date: o.created_at, icon: 'add_circle_outline', text: 'Orden creada', cls: 'ev-created' });

    for (const rec of (o as any).approval_records ?? []) {
      if (rec.decided_at) {
        const ok = rec.status === 'approved';
        events.push({
          date: rec.decided_at,
          icon: ok ? 'check_circle' : 'cancel',
          text: `${ok ? 'Aprobado' : 'Rechazado'} — Paso ${rec.step_order}${rec.approver ? ` por ${rec.approver.name}` : ''}${rec.comments ? ': ' + rec.comments : ''}`,
          cls: ok ? 'ev-approved' : 'ev-rejected',
        });
      }
    }

    if (o.sent_at) events.push({ date: o.sent_at, icon: 'local_shipping', text: 'Enviada al proveedor', cls: 'ev-sent' });

    for (const p of o.payments ?? []) {
      events.push({
        date: p.payment_date,
        icon: 'payments',
        text: `Pago ${this.paymentMethodLabel(p.payment_method)}: ${this.formatCurrency(Number(p.amount))}${p.reference ? ' (Ref: ' + p.reference + ')' : ''}`,
        cls: 'ev-payment',
      });
    }

    const anyReceived = (o.items ?? []).some(i => Number(i.quantity_received ?? 0) > 0);
    if (anyReceived && !o.received_at) {
      events.push({ date: o.updated_at || o.created_at, icon: 'inventory_2', text: 'Recepción parcial registrada', cls: 'ev-partial' });
    }
    if (o.received_at) events.push({ date: o.received_at, icon: 'inventory_2', text: 'Recepción completa registrada', cls: 'ev-received' });

    if (o.invoice_number) {
      events.push({ date: o.invoice_date || o.updated_at || o.created_at, icon: 'receipt_long', text: `Factura registrada: ${o.invoice_number}`, cls: 'ev-invoice' });
    }
    if (o.accounting_sent_at) {
      events.push({ date: o.accounting_sent_at, icon: 'forward_to_inbox', text: 'Enviado a contabilidad', cls: 'ev-accounting' });
    }

    return events.sort((a, b) => a.date.localeCompare(b.date));
  });
}

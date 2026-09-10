import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { finalize } from 'rxjs/operators';
import { ServiceOrdersService, DiscountOrder, ServiceOrderProcedure } from '../service-orders.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-discounts-page',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatTooltipModule, MatSnackBarModule, MatDialogModule,
    PageHeaderComponent, LoadingSpinnerComponent, ConfirmDialogComponent,
  ],
  templateUrl: './discounts-page.component.html',
  styleUrl: './discounts-page.component.scss',
})
export class DiscountsPageComponent implements OnInit {
  private svc    = inject(ServiceOrdersService);
  private snack  = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  loading    = signal(true);
  orders     = signal<DiscountOrder[]>([]);
  approving  = signal<string | null>(null);

  ngOnInit(): void {
    this.loadDiscounts();
  }

  loadDiscounts(): void {
    this.loading.set(true);
    this.svc.getDiscounts()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: r => this.orders.set(r.data),
        error: () => this.orders.set([]),
      });
  }

  approve(order: DiscountOrder): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Aprobar Descuento',
        message: `¿Confirma la aprobación del descuento de la orden ${order.order_number}?\n\nEsta acción notificará al usuario que creó la orden.`,
        confirmText: 'Aprobar',
        confirmColor: 'primary',
      },
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.approving.set(order.order_number);
      this.svc.approveDiscount(order.order_number)
        .pipe(finalize(() => this.approving.set(null)))
        .subscribe({
          next: () => {
            this.snack.open('Descuento aprobado exitosamente', 'OK', { duration: 4000 });
            this.loadDiscounts();
          },
          error: err => {
            this.snack.open(err.error?.message || 'Error al aprobar el descuento', 'Cerrar', { duration: 5000 });
          },
        });
    });
  }

  procedureTotal(proc: ServiceOrderProcedure): number {
    return proc.unit_price * proc.quantity;
  }

  orderGrandTotal(order: DiscountOrder): number {
    return order.records.reduce((sum, r) => sum + r.unit_price * r.quantity, 0);
  }

  orderTotalDiscount(order: DiscountOrder): number {
    return order.records.reduce((sum, r) => sum + (r.discount_amount ?? 0), 0);
  }

  discountLabel(proc: ServiceOrderProcedure): string {
    if (!proc.discount_type) return '—';
    if (proc.discount_type === 'percentage') return `${proc.discount_value}%`;
    return this.formatCurrency(proc.discount_value ?? 0);
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  }

  formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  goToApprovers(): void {
    this.router.navigate(['/service-orders/descuentos/aprobadores']);
  }
}

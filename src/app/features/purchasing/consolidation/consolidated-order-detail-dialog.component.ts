import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PurchasingService, ConsolidatedOrder, TaxBreakdownEntry } from '../purchasing.service';
import { ConsolidatedOrderPdfService } from '../services/consolidated-order-pdf.service';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';

@Component({
  selector: 'app-consolidated-order-detail-dialog',
  standalone: true,
  imports: [
    CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatTableModule,
    MatProgressSpinnerModule, MatDividerModule, MatTooltipModule,
    DateFormatPipe,
  ],
  templateUrl: './consolidated-order-detail-dialog.component.html',
  styleUrl: './consolidated-order-detail-dialog.component.scss',
})
export class ConsolidatedOrderDetailDialogComponent implements OnInit {
  data: { order: ConsolidatedOrder; purchasingSvc: PurchasingService } = inject(MAT_DIALOG_DATA);
  private ref    = inject(MatDialogRef<ConsolidatedOrderDetailDialogComponent>);
  private pdfSvc = inject(ConsolidatedOrderPdfService);
  private snack  = inject(MatSnackBar);

  order   = signal<ConsolidatedOrder>(this.data.order);
  loading = signal(false);

  itemCols = ['product', 'presentation', 'brand_sku', 'quantity', 'unit_price', 'tax_rate', 'tax_amount', 'total'];

  ngOnInit(): void {
    // Si el orden llegó sin items (desde el listado), carga el detalle completo
    if (!this.order().items) {
      this.loading.set(true);
      this.data.purchasingSvc.getConsolidatedOrder(this.order().id).subscribe({
        next: r => { this.order.set(r.data!); this.loading.set(false); },
        error: () => {
          this.snack.open('No se pudo cargar el detalle', 'OK', { duration: 3000 });
          this.loading.set(false);
        },
      });
    }
  }

  print(): void {
    this.pdfSvc.generate(this.order());
  }

  close(): void {
    this.ref.close();
  }

  formatCurrency(v: number | string): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(v));
  }

  formatDateStr(d: string | null): string {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  get includedCodes(): string {
    return (this.order().purchase_orders ?? []).map(p => p.code).join(', ') || '—';
  }

  /** Desglose de IVA por tasa — usa tax_breakdown del backend si existe, sino lo calcula de los ítems */
  get taxBreakdown(): TaxBreakdownEntry[] {
    const breakdown = this.order().tax_breakdown;
    if (breakdown?.length) {
      return breakdown.filter(t => t.rate > 0);
    }
    const map = new Map<number, number>();
    for (const item of this.order().items ?? []) {
      const rate = Number(item.tax_rate ?? 0);
      const amt  = Number(item.tax_amount ?? 0);
      if (rate > 0) map.set(rate, (map.get(rate) ?? 0) + amt);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rate, tax_amount]) => ({ rate, taxable_base: 0, tax_amount }));
  }
}

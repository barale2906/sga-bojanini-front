import { Injectable, inject } from '@angular/core';
import { PdfPrintService } from '../../../shared/services/pdf-print.service';
import { PurchaseOrder, PurchaseOrderItem } from '../purchasing.service';

@Injectable({ providedIn: 'root' })
export class PurchaseOrderPdfService {
  private printer = inject(PdfPrintService);

  generate(order: PurchaseOrder): void {
    const html = this.buildHtml(order);
    this.printer.print(html, `OC-${order.code}`);
  }

  private buildHtml(o: PurchaseOrder): string {
    return `
<div style="max-width:860px; margin:0 auto;">

  <!-- ── Header corporativo ── -->
  <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
    <tr>
      <td style="vertical-align:top;">
        <div style="font-size:22px; font-weight:800; color:#1E2A3B; letter-spacing:-0.5px;">SGA Bojanini</div>
        <div style="font-size:11px; color:#718096; margin-top:2px;">Sistema de Gestión Administrativa</div>
      </td>
      <td style="text-align:right; vertical-align:top;">
        <div style="display:inline-block; background:#FFCF01; color:#1E2A3B; padding:6px 16px; border-radius:6px;">
          <div style="font-size:9px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase;">Orden de Compra</div>
          <div style="font-size:18px; font-weight:800; font-family:monospace;">${o.code}</div>
        </div>
      </td>
    </tr>
  </table>

  <hr style="border:none; border-top:2px solid #FFCF01; margin-bottom:20px;" />

  <!-- ── Info de la orden ── -->
  <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:11px;">
    <tr>
      <td style="width:50%; vertical-align:top; padding-right:16px;">
        <table style="width:100%; border-collapse:collapse;">
          ${this.infoRow('Proveedor', o.supplier?.name ?? '—')}
          ${this.infoRow('Almacén destino', o.warehouse?.name ?? '—')}
          ${this.infoRow('Estado', this.statusLabel(o.status), this.statusStyle(o.status))}
        </table>
      </td>
      <td style="width:50%; vertical-align:top;">
        <table style="width:100%; border-collapse:collapse;">
          ${this.infoRow('Fecha de creación', this.formatDate(o.created_at))}
          ${this.infoRow('Entrega esperada', o.expected_delivery_date ? this.formatDate(o.expected_delivery_date) : 'No especificada')}
          ${this.infoRow('Generado el', this.formatDate(new Date().toISOString()))}
        </table>
      </td>
    </tr>
  </table>

  <!-- ── Tabla de ítems ── -->
  <div style="margin-bottom:20px;">
    <div style="background:#1E2A3B; color:#fff; padding:6px 10px; border-radius:6px 6px 0 0; font-size:11px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase;">
      Detalle de Productos
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:10.5px;">
      <thead>
        <tr style="background:#f7fafc;">
          <th style="${this.th()}">#</th>
          <th style="${this.th()}">Código</th>
          <th style="${this.th('left')}">Producto</th>
          <th style="${this.th()}">Presentación</th>
          <th style="${this.th()}">Cant. Sol.</th>
          ${this.hasReceivedQty(o) ? `<th style="${this.th()}">Cant. Rec.</th>` : ''}
          <th style="${this.th()}">Precio Unit.</th>
          <th style="${this.th()}">IVA %</th>
          <th style="${this.th()}">Total</th>
        </tr>
      </thead>
      <tbody>
        ${(o.items ?? []).map((item, idx) => this.itemRow(item, idx, this.hasReceivedQty(o))).join('')}
        ${(o.items ?? []).length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:12px;color:#a0aec0;">Sin ítems</td></tr>` : ''}
      </tbody>
    </table>
  </div>

  <!-- ── Totales ── -->
  <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
    <tr>
      <td style="width:55%;"></td>
      <td style="width:45%;">
        <table style="width:100%; border-collapse:collapse; font-size:11px;">
          ${this.totalRow('Subtotal', this.formatCurrency(Number(o.subtotal)))}
          ${(o.tax_breakdown ?? []).map(t =>
            this.totalRow(`IVA ${t.tax_rate}%`, this.formatCurrency(t.tax_amount))
          ).join('')}
          ${(!o.tax_breakdown || o.tax_breakdown.length === 0) ?
            this.totalRow('Impuestos', this.formatCurrency(Number(o.tax_amount))) : ''}
          <tr>
            <td style="padding:6px 10px; font-weight:700; font-size:13px; background:#1E2A3B; color:#FFCF01; border-radius:0 0 0 6px;">TOTAL</td>
            <td style="padding:6px 10px; font-weight:700; font-size:13px; background:#1E2A3B; color:#FFCF01; text-align:right; border-radius:0 0 6px 0;">${this.formatCurrency(Number(o.total_amount))}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- ── Notas ── -->
  ${o.notes ? `
  <div style="border:1px solid #e2e8f0; border-radius:6px; padding:10px 14px; margin-bottom:20px; font-size:11px;">
    <div style="font-weight:700; color:#4a5568; margin-bottom:4px;">Notas</div>
    <div style="color:#2d3748;">${o.notes}</div>
  </div>` : ''}

  <!-- ── Footer ── -->
  <hr style="border:none; border-top:1px solid #e2e8f0; margin-bottom:8px;" />
  <div style="display:flex; justify-content:space-between; font-size:9px; color:#a0aec0;">
    <span>SGA Bojanini &mdash; Sistema de Gestión Administrativa</span>
    <span>Documento generado el ${this.formatDate(new Date().toISOString())}</span>
  </div>

</div>`;
  }

  private infoRow(label: string, value: string, valueStyle = ''): string {
    return `<tr>
      <td style="padding:3px 8px 3px 0; color:#718096; font-weight:600; white-space:nowrap;">${label}:</td>
      <td style="padding:3px 0; color:#2d3748; ${valueStyle}">${value}</td>
    </tr>`;
  }

  private itemRow(item: PurchaseOrderItem, idx: number, showReceived: boolean): string {
    const bg = idx % 2 === 0 ? '#fff' : '#f7fafc';
    const td = `padding:5px 8px; border-bottom:1px solid #edf2f7; text-align:center; background:${bg};`;
    const tdL = `padding:5px 8px; border-bottom:1px solid #edf2f7; text-align:left; background:${bg};`;
    const taxRate = item.tax_rate !== undefined ? `${Number(item.tax_rate)}%` : '—';
    const total = item.total_price !== undefined
      ? this.formatCurrency(Number(item.total_price))
      : (item.subtotal !== undefined ? this.formatCurrency(item.subtotal) : '—');

    return `<tr>
      <td style="${td}">${idx + 1}</td>
      <td style="${td}"><code style="font-family:monospace;font-size:10px;background:#EDF2F7;padding:1px 5px;border-radius:3px;">${item.variant?.generic?.barcode ?? '—'}</code></td>
      <td style="${tdL}">${item.variant?.generic?.name ?? '—'}</td>
      <td style="${td}">${item.presentation?.name ?? '—'}</td>
      <td style="${td}">${item.quantity_requested}</td>
      ${showReceived ? `<td style="${td}">${item.quantity_received ?? 0}</td>` : ''}
      <td style="${td}">${this.formatCurrency(Number(item.unit_price))}</td>
      <td style="${td}">${taxRate}</td>
      <td style="${td};font-weight:600;">${total}</td>
    </tr>`;
  }

  private totalRow(label: string, value: string): string {
    return `<tr>
      <td style="padding:4px 10px; color:#4a5568; border-bottom:1px solid #edf2f7;">${label}</td>
      <td style="padding:4px 10px; text-align:right; border-bottom:1px solid #edf2f7;">${value}</td>
    </tr>`;
  }

  private th(align = 'center'): string {
    return `padding:6px 8px; text-align:${align}; color:#4a5568; font-weight:700; border-bottom:2px solid #e2e8f0; background:#f7fafc;`;
  }

  private hasReceivedQty(o: PurchaseOrder): boolean {
    return (o.items ?? []).some(i => i.quantity_received !== undefined);
  }

  private statusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Borrador', pending_approval: 'Pend. Aprobación', approved: 'Aprobada',
      sent: 'Enviada', partially_received: 'Recibida parcialmente',
      received: 'Recibida', rejected: 'Rechazada', cancelled: 'Cancelada',
    };
    return labels[status] ?? status;
  }

  private statusStyle(status: string): string {
    const styles: Record<string, string> = {
      draft: 'color:#4a5568;font-weight:600;',
      pending_approval: 'color:#744210;font-weight:600;',
      approved: 'color:#276749;font-weight:600;',
      sent: 'color:#2b6cb0;font-weight:600;',
      partially_received: 'color:#7b341e;font-weight:600;',
      received: 'color:#276749;font-weight:600;',
      rejected: 'color:#c53030;font-weight:600;',
      cancelled: 'color:#718096;font-weight:600;',
    };
    return styles[status] ?? '';
  }

  private formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  }

  private formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
    } catch {
      return iso;
    }
  }
}

import { Injectable, inject } from '@angular/core';
import { PdfPrintService } from '../../../shared/services/pdf-print.service';
import { ExpenseOrder, ExpenseOrderItem, ExpenseOrderPayment } from '../expense-orders/expense-order.service';

@Injectable({ providedIn: 'root' })
export class ExpenseOrderPdfService {
  private printer = inject(PdfPrintService);

  generate(order: ExpenseOrder): void {
    this.printer.print(this.buildHtml(order), `OG-${order.code}`);
  }

  private buildHtml(o: ExpenseOrder): string {
    return `
<div style="max-width:860px; margin:0 auto;">

  <!-- Header -->
  <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
    <tr>
      <td style="vertical-align:top;">
        <div style="font-size:22px; font-weight:800; color:#1E2A3B; letter-spacing:-0.5px;">SGA Bojanini</div>
        <div style="font-size:11px; color:#718096; margin-top:2px;">Sistema de Gestión Administrativa</div>
      </td>
      <td style="text-align:right; vertical-align:top;">
        <div style="display:inline-block; background:#9F7AEA; color:#fff; padding:6px 16px; border-radius:6px;">
          <div style="font-size:9px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase;">Orden de Gasto</div>
          <div style="font-size:18px; font-weight:800; font-family:monospace;">${o.code}</div>
        </div>
      </td>
    </tr>
  </table>

  <hr style="border:none; border-top:2px solid #9F7AEA; margin-bottom:20px;" />

  <!-- Info de la orden -->
  <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:11px;">
    <tr>
      <td style="width:50%; vertical-align:top; padding-right:16px;">
        <table style="width:100%; border-collapse:collapse;">
          ${this.infoRow('Proveedor', o.supplier?.name ?? '—')}
          ${this.infoRow('Estado', this.statusLabel(o.status), this.statusStyle(o.status))}
          ${this.infoRow('Estado de pago', this.paymentStatusLabel(o.payment_status), this.paymentStatusStyle(o.payment_status))}
        </table>
      </td>
      <td style="width:50%; vertical-align:top;">
        <table style="width:100%; border-collapse:collapse;">
          ${this.infoRow('Fecha de creación', this.formatDate(o.created_at))}
          ${this.infoRow('Entrega esperada', o.expected_delivery_date ? this.formatDate(o.expected_delivery_date) : 'No especificada')}
          ${o.invoice_number ? this.infoRow('Factura', `${o.invoice_number} — ${o.invoice_date ?? ''}`) : ''}
          ${this.infoRow('Generado el', this.formatDate(new Date().toISOString()))}
        </table>
      </td>
    </tr>
  </table>

  <!-- Tabla de ítems -->
  <div style="margin-bottom:20px;">
    <div style="background:#553C9A; color:#fff; padding:6px 10px; border-radius:6px 6px 0 0; font-size:11px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase;">
      Detalle de Ítems
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:10.5px;">
      <thead>
        <tr style="background:#f7fafc;">
          <th style="${this.th()}">#</th>
          <th style="${this.th('left')}">Descripción</th>
          <th style="${this.th()}">Unidad</th>
          <th style="${this.th()}">Cant. Sol.</th>
          ${(o.items ?? []).some(i => i.quantity_received !== undefined) ? `<th style="${this.th()}">Cant. Rec.</th>` : ''}
          <th style="${this.th()}">Precio Unit.</th>
          <th style="${this.th()}">IVA %</th>
          <th style="${this.th()}">Total</th>
        </tr>
      </thead>
      <tbody>
        ${(o.items ?? []).map((item, idx) => this.itemRow(item, idx, (o.items ?? []).some(i => i.quantity_received !== undefined))).join('')}
        ${(o.items ?? []).length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:12px;color:#a0aec0;">Sin ítems</td></tr>` : ''}
      </tbody>
    </table>
  </div>

  <!-- Totales -->
  <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
    <tr>
      <td style="width:55%;"></td>
      <td style="width:45%;">
        <table style="width:100%; border-collapse:collapse; font-size:11px;">
          ${this.totalRow('Subtotal', this.formatCurrency(Number(o.subtotal)))}
          ${this.taxByRateRows(o.items ?? [])}
          <tr>
            <td style="padding:6px 10px; font-weight:700; font-size:13px; background:#553C9A; color:#fff; border-radius:0 0 0 6px;">TOTAL</td>
            <td style="padding:6px 10px; font-weight:700; font-size:13px; background:#553C9A; color:#fff; text-align:right; border-radius:0 0 6px 0;">${this.formatCurrency(Number(o.total_amount))}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- Panel de pagos -->
  ${(o.payments ?? []).length > 0 ? this.buildPaymentsSection(o) : ''}

  <!-- Notas -->
  ${o.notes ? `
  <div style="border:1px solid #e2e8f0; border-radius:6px; padding:10px 14px; margin-bottom:20px; font-size:11px;">
    <div style="font-weight:700; color:#4a5568; margin-bottom:4px;">Notas</div>
    <div style="color:#2d3748;">${o.notes}</div>
  </div>` : ''}

  <!-- Footer -->
  <hr style="border:none; border-top:1px solid #e2e8f0; margin-bottom:8px;" />
  <div style="display:flex; justify-content:space-between; font-size:9px; color:#a0aec0;">
    <span>SGA Bojanini &mdash; Sistema de Gestión Administrativa</span>
    <span>Documento generado el ${this.formatDate(new Date().toISOString())}</span>
  </div>

</div>`;
  }

  private buildPaymentsSection(o: ExpenseOrder): string {
    const rows = (o.payments ?? []).map((p, idx) => {
      const bg = idx % 2 === 0 ? '#fff' : '#f7fafc';
      const td = `padding:5px 8px; border-bottom:1px solid #edf2f7; font-size:10px; background:${bg};`;
      return `<tr>
        <td style="${td}">${p.payment_date}</td>
        <td style="${td}">${this.paymentMethodLabel(p.payment_method)}</td>
        <td style="${td}; text-align:right; font-weight:600;">${this.formatCurrency(Number(p.amount))}</td>
        <td style="${td}">${p.reference ?? '—'}</td>
        <td style="${td}">${p.notes ?? '—'}</td>
      </tr>`;
    }).join('');

    const pct = Math.min(100, Math.round((Number(o.amount_paid) / Number(o.total_amount)) * 100));

    return `
  <div style="margin-bottom:20px;">
    <div style="background:#276749; color:#fff; padding:6px 10px; border-radius:6px 6px 0 0; font-size:11px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase;">
      Pagos y Anticipos
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:10.5px;">
      <thead>
        <tr style="background:#f7fafc;">
          <th style="${this.th()}">Fecha</th>
          <th style="${this.th()}">Método</th>
          <th style="${this.th()}">Monto</th>
          <th style="${this.th()}">Referencia</th>
          <th style="${this.th('left')}">Nota</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex; justify-content:flex-end; margin-top:8px; font-size:11px; gap:24px;">
      <span>Pagado: <strong>${this.formatCurrency(Number(o.amount_paid))}</strong> (${pct}%)</span>
      <span>Saldo: <strong>${this.formatCurrency(Number(o.total_amount) - Number(o.amount_paid))}</strong></span>
    </div>
  </div>`;
  }

  private infoRow(label: string, value: string, valueStyle = ''): string {
    return `<tr>
      <td style="padding:3px 8px 3px 0; color:#718096; font-weight:600; white-space:nowrap;">${label}:</td>
      <td style="padding:3px 0; color:#2d3748; ${valueStyle}">${value}</td>
    </tr>`;
  }

  private itemRow(item: ExpenseOrderItem, idx: number, showReceived: boolean): string {
    const bg = idx % 2 === 0 ? '#fff' : '#f7fafc';
    const td  = `padding:5px 8px; border-bottom:1px solid #edf2f7; text-align:center; background:${bg};`;
    const tdL = `padding:5px 8px; border-bottom:1px solid #edf2f7; text-align:left; background:${bg};`;
    return `<tr>
      <td style="${td}">${idx + 1}</td>
      <td style="${tdL}">${item.description}${item.notes ? `<br><span style="font-size:9px;color:#a0aec0;font-style:italic;">${item.notes}</span>` : ''}</td>
      <td style="${td}">${item.unit}</td>
      <td style="${td}">${item.quantity_requested}</td>
      ${showReceived ? `<td style="${td}">${item.quantity_received ?? 0}</td>` : ''}
      <td style="${td}">${this.formatCurrency(Number(item.unit_price))}</td>
      <td style="${td}">${item.tax_rate ? `${Number(item.tax_rate)}%` : 'Exento'}</td>
      <td style="${td};font-weight:600;">${this.formatCurrency(Number(item.total_price))}</td>
    </tr>`;
  }

  private taxByRateRows(items: ExpenseOrderItem[]): string {
    const groups: { rate: number; amount: number }[] = [];
    for (const item of items) {
      const rate = Number(item.tax_rate ?? 0);
      if (rate <= 0) continue;
      const tax = item.tax_amount != null
        ? Number(item.tax_amount)
        : Number(item.quantity_requested) * Number(item.unit_price) * (rate / 100);
      const existing = groups.find(g => g.rate === rate);
      if (existing) existing.amount += tax;
      else groups.push({ rate, amount: tax });
    }
    groups.sort((a, b) => a.rate - b.rate);

    if (!groups.length) {
      return this.totalRow('IVA', this.formatCurrency(0));
    }
    return groups.map(g => this.totalRow(`IVA ${g.rate}%`, this.formatCurrency(g.amount))).join('');
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

  private statusLabel(s: string): string {
    const m: Record<string, string> = {
      draft: 'Borrador', pending_approval: 'En Aprobación', approved: 'Aprobado',
      sent: 'Enviado', partially_received: 'Recibido Parcial',
      received: 'Recibido', rejected: 'Rechazado', cancelled: 'Cancelado',
    };
    return m[s] ?? s;
  }

  private statusStyle(s: string): string {
    const m: Record<string, string> = {
      draft: 'color:#4a5568;font-weight:600;', pending_approval: 'color:#744210;font-weight:600;',
      approved: 'color:#276749;font-weight:600;', sent: 'color:#2b6cb0;font-weight:600;',
      partially_received: 'color:#7b341e;font-weight:600;', received: 'color:#276749;font-weight:600;',
      rejected: 'color:#c53030;font-weight:600;', cancelled: 'color:#718096;font-weight:600;',
    };
    return m[s] ?? '';
  }

  private paymentStatusLabel(s: string): string {
    return { unpaid: 'Sin pago', partial: 'Pago parcial', paid: 'Pagado' }[s] ?? s;
  }

  private paymentStatusStyle(s: string): string {
    return { unpaid: 'color:#c53030;font-weight:600;', partial: 'color:#744210;font-weight:600;', paid: 'color:#276749;font-weight:600;' }[s] ?? '';
  }

  private paymentMethodLabel(m: string): string {
    return { cash: 'Efectivo', transfer: 'Transferencia', check: 'Cheque', other: 'Otro' }[m] ?? m;
  }

  private formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  }

  private formatDate(iso: string): string {
    try { return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)); }
    catch { return iso; }
  }
}

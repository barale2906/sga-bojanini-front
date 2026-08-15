import { Injectable, inject } from '@angular/core';
import { PdfPrintService } from '../../../shared/services/pdf-print.service';
import { ConsolidatedOrder, ConsolidatedOrderItem } from '../purchasing.service';

@Injectable({ providedIn: 'root' })
export class ConsolidatedOrderPdfService {
  private printer = inject(PdfPrintService);

  generate(order: ConsolidatedOrder): void {
    const html = this.buildHtml(order);
    this.printer.print(html, `OCC-${order.code}`);
  }

  private buildHtml(o: ConsolidatedOrder): string {
    const includedCodes = (o.purchase_orders ?? []).map(p => p.code).join(', ') || '—';
    const taxBreakdown  = this.computeTaxBreakdown(o);
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
        <div style="display:inline-block; background:#1E2A3B; color:#FFCF01; padding:6px 16px; border-radius:6px;">
          <div style="font-size:9px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase;">Orden de Compra Consolidada</div>
          <div style="font-size:18px; font-weight:800; font-family:monospace;">${o.code}</div>
        </div>
      </td>
    </tr>
  </table>

  <hr style="border:none; border-top:2px solid #FFCF01; margin-bottom:20px;" />

  <!-- Info del consolidado -->
  <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:11px;">
    <tr>
      <td style="width:50%; vertical-align:top; padding-right:16px;">
        <table style="width:100%; border-collapse:collapse;">
          ${this.infoRow('Proveedor', o.supplier?.name ?? '—')}
          ${this.infoRow('Período', `${this.formatDateStr(o.period_from)} — ${this.formatDateStr(o.period_to)}`)}
          ${this.infoRow('Órdenes incluidas', includedCodes)}
        </table>
      </td>
      <td style="width:50%; vertical-align:top;">
        <table style="width:100%; border-collapse:collapse;">
          ${this.infoRow('Fecha de generación', this.formatDate(o.created_at))}
          ${o.createdBy ? this.infoRow('Elaborado por', o.createdBy.name) : ''}
        </table>
      </td>
    </tr>
  </table>

  <!-- Tabla de ítems consolidados -->
  <div style="margin-bottom:20px;">
    <div style="background:#1E2A3B; color:#fff; padding:6px 10px; border-radius:6px 6px 0 0; font-size:11px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase;">
      Detalle de Productos (Líneas Consolidadas)
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:10.5px;">
      <thead>
        <tr style="background:#f7fafc;">
          <th style="${this.th()}">#</th>
          <th style="${this.th('left')}">Producto</th>
          <th style="${this.th()}">Presentación</th>
          <th style="${this.th()}">Marca / SKU</th>
          <th style="${this.th()}">Cantidad</th>
          <th style="${this.th()}">Precio Unit.</th>
          <th style="${this.th()}">IVA %</th>
          <th style="${this.th()}">IVA $</th>
          <th style="${this.th()}">Total</th>
        </tr>
      </thead>
      <tbody>
        ${(o.items ?? []).map((item, idx) => this.itemRow(item, idx)).join('')}
        ${(o.items ?? []).length === 0 ? `<tr><td colspan="9" style="text-align:center;padding:12px;color:#a0aec0;">Sin ítems</td></tr>` : ''}
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
          ${taxBreakdown.map(tb => this.totalRow(`IVA ${tb.rate}%`, this.formatCurrency(tb.tax_amount), '#718096')).join('')}
          ${taxBreakdown.length > 1 ? this.totalRow('Total IVA', this.formatCurrency(Number(o.tax_amount)), '#4a5568', true) : ''}
          ${taxBreakdown.length <= 1 && taxBreakdown.length === 0 ? this.totalRow('IVA', this.formatCurrency(Number(o.tax_amount))) : ''}
          <tr>
            <td style="padding:6px 10px; font-weight:700; font-size:13px; background:#1E2A3B; color:#FFCF01; border-radius:0 0 0 6px;">TOTAL GENERAL</td>
            <td style="padding:6px 10px; font-weight:700; font-size:13px; background:#1E2A3B; color:#FFCF01; text-align:right; border-radius:0 0 6px 0;">${this.formatCurrency(Number(o.total_amount))}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- Notas -->
  ${o.notes ? `
  <div style="border:1px solid #e2e8f0; border-radius:6px; padding:10px 14px; margin-bottom:20px; font-size:11px;">
    <div style="font-weight:700; color:#4a5568; margin-bottom:4px;">Observaciones</div>
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

  private infoRow(label: string, value: string): string {
    return `<tr>
      <td style="padding:3px 8px 3px 0; color:#718096; font-weight:600; white-space:nowrap;">${label}:</td>
      <td style="padding:3px 0; color:#2d3748;">${value}</td>
    </tr>`;
  }

  private itemRow(item: ConsolidatedOrderItem, idx: number): string {
    const bg = idx % 2 === 0 ? '#fff' : '#f7fafc';
    const td = `padding:5px 8px; border-bottom:1px solid #edf2f7; text-align:center; background:${bg};`;
    const tdL = `padding:5px 8px; border-bottom:1px solid #edf2f7; text-align:left; background:${bg};`;
    const brandSku = [item.variant?.lab_brand, item.variant?.brand_sku].filter(Boolean).join(' / ');
    return `<tr>
      <td style="${td}">${idx + 1}</td>
      <td style="${tdL}"><strong>${item.variant?.generic?.name ?? '—'}</strong></td>
      <td style="${td}">${item.presentation?.name ?? '—'}</td>
      <td style="${td}; font-size:9px; color:#718096;">${brandSku || '—'}</td>
      <td style="${td}">${item.quantity}</td>
      <td style="${td}">${this.formatCurrency(Number(item.unit_price))}</td>
      <td style="${td}">${Number(item.tax_rate) > 0 ? item.tax_rate + '%' : '—'}</td>
      <td style="${td}">${Number(item.tax_amount) > 0 ? this.formatCurrency(Number(item.tax_amount)) : '—'}</td>
      <td style="${td}; font-weight:600;">${this.formatCurrency(Number(item.total_price))}</td>
    </tr>`;
  }

  private totalRow(label: string, value: string, color = '#4a5568', dashed = false): string {
    const border = dashed ? 'border-top:1px dashed #e2e8f0;' : 'border-bottom:1px solid #edf2f7;';
    return `<tr>
      <td style="padding:4px 10px; color:${color}; ${border}">${label}</td>
      <td style="padding:4px 10px; text-align:right; color:${color}; ${border}">${value}</td>
    </tr>`;
  }

  private computeTaxBreakdown(o: ConsolidatedOrder): { rate: number; tax_amount: number }[] {
    if (o.tax_breakdown?.length) {
      return o.tax_breakdown.filter(t => t.rate > 0).map(t => ({ rate: t.rate, tax_amount: t.tax_amount }));
    }
    const map = new Map<number, number>();
    for (const item of o.items ?? []) {
      const rate = Number(item.tax_rate ?? 0);
      const amt  = Number(item.tax_amount ?? 0);
      if (rate > 0) map.set(rate, (map.get(rate) ?? 0) + amt);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([rate, tax_amount]) => ({ rate, tax_amount }));
  }

  private th(align = 'center'): string {
    return `padding:6px 8px; text-align:${align}; color:#4a5568; font-weight:700; border-bottom:2px solid #e2e8f0; background:#f7fafc;`;
  }

  private formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  }

  private formatDate(iso: string): string {
    try { return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)); }
    catch { return iso; }
  }

  private formatDateStr(d: string): string {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }
}

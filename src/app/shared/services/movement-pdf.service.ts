import { Injectable, inject } from '@angular/core';
import { PdfPrintService } from './pdf-print.service';

export interface MovementPdfLine {
  product_name: string;
  lot_number:   string | null;
  quantity:     number;
}

export interface MovementPdfData {
  movement_type:     string;
  doc_id:            number;
  date:              string;
  user_name:         string;
  warehouse_name:    string;
  warehouse_to_name?: string | null;
  reason?:           string | null;
  cost_center_name?: string | null;
  lines:             MovementPdfLine[];
}

const TYPE_TITLES: Record<string, string> = {
  exit:       'Comprobante de Salida de Inventario',
  transfer:   'Comprobante de Transferencia de Inventario',
  adjustment: 'Comprobante de Ajuste de Inventario',
  return:     'Comprobante de Devolución a Proveedor',
};

const SIGN_LABELS: Record<string, { left: string; right: string }> = {
  exit:       { left: 'Quien entrega',           right: 'Quien recibe' },
  transfer:   { left: 'Almacén origen (entrega)', right: 'Almacén destino (recibe)' },
  adjustment: { left: 'Responsable del ajuste',   right: 'Supervisor / Auditor' },
  return:     { left: 'Almacén (entrega)',         right: 'Proveedor (recibe)' },
};

@Injectable({ providedIn: 'root' })
export class MovementPdfService {
  private pdfSvc = inject(PdfPrintService);

  generateAndPrint(data: MovementPdfData): void {
    const title = TYPE_TITLES[data.movement_type] ?? 'Comprobante de Movimiento';
    this.pdfSvc.print(this._buildHtml(data, title), title);
  }

  private _buildHtml(d: MovementPdfData, title: string): string {
    const date = new Date(d.date).toLocaleString('es-CO', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

    const warehouseHtml = d.warehouse_to_name
      ? `${this._esc(d.warehouse_name)} <span class="arrow">&#8594;</span> ${this._esc(d.warehouse_to_name)}`
      : this._esc(d.warehouse_name);

    const ccRow = d.cost_center_name
      ? `<tr><td class="ml">Centro de Costo</td><td>${this._esc(d.cost_center_name)}</td></tr>`
      : '';

    const reasonRow = d.reason
      ? `<tr><td class="ml">Motivo</td><td>${this._esc(d.reason)}</td></tr>`
      : '';

    const productRows = d.lines.map(l => {
      const absQty = Math.abs(l.quantity);
      const qtyStr = d.movement_type === 'adjustment'
        ? (l.quantity >= 0 ? `+${absQty}` : `&#8722;${absQty}`)
        : `${absQty}`;
      return `
        <tr>
          <td>${this._esc(l.product_name)}</td>
          <td class="center">${l.lot_number ? this._esc(l.lot_number) : '&#8212;'}</td>
          <td class="center qty-val">${qtyStr}</td>
        </tr>`;
    }).join('');

    const signs = SIGN_LABELS[d.movement_type] ?? { left: 'Quien entrega', right: 'Quien recibe' };

    return `
<style>
  .doc-wrap { max-width: 760px; margin: 0 auto; }
  .doc-head { display:flex; justify-content:space-between; align-items:flex-start;
              border-bottom: 3px solid #FFCF01; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 22px; font-weight: 800; color: #1E2A3B; letter-spacing: -0.5px; }
  .brand span { color: #FFCF01; }
  .brand-sub { font-size: 9px; color: #718096; margin-top: 2px; }
  .doc-title { font-size: 13px; font-weight: 700; color: #1E2A3B; text-align: right; }
  .doc-num { font-size: 11px; color: #718096; text-align: right; margin-top: 2px; }

  .meta { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  .meta td { padding: 5px 10px; vertical-align: top; }
  .meta tr:nth-child(odd) td { background: #f7fafc; }
  .ml { font-weight: 700; color: #4a5568; white-space: nowrap; width: 140px; }
  .arrow { color: #d4a017; font-weight: 700; }

  .sec-title { font-size: 11px; font-weight: 700; color: #1E2A3B;
               border-left: 3px solid #FFCF01; padding-left: 8px; margin-bottom: 8px; }
  .prod-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 24px; }
  .prod-table th { background: #1E2A3B; color: #fff; padding: 7px 10px; text-align: left; }
  .prod-table th.center, .prod-table td.center { text-align: center; }
  .prod-table td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  .prod-table tbody tr:hover td { background: #f7fafc; }
  .qty-val { font-weight: 700; color: #1E2A3B; }

  .sign-wrap { margin-top: 32px; border-top: 1px dashed #cbd5e0; padding-top: 20px; }
  .sign-head { font-size: 11px; font-weight: 700; color: #1E2A3B; margin-bottom: 16px; }
  .sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .sign-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 16px; }
  .sign-box-label { font-size: 9px; font-weight: 700; color: #4a5568;
                    text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 20px; }
  .sign-field { display: flex; flex-direction: column; gap: 22px; }
  .sign-row { display: flex; flex-direction: column; gap: 4px; }
  .sign-line { border-bottom: 1.5px solid #1E2A3B; height: 18px; }
  .sign-lbl { font-size: 9px; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; }

  .footer { margin-top: 20px; font-size: 9px; color: #a0aec0;
            text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
</style>

<div class="doc-wrap">
  <div class="doc-head">
    <div>
      <div class="brand">SGA <span>Bojanini</span></div>
      <div class="brand-sub">Sistema de Gestión de Almacenes</div>
    </div>
    <div>
      <div class="doc-title">${this._esc(title)}</div>
      <div class="doc-num">N&deg; ${d.doc_id} &nbsp;&middot;&nbsp; ${date}</div>
    </div>
  </div>

  <table class="meta">
    <tr><td class="ml">Tipo de movimiento</td><td>${this._esc(TYPE_TITLES[d.movement_type] ?? d.movement_type)}</td></tr>
    <tr><td class="ml">Almacén</td><td>${warehouseHtml}</td></tr>
    ${ccRow}
    <tr><td class="ml">Registrado por</td><td>${this._esc(d.user_name)}</td></tr>
    <tr><td class="ml">Fecha y hora</td><td>${date}</td></tr>
    ${reasonRow}
  </table>

  <div class="sec-title">Productos del movimiento</div>
  <table class="prod-table">
    <thead>
      <tr>
        <th>Producto</th>
        <th class="center">N&deg; de Lote</th>
        <th class="center">Cantidad</th>
      </tr>
    </thead>
    <tbody>${productRows}</tbody>
  </table>

  <div class="sign-wrap">
    <div class="sign-head">Firmas de conformidad</div>
    <div class="sign-grid">
      <div class="sign-box">
        <div class="sign-box-label">${this._esc(signs.left)}</div>
        <div class="sign-field">
          <div class="sign-row"><div class="sign-line"></div><div class="sign-lbl">Nombre completo</div></div>
          <div class="sign-row"><div class="sign-line"></div><div class="sign-lbl">N&deg; documento</div></div>
          <div class="sign-row"><div class="sign-line"></div><div class="sign-lbl">Firma</div></div>
        </div>
      </div>
      <div class="sign-box">
        <div class="sign-box-label">${this._esc(signs.right)}</div>
        <div class="sign-field">
          <div class="sign-row"><div class="sign-line"></div><div class="sign-lbl">Nombre completo</div></div>
          <div class="sign-row"><div class="sign-line"></div><div class="sign-lbl">N&deg; documento</div></div>
          <div class="sign-row"><div class="sign-line"></div><div class="sign-lbl">Firma</div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">Documento generado automáticamente por el SGA &middot; ${date}</div>
</div>`;
  }

  private _esc(s: string | null | undefined): string {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

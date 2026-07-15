import { Injectable, inject } from '@angular/core';
import { PdfPrintService } from './pdf-print.service';

export interface MovementPdfLine {
  product_name:    string;
  lot_number:      string | null;
  expiration_date?: string | null;
  quantity:        number;
}

export interface MovementPdfSignature {
  signer_name:     string;
  signer_document: string;
  signature_data:  string;
  signed_at:       string;
}

export interface MovementPdfData {
  movement_type:     string;
  doc_id:            number;
  /** Número legible del comprobante, ej. "SAL-2026-000001". Si se indica, se muestra en lugar de #doc_id. */
  doc_number?:       string | null;
  date:              string;
  user_name:         string;
  warehouse_name:    string;
  warehouse_to_name?: string | null;
  reason?:           string | null;
  cost_center_name?: string | null;
  lines:             MovementPdfLine[];
  delivered_by?:     MovementPdfSignature | null;
  received_by?:      MovementPdfSignature | null;
}

const TYPE_TITLES: Record<string, string> = {
  exit:       'Comprobante de Salida de Inventario',
  transfer:   'Comprobante de Transferencia de Inventario',
  adjustment: 'Comprobante de Ajuste de Inventario',
  return:     'Comprobante de Devolución a Proveedor',
  loss:       'Comprobante de Baja de Inventario',
};

const SIGN_LABELS: Record<string, { left: string; right: string }> = {
  exit:       { left: 'Quien entrega',           right: 'Quien recibe' },
  transfer:   { left: 'Almacén origen (entrega)', right: 'Almacén destino (recibe)' },
  adjustment: { left: 'Responsable del ajuste',   right: 'Supervisor / Auditor' },
  return:     { left: 'Almacén (entrega)',         right: 'Proveedor (recibe)' },
  loss:       { left: 'Responsable de la baja',    right: 'Supervisor / Auditor' },
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
          <td class="center">${this._fmtDate(l.expiration_date)}</td>
          <td class="center qty-val">${qtyStr}</td>
        </tr>`;
    }).join('');

    const signs = SIGN_LABELS[d.movement_type] ?? { left: 'Quien entrega', right: 'Quien recibe' };
    const signBlock = this._buildSignBlock(signs, d.delivered_by ?? null, d.received_by ?? null);

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
  .prod-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
  .prod-table th { background: #1E2A3B; color: #fff; padding: 7px 10px; text-align: left; }
  .prod-table th.center, .prod-table td.center { text-align: center; }
  .prod-table td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  .prod-table tbody tr:hover td { background: #f7fafc; }
  .qty-val { font-weight: 700; color: #1E2A3B; }

  /* ── Firma con datos reales ── */
  .sign-wrap { margin-top: 10px; border-top: 1.5px solid #cbd5e0; padding-top: 5px; }
  .sign-head { font-size: 8px; font-weight: 700; color: #4a5568;
               text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  .sign-grid-real { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .sign-col-real { border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 7px; }
  .sign-role { font-size: 7px; font-weight: 700; color: #4a5568;
               text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 2px; }
  .sign-person { font-size: 9px; color: #2d3748; margin-bottom: 2px; }
  .sign-person strong { font-weight: 600; }
  .sign-person span { color: #718096; margin-left: 6px; font-size: 8px; }
  .sign-img-box img { max-height: 44px; max-width: 210px; object-fit: contain;
                      background: #fff; border: 1px solid #e2e8f0;
                      border-radius: 2px; display: block; }

  /* ── Firma en blanco (sin datos) ── */
  .sign-grid-blank { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .sign-col-blank { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px; }
  .sign-blank-rows { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
  .sign-blank-row { display: flex; flex-direction: column; gap: 2px; }
  .sign-blank-line { border-bottom: 1.5px solid #2d3748; height: 14px; }
  .sign-blank-lbl { font-size: 7.5px; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.05em; }

  .footer { margin-top: 10px; font-size: 9px; color: #a0aec0;
            text-align: center; border-top: 1px solid #e2e8f0; padding-top: 6px; }

  @media print {
    /* Limitar bloque de firmas a ≤10% del área imprimible (267mm) → ~26mm */
    .sign-wrap { margin-top: 4mm; padding-top: 2mm; }
    .sign-img-box img { max-height: 14mm; max-width: 56mm; }
    .sign-col-real { padding: 1.5mm 2.5mm; }
    .sign-col-blank { padding: 2mm 3mm; }
    .sign-blank-rows { gap: 4mm; }
    .sign-blank-line { height: 4mm; }
  }
</style>

<div class="doc-wrap">
  <div class="doc-head">
    <div>
      <div class="brand">SGA <span>Bojanini</span></div>
      <div class="brand-sub">Sistema de Gestión de Almacenes</div>
    </div>
    <div>
      <div class="doc-title">${this._esc(title)}</div>
      <div class="doc-num">${d.doc_number ? this._esc(d.doc_number) : 'N&deg; ' + d.doc_id} &nbsp;&middot;&nbsp; ${date}</div>
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
        <th class="center">Vencimiento</th>
        <th class="center">Cantidad</th>
      </tr>
    </thead>
    <tbody>${productRows}</tbody>
  </table>

  ${signBlock}

  <div class="footer">Documento generado automáticamente por el SGA &middot; ${date}</div>
</div>`;
  }

  private _buildSignBlock(
    labels: { left: string; right: string },
    deliveredBy: MovementPdfSignature | null,
    receivedBy:  MovementPdfSignature | null,
  ): string {
    const hasData = !!(deliveredBy && receivedBy);

    if (hasData) {
      const colHtml = (role: string, sig: MovementPdfSignature) => `
        <div class="sign-col-real">
          <div class="sign-role">${this._esc(role)}</div>
          <div class="sign-person">
            <strong>${this._esc(sig.signer_name)}</strong>
            <span>C.C. ${this._esc(sig.signer_document)}</span>
          </div>
          <div class="sign-img-box">
            <img src="${sig.signature_data}" alt="Firma ${this._esc(sig.signer_name)}">
          </div>
        </div>`;

      return `
      <div class="sign-wrap">
        <div class="sign-head">Firmas de conformidad</div>
        <div class="sign-grid-real">
          ${colHtml(labels.left,  deliveredBy)}
          ${colHtml(labels.right, receivedBy)}
        </div>
      </div>`;
    }

    const blankCol = (role: string) => `
      <div class="sign-col-blank">
        <div class="sign-role">${this._esc(role)}</div>
        <div class="sign-blank-rows">
          <div class="sign-blank-row">
            <div class="sign-blank-line"></div>
            <div class="sign-blank-lbl">Nombre completo</div>
          </div>
          <div class="sign-blank-row">
            <div class="sign-blank-line"></div>
            <div class="sign-blank-lbl">N&deg; documento</div>
          </div>
          <div class="sign-blank-row">
            <div class="sign-blank-line"></div>
            <div class="sign-blank-lbl">Firma</div>
          </div>
        </div>
      </div>`;

    return `
    <div class="sign-wrap">
      <div class="sign-head">Firmas de conformidad</div>
      <div class="sign-grid-blank">
        ${blankCol(labels.left)}
        ${blankCol(labels.right)}
      </div>
    </div>`;
  }

  private _fmtDate(date: string | null | undefined): string {
    if (!date) return '&#8212;';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '&#8212;';
    return d.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
  }

  private _esc(s: string | null | undefined): string {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

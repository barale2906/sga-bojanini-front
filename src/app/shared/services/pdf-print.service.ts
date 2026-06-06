import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PdfPrintService {
  /**
   * Abre una ventana de impresión con el HTML y CSS proporcionados.
   * El usuario puede guardar como PDF desde el diálogo nativo del browser.
   */
  print(htmlContent: string, documentTitle: string): void {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${documentTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1a202c;
      background: #fff;
      padding: 20px;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      @page { margin: 15mm 12mm; size: A4 portrait; }
    }
    .no-print {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      padding: 12px 0 20px;
    }
    .btn {
      padding: 8px 18px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .btn-print { background: #FFCF01; color: #1E2A3B; }
    .btn-close { background: #e2e8f0; color: #4a5568; }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn btn-close" onclick="window.close()">Cerrar</button>
    <button class="btn btn-print" onclick="window.print()">&#128424; Imprimir / Guardar PDF</button>
  </div>
  ${htmlContent}
</body>
</html>`);

    win.document.close();
    win.focus();
  }
}

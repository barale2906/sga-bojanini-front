import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PurchasingService, ConsolidationPreview, TaxBreakdownEntry } from './purchasing.service';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

const MOCK_PREVIEW: ConsolidationPreview = {
  supplier: { id: 5, name: 'BIOCARE SAS', tax_id: '900123456-1' },
  purchase_orders: [
    { id: 12, code: 'OC-2026-00002', total_amount: 1031740, warehouse: { id: 3, name: 'Consultorio' } },
    { id: 15, code: 'OC-2026-00005', total_amount: 2567800, warehouse: { id: 1, name: 'Principal' } },
  ],
  items: [
    {
      product_variant_id: 8, product_presentation_id: 4,
      quantity: 4, unit_price: 258000, tax_rate: 0,
      subtotal: 1032000, tax_amount: 0, total_price: 1032000,
      source_order_codes: ['OC-2026-00002', 'OC-2026-00007'],
      variant: { id: 8, lab_brand: 'Versalu', brand_sku: 'ADR-1ML', generic: { id: 3, name: 'ADRENALINA 1 ML' } },
      presentation: { id: 4, code: '6PK', name: 'Six Pack' },
    },
    {
      product_variant_id: 8, product_presentation_id: 4,
      quantity: 5, unit_price: 260000, tax_rate: 0,
      subtotal: 1300000, tax_amount: 0, total_price: 1300000,
      source_order_codes: ['OC-2026-00005'],
      variant: { id: 8, lab_brand: 'Versalu', brand_sku: 'ADR-1ML', generic: { id: 3, name: 'ADRENALINA 1 ML' } },
      presentation: { id: 4, code: '6PK', name: 'Six Pack' },
    },
  ],
  subtotal: 3944800,
  tax_breakdown: [
    { rate: 0,  taxable_base: 3665800, tax_amount: 0 },
    { rate: 19, taxable_base: 1485000, tax_amount: 282150 },
  ],
  tax_amount: 79470,
  total_amount: 4024270,
};

describe('PurchasingService — getConsolidationPreview', () => {
  let svc: PurchasingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc  = TestBed.inject(PurchasingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('realiza POST a /purchase-orders/consolidation-preview con los IDs', () => {
    svc.getConsolidationPreview([12, 15]).subscribe();

    const req = http.expectOne(`${BASE}/purchase-orders/consolidation-preview`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ purchase_order_ids: [12, 15] });
    req.flush({ success: true, message: 'Vista previa', data: MOCK_PREVIEW });
  });

  it('devuelve los items agrupados del backend sin modificarlos', () => {
    let result: ConsolidationPreview | undefined;
    svc.getConsolidationPreview([12, 15]).subscribe(r => (result = r.data!));

    http.expectOne(`${BASE}/purchase-orders/consolidation-preview`)
      .flush({ success: true, message: 'Vista previa', data: MOCK_PREVIEW });

    expect(result!.items.length).toBe(2);
    expect(result!.items[0].source_order_codes).toEqual(['OC-2026-00002', 'OC-2026-00007']);
    expect(result!.items[0].quantity).toBe(4);
    expect(result!.items[1].quantity).toBe(5);
  });

  it('propaga los totales del nivel raíz de la respuesta', () => {
    let result: ConsolidationPreview | undefined;
    svc.getConsolidationPreview([12, 15]).subscribe(r => (result = r.data!));

    http.expectOne(`${BASE}/purchase-orders/consolidation-preview`)
      .flush({ success: true, message: 'Vista previa', data: MOCK_PREVIEW });

    expect(result!.subtotal).toBe(3944800);
    expect(result!.tax_amount).toBe(79470);
    expect(result!.total_amount).toBe(4024270);
  });

  it('incluye el array purchase_orders con código y almacén', () => {
    let result: ConsolidationPreview | undefined;
    svc.getConsolidationPreview([12, 15]).subscribe(r => (result = r.data!));

    http.expectOne(`${BASE}/purchase-orders/consolidation-preview`)
      .flush({ success: true, message: 'Vista previa', data: MOCK_PREVIEW });

    expect(result!.purchase_orders.length).toBe(2);
    expect(result!.purchase_orders[0].code).toBe('OC-2026-00002');
    expect(result!.purchase_orders[0].warehouse.name).toBe('Consultorio');
  });

  it('incluye el tax_breakdown con desglose por tasa de IVA', () => {
    let result: ConsolidationPreview | undefined;
    svc.getConsolidationPreview([12, 15]).subscribe(r => (result = r.data!));

    http.expectOne(`${BASE}/purchase-orders/consolidation-preview`)
      .flush({ success: true, message: 'Vista previa', data: MOCK_PREVIEW });

    expect(result!.tax_breakdown.length).toBe(2);
    const breakdown19 = result!.tax_breakdown.find((t: TaxBreakdownEntry) => t.rate === 19)!;
    expect(breakdown19.tax_amount).toBe(282150);
    expect(breakdown19.taxable_base).toBe(1485000);
  });

  it('propaga el error 422 cuando una OC ya fue consolidada', () => {
    let errorMsg = '';
    svc.getConsolidationPreview([99]).subscribe({
      error: err => (errorMsg = err.error.message),
    });

    http.expectOne(`${BASE}/purchase-orders/consolidation-preview`).flush(
      { success: false, message: 'Las siguientes órdenes ya fueron consolidadas: OC-2026-00008.', data: null },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(errorMsg).toContain('consolidadas');
  });
});

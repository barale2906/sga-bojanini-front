import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ServiceOrdersService, ServiceOrderPayload, ServiceOrder, DiscountOrder, PriceListImportResult } from './service-orders.service';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

const MOCK_PROCEDURE = {
  id: 1,
  medical_service_id: 5,
  medical_service_name: 'Consulta',
  movement_document_id: null,
  patient_external_id: 'P001',
  patient_document: '12345',
  patient_first_name: 'Juan',
  patient_last_name: 'Pérez',
  quantity: 1,
  unit_price: 100000,
  total: 100000,
  discount_type: null,
  discount_value: null,
  discount_amount: null,
  net_total: null,
  discount_status: null,
  order_number: 'OS-20260909-000001',
  created_by_user_id: 1,
  approved_by_user_id: null,
  approved_at: null,
  service_date: '2026-09-09',
  seller: null,
  referrer: null,
  notes: null,
  is_active: true,
};

const MOCK_ORDER: ServiceOrder = {
  order_number: 'OS-20260909-000001',
  patient_external_id: 'P001',
  patient_document: '12345',
  patient_first_name: 'Juan',
  patient_last_name: 'Pérez',
  service_date: '2026-09-09',
  order_status: 'approved',
  total_amount: 100000,
  total_discount: 0,
  net_total: 100000,
  created_by_user_id: 1,
  procedures: [MOCK_PROCEDURE],
};

describe('ServiceOrdersService', () => {
  let svc: ServiceOrdersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc  = TestBed.inject(ServiceOrdersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── getCurrentPrice ───────────────────────────────────────────────────────

  it('should GET current price for a procedure', () => {
    const mockPrice = { medical_service_id: 5, unit_price: 120000, effective_from: '2026-09-01', effective_to: null };
    let result: any;
    svc.getCurrentPrice(5).subscribe(r => (result = r));
    const req = http.expectOne(`${BASE}/procedures/5/current-price`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: mockPrice });
    expect(result.data.unit_price).toBe(120000);
  });

  it('should handle procedure with no price configured', () => {
    let result: any;
    svc.getCurrentPrice(99).subscribe(r => (result = r));
    const req = http.expectOne(`${BASE}/procedures/99/current-price`);
    req.flush({ success: true, data: { price: null } });
    expect(result.data.price).toBeNull();
  });

  // ── createOrder ───────────────────────────────────────────────────────────

  it('should POST to create a service order', () => {
    const payload: ServiceOrderPayload = {
      patient_external_id: 'P001',
      patient_document: '12345',
      patient_first_name: 'Juan',
      patient_last_name: 'Pérez',
      service_date: '2026-09-09',
      procedures: [{ medical_service_id: 5, unit_price: 100000, quantity: 1 }],
    };
    let result: any;
    svc.createOrder(payload).subscribe(r => (result = r));
    const req = http.expectOne(`${BASE}/service-orders`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, data: MOCK_ORDER });
    expect(result.data.order_number).toBe('OS-20260909-000001');
  });

  it('should include discount fields in payload', () => {
    const payload: ServiceOrderPayload = {
      patient_external_id: 'P001',
      patient_document: '12345',
      patient_first_name: 'Juan',
      patient_last_name: 'Pérez',
      service_date: '2026-09-09',
      procedures: [{
        medical_service_id: 5,
        unit_price: 100000,
        quantity: 1,
        discount_type: 'percentage',
        discount_value: 10,
      }],
    };
    svc.createOrder(payload).subscribe();
    const req = http.expectOne(`${BASE}/service-orders`);
    expect(req.request.body.procedures[0].discount_type).toBe('percentage');
    expect(req.request.body.procedures[0].discount_value).toBe(10);
    req.flush({ success: true, data: MOCK_ORDER });
  });

  it('should include supplies in payload', () => {
    const payload: ServiceOrderPayload = {
      patient_external_id: 'P001',
      patient_document: '12345',
      patient_first_name: 'Juan',
      patient_last_name: 'Pérez',
      service_date: '2026-09-09',
      procedures: [{
        medical_service_id: 5,
        unit_price: 100000,
        quantity: 1,
        supplies: [{ warehouse_id: 1, generic_product_id: 42, quantity: 2 }],
      }],
    };
    svc.createOrder(payload).subscribe();
    const req = http.expectOne(`${BASE}/service-orders`);
    expect(req.request.body.procedures[0].supplies).toHaveSize(1);
    expect(req.request.body.procedures[0].supplies[0].warehouse_id).toBe(1);
    req.flush({ success: true, data: MOCK_ORDER });
  });

  // ── getOrder ──────────────────────────────────────────────────────────────

  it('should GET a service order by order number', () => {
    let result: any;
    svc.getOrder('OS-20260909-000001').subscribe(r => (result = r));
    const req = http.expectOne(`${BASE}/service-orders/OS-20260909-000001`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: MOCK_ORDER });
    expect(result.data.order_number).toBe('OS-20260909-000001');
  });

  // ── getDiscounts ──────────────────────────────────────────────────────────

  it('should GET list of orders with pending discounts', () => {
    const mockDiscount: DiscountOrder = {
      order_number: 'OS-20260909-000001',
      patient_external_id: 'P001',
      patient_document: '12345',
      patient_first_name: 'Juan',
      patient_last_name: 'Pérez',
      service_date: '2026-09-09',
      created_by_user_id: 1,
      records: [{ ...MOCK_PROCEDURE, discount_status: 'pending' }],
    };
    let result: any;
    svc.getDiscounts().subscribe(r => (result = r));
    const req = http.expectOne(`${BASE}/service-orders/discounts`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: [mockDiscount] });
    expect(result.data).toHaveSize(1);
    expect(result.data[0].records[0].discount_status).toBe('pending');
  });

  // ── approveDiscount ───────────────────────────────────────────────────────

  it('should POST to approve discount', () => {
    let result: any;
    svc.approveDiscount('OS-20260909-000001').subscribe(r => (result = r));
    const req = http.expectOne(`${BASE}/service-orders/OS-20260909-000001/approve`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: { ...MOCK_ORDER, order_status: 'approved' } });
    expect(result.data.order_status).toBe('approved');
  });

  // ── price lists ───────────────────────────────────────────────────────────

  it('should GET price list template as blob', () => {
    let result: any;
    svc.downloadPriceListTemplate().subscribe(r => (result = r));
    const req = http.expectOne(`${BASE}/price-lists/template`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['xlsx-data']));
    expect(result).toBeInstanceOf(Blob);
  });

  it('should POST price list file as FormData', () => {
    const file = new File(['data'], 'precios.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const mockResult: PriceListImportResult = { processed: 45, skipped: 2, skipped_detail: [] };
    let result: any;
    svc.importPriceList(file).subscribe(r => (result = r));
    const req = http.expectOne(`${BASE}/price-lists/import`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBeTrue();
    req.flush({ success: true, data: mockResult });
    expect(result.data.processed).toBe(45);
    expect(result.data.skipped).toBe(2);
  });
});

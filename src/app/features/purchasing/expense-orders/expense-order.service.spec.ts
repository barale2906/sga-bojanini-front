import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpenseOrderService, ExpenseOrder, ExpenseOrderPayment, ExpenseSupplier } from './expense-order.service';
import { environment } from '../../../../environments/environment';

const BASE = environment.apiUrl;

const MOCK_ORDER: ExpenseOrder = {
  id: 1, order_type: 'expense', code: 'OG-2026-00001',
  status: 'draft', payment_status: 'unpaid',
  supplier_id: 5,
  subtotal: '750000.00', tax_amount: '142500.00', total_amount: '892500.00',
  amount_paid: '0.00',
  invoice_number: null, invoice_date: null,
  notes: 'Grabadoras para consultorios',
  expected_delivery_date: '2026-09-01',
  created_at: '2026-08-17T10:00:00+00:00',
  supplier: { id: 5, name: 'Distribuidora SAS', email: 'ventas@dist.com' },
  items: [
    {
      id: 1, description: 'Grabadora Sony ICD-PX470', unit: 'und',
      quantity_requested: 3, quantity_received: 0,
      unit_price: '250000.00', tax_rate: '19.00',
      tax_amount: '142500.00', total_price: '892500.00',
    },
  ],
  payments: [],
};

const MOCK_PAYMENT: ExpenseOrderPayment = {
  id: 1, amount: '500000.00', payment_date: '2026-08-15',
  payment_method: 'transfer', reference: 'TRF-001', notes: 'Anticipo',
  registered_by: { id: 2, name: 'María García' },
  created_at: '2026-08-17T10:30:00+00:00',
};

describe('ExpenseOrderService', () => {
  let svc: ExpenseOrderService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc  = TestBed.inject(ExpenseOrderService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── CRUD básico ──────────────────────────────────────────────

  it('getOrders() hace GET a /expense-orders', () => {
    svc.getOrders().subscribe();
    const req = http.expectOne(`${BASE}/expense-orders`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: '', data: { data: [MOCK_ORDER], current_page: 1, per_page: 25, total: 1, last_page: 1 } });
  });

  it('getOrders() aplica filtros como query params', () => {
    svc.getOrders({ status: 'draft', payment_status: 'unpaid', per_page: 10, page: 2 }).subscribe();
    const req = http.expectOne(r =>
      r.url === `${BASE}/expense-orders` &&
      r.params.get('status') === 'draft' &&
      r.params.get('payment_status') === 'unpaid' &&
      r.params.get('per_page') === '10' &&
      r.params.get('page') === '2'
    );
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: '', data: { data: [], current_page: 2, per_page: 10, total: 0, last_page: 1 } });
  });

  it('getOrder() hace GET a /expense-orders/:id y retorna datos correctos', () => {
    let result: ExpenseOrder | undefined;
    svc.getOrder(1).subscribe(r => (result = r.data!));
    const req = http.expectOne(`${BASE}/expense-orders/1`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: '', data: MOCK_ORDER });
    expect(result!.code).toBe('OG-2026-00001');
    expect(result!.order_type).toBe('expense');
  });

  it('createOrder() hace POST a /expense-orders con el payload correcto', () => {
    const payload = {
      supplier_id: 5,
      items: [{ description: 'Grabadora Sony', unit: 'und', quantity: 3, unit_price: 250000, tax_rate: 19 }],
    };
    svc.createOrder(payload).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, message: 'Orden creada', data: MOCK_ORDER });
  });

  it('createOrder() retorna código con prefijo OG-', () => {
    let order: ExpenseOrder | undefined;
    svc.createOrder({ supplier_id: 5, items: [] }).subscribe(r => (order = r.data!));
    http.expectOne(`${BASE}/expense-orders`).flush({ success: true, message: '', data: MOCK_ORDER });
    expect(order!.code).toMatch(/^OG-/);
  });

  it('updateOrder() hace PUT a /expense-orders/:id', () => {
    const payload = { supplier_id: 5, items: [] };
    svc.updateOrder(1, payload).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1`);
    expect(req.request.method).toBe('PUT');
    req.flush({ success: true, message: 'Orden actualizada', data: MOCK_ORDER });
  });

  it('deleteOrder() hace DELETE a /expense-orders/:id', () => {
    svc.deleteOrder(1).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'Orden eliminada', data: null });
  });

  // ── Flujo de estados ─────────────────────────────────────────

  it('submit() hace POST a /expense-orders/:id/submit con body vacío', () => {
    svc.submit(1).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/submit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, status: 'pending_approval' } });
  });

  it('approve() incluye record_id cuando es > 0', () => {
    svc.approve(1, 12, 'Aprobado').subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/approve`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ record_id: 12, comments: 'Aprobado' });
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, status: 'approved' } });
  });

  it('approve() omite record_id cuando es null (backend busca el pendiente)', () => {
    svc.approve(1, null, 'Sin comentario').subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/approve`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ comments: 'Sin comentario' });
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, status: 'approved' } });
  });

  it('reject() incluye record_id cuando es > 0', () => {
    svc.reject(1, 12, 'Excede presupuesto').subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/reject`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ record_id: 12, comments: 'Excede presupuesto' });
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, status: 'rejected' } });
  });

  it('reject() omite record_id cuando es null (backend busca el pendiente)', () => {
    svc.reject(1, null, 'Motivo').subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/reject`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ comments: 'Motivo' });
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, status: 'rejected' } });
  });

  it('send() hace POST a /expense-orders/:id/send', () => {
    svc.send(1).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/send`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, status: 'sent' } });
  });

  it('cancel() hace POST a /expense-orders/:id/cancel', () => {
    svc.cancel(1).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/cancel`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, status: 'cancelled' } });
  });

  it('receive() envía los ítems con item_id y quantity_received', () => {
    const items = [{ item_id: 1, quantity_received: 2 }, { item_id: 2, quantity_received: 1 }];
    svc.receive(1, items).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/receive`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ items });
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, status: 'partially_received' } });
  });

  it('send() propaga error 409 cuando proveedor no tiene email', () => {
    let errorMsg = '';
    svc.send(1).subscribe({ error: err => (errorMsg = err.error.message) });
    http.expectOne(`${BASE}/expense-orders/1/send`).flush(
      { success: false, message: 'El proveedor no tiene correo electrónico registrado.' },
      { status: 409, statusText: 'Conflict' }
    );
    expect(errorMsg).toContain('correo electrónico');
  });

  // ── Pagos ────────────────────────────────────────────────────

  it('getPayments() hace GET a /expense-orders/:id/payments', () => {
    let result: ExpenseOrderPayment[] | undefined;
    svc.getPayments(1).subscribe(r => (result = r.data!));
    const req = http.expectOne(`${BASE}/expense-orders/1/payments`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: '', data: [MOCK_PAYMENT] });
    expect(result!.length).toBe(1);
    expect(result![0].payment_method).toBe('transfer');
  });

  it('addPayment() hace POST con todos los campos del pago', () => {
    const payload = { amount: 500000, payment_date: '2026-08-15', payment_method: 'transfer', reference: 'TRF-001', notes: 'Anticipo' };
    svc.addPayment(1, payload).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/payments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, payment_status: 'partial', amount_paid: '500000.00' } });
  });

  it('addPayment() actualiza payment_status a "paid" cuando el monto cubre el total', () => {
    let order: ExpenseOrder | undefined;
    svc.addPayment(1, { amount: 892500, payment_date: '2026-08-15', payment_method: 'cash' }).subscribe(r => (order = r.data!));
    http.expectOne(`${BASE}/expense-orders/1/payments`).flush({
      success: true, message: '',
      data: { ...MOCK_ORDER, payment_status: 'paid', amount_paid: '892500.00' },
    });
    expect(order!.payment_status).toBe('paid');
  });

  it('deletePayment() hace DELETE a /expense-orders/:orderId/payments/:paymentId', () => {
    svc.deletePayment(1, 99).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/payments/99`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: '', data: null });
  });

  // ── Factura y Contabilidad ───────────────────────────────────

  it('registerInvoice() hace POST con invoice_number e invoice_date', () => {
    const payload = { invoice_number: 'FV-2026-4821', invoice_date: '2026-08-20' };
    svc.registerInvoice(1, payload).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/invoice`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, invoice_number: 'FV-2026-4821', invoice_date: '2026-08-20' } });
  });

  it('registerInvoice() retorna la orden con invoice_number actualizado', () => {
    let order: ExpenseOrder | undefined;
    svc.registerInvoice(1, { invoice_number: 'FV-001', invoice_date: '2026-08-20' }).subscribe(r => (order = r.data!));
    http.expectOne(`${BASE}/expense-orders/1/invoice`).flush({
      success: true, message: '',
      data: { ...MOCK_ORDER, invoice_number: 'FV-001', invoice_date: '2026-08-20' },
    });
    expect(order!.invoice_number).toBe('FV-001');
  });

  it('sendAccounting() hace POST multipart a /accounting con recipients y attachments', () => {
    const recipients = ['conta@clinica.com', 'jefe@clinica.com'];
    const file = new File(['pdf content'], 'factura.pdf', { type: 'application/pdf' });
    svc.sendAccounting(1, recipients, [file]).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/send-accounting`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    const fd = req.request.body as FormData;
    expect(fd.getAll('recipients[]')).toEqual(recipients);
    expect((fd.get('attachments[]') as File).name).toBe('factura.pdf');
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, accounting_sent_at: '2026-08-20T14:00:00+00:00' } });
  });

  it('sendAccounting() sin adjuntos solo envía recipients[]', () => {
    svc.sendAccounting(1, ['conta@clinica.com']).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/1/send-accounting`);
    expect(req.request.method).toBe('POST');
    const fd = req.request.body as FormData;
    expect(fd.getAll('recipients[]')).toEqual(['conta@clinica.com']);
    expect(fd.getAll('attachments[]').length).toBe(0);
    req.flush({ success: true, message: '', data: { ...MOCK_ORDER, accounting_sent_at: '2026-08-20T14:00:00+00:00' } });
  });

  it('sendAccounting() propaga error 409 cuando no hay factura registrada', () => {
    let errorMsg = '';
    svc.sendAccounting(1, ['conta@clinica.com']).subscribe({ error: err => (errorMsg = err.error.message) });
    http.expectOne(`${BASE}/expense-orders/1/send-accounting`).flush(
      { success: false, message: 'Debe registrar la factura antes de enviar a contabilidad.' },
      { status: 409, statusText: 'Conflict' }
    );
    expect(errorMsg).toContain('factura');
  });

  it('sendAccounting() actualiza accounting_sent_at en la orden retornada', () => {
    let order: ExpenseOrder | undefined;
    const ts = '2026-08-20T14:00:00+00:00';
    svc.sendAccounting(1, ['conta@clinica.com']).subscribe(r => (order = r.data!));
    http.expectOne(`${BASE}/expense-orders/1/send-accounting`).flush({
      success: true, message: '',
      data: { ...MOCK_ORDER, accounting_sent_at: ts },
    });
    expect(order!.accounting_sent_at).toBe(ts);
  });

  // ── Proveedores (typeahead + creación rápida) ────────────────

  it('searchSuppliers() hace GET a /suppliers/search con q y type=expense', () => {
    svc.searchSuppliers('Uniforme').subscribe();
    const req = http.expectOne(r =>
      r.url === `${BASE}/suppliers/search` &&
      r.params.get('q') === 'Uniforme' &&
      r.params.get('type') === 'expense'
    );
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: '', data: [] });
  });

  it('searchSuppliers() retorna proveedores de tipo expense y both', () => {
    const suppliers: ExpenseSupplier[] = [
      { id: 12, name: 'Uniformes y Dotaciones SAS', tax_id: '900555123-1', supplier_type: 'expense' },
      { id: 7,  name: 'Distribuidora General',     tax_id: '800111222-3', supplier_type: 'both' },
    ];
    let result: ExpenseSupplier[] | undefined;
    svc.searchSuppliers('uni').subscribe(r => (result = r.data!));
    http.expectOne(r => r.url === `${BASE}/suppliers/search`).flush({ success: true, message: '', data: suppliers });
    expect(result!.length).toBe(2);
    expect(result!.every(s => s.supplier_type === 'expense' || s.supplier_type === 'both')).toBe(true);
  });

  it('createExpenseSupplier() hace POST a /expense-orders/supplier solo con name', () => {
    svc.createExpenseSupplier({ name: 'Ferretería El Perno Feliz' }).subscribe();
    const req = http.expectOne(`${BASE}/expense-orders/supplier`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Ferretería El Perno Feliz' });
    req.flush({ success: true, message: 'Proveedor creado', data: { id: 25, name: 'Ferretería El Perno Feliz', supplier_type: 'expense' } });
  });

  it('createExpenseSupplier() retorna el proveedor con supplier_type expense', () => {
    let created: ExpenseSupplier | undefined;
    svc.createExpenseSupplier({ name: 'Nuevo Proveedor', email: 'info@nuevo.com', tax_id: '123-1' })
      .subscribe(r => (created = r.data!));
    http.expectOne(`${BASE}/expense-orders/supplier`).flush({
      success: true, message: 'Proveedor creado',
      data: { id: 30, name: 'Nuevo Proveedor', tax_id: '123-1', email: 'info@nuevo.com', supplier_type: 'expense' },
    });
    expect(created!.id).toBe(30);
    expect(created!.supplier_type).toBe('expense');
    expect(created!.email).toBe('info@nuevo.com');
  });

  it('createExpenseSupplier() propaga error 422 cuando el nombre falta', () => {
    let errorStatus = 0;
    svc.createExpenseSupplier({ name: '' }).subscribe({ error: err => (errorStatus = err.status) });
    http.expectOne(`${BASE}/expense-orders/supplier`).flush(
      { success: false, message: 'Validación fallida', errors: { name: ['El nombre es requerido'] } },
      { status: 422, statusText: 'Unprocessable Entity' }
    );
    expect(errorStatus).toBe(422);
  });
});

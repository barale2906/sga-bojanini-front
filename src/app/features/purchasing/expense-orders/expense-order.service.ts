import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';

export interface ExpenseSupplier {
  id: number;
  name: string;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  supplier_type: 'inventory' | 'expense' | 'both';
}

export interface ExpenseOrderItem {
  id?: number;
  description: string;
  unit: string;
  quantity_requested: number | string;
  quantity_received?: number | string;
  unit_price: number | string;
  tax_rate?: number | string;
  tax_amount?: number | string;
  total_price?: number | string;
  notes?: string | null;
}

export interface ExpenseOrderPayment {
  id: number;
  amount: string;
  payment_date: string;
  payment_method: 'cash' | 'transfer' | 'check' | 'other';
  reference?: string | null;
  notes?: string | null;
  registered_by?: { id: number; name: string };
  created_at: string;
}

export interface ExpenseOrder {
  id: number;
  order_type: 'expense';
  code: string;
  status: string;
  payment_status: 'unpaid' | 'partial' | 'paid';
  supplier_id: number;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  amount_paid: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  notes?: string | null;
  expected_delivery_date?: string | null;
  created_by?: number;
  sent_at?: string | null;
  received_at?: string | null;
  accounting_sent_at?: string | null;
  created_at: string;
  updated_at?: string;
  supplier?: { id: number; name: string; email?: string };
  items?: ExpenseOrderItem[];
  payments?: ExpenseOrderPayment[];
}

export interface ExpenseOrderFilters {
  status?: string;
  payment_status?: string;
  supplier_id?: number;
  date_from?: string;
  date_to?: string;
  per_page?: number;
  page?: number;
}

@Injectable({ providedIn: 'root' })
export class ExpenseOrderService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getOrders(f: ExpenseOrderFilters = {}): Observable<PaginatedResponse<ExpenseOrder>> {
    let p = new HttpParams();
    if (f.status)         p = p.set('status', f.status);
    if (f.payment_status) p = p.set('payment_status', f.payment_status);
    if (f.supplier_id)    p = p.set('supplier_id', String(f.supplier_id));
    if (f.date_from)      p = p.set('date_from', f.date_from);
    if (f.date_to)        p = p.set('date_to', f.date_to);
    if (f.per_page)       p = p.set('per_page', String(f.per_page));
    if (f.page)           p = p.set('page', String(f.page));
    return this.http.get<PaginatedResponse<ExpenseOrder>>(`${this.api}/expense-orders`, { params: p });
  }

  getOrder(id: number): Observable<ApiResponse<ExpenseOrder>> {
    return this.http.get<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${id}`);
  }

  createOrder(payload: any): Observable<ApiResponse<ExpenseOrder>> {
    return this.http.post<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders`, payload);
  }

  updateOrder(id: number, payload: any): Observable<ApiResponse<ExpenseOrder>> {
    return this.http.put<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${id}`, payload);
  }

  deleteOrder(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/expense-orders/${id}`);
  }

  submit(id: number): Observable<ApiResponse<ExpenseOrder>> {
    return this.http.post<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${id}/submit`, {});
  }

  approve(id: number, record_id: number | null, comments: string): Observable<ApiResponse<ExpenseOrder>> {
    const body: Record<string, any> = { comments };
    if (record_id && record_id > 0) body['record_id'] = record_id;
    return this.http.post<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${id}/approve`, body);
  }

  reject(id: number, record_id: number | null, comments: string): Observable<ApiResponse<ExpenseOrder>> {
    const body: Record<string, any> = { comments };
    if (record_id && record_id > 0) body['record_id'] = record_id;
    return this.http.post<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${id}/reject`, body);
  }

  send(id: number): Observable<ApiResponse<ExpenseOrder>> {
    return this.http.post<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${id}/send`, {});
  }

  cancel(id: number): Observable<ApiResponse<ExpenseOrder>> {
    return this.http.post<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${id}/cancel`, {});
  }

  receive(id: number, items: { item_id: number; quantity_received: number }[]): Observable<ApiResponse<ExpenseOrder>> {
    return this.http.post<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${id}/receive`, { items });
  }

  // Pagos
  getPayments(orderId: number): Observable<ApiResponse<ExpenseOrderPayment[]>> {
    return this.http.get<ApiResponse<ExpenseOrderPayment[]>>(`${this.api}/expense-orders/${orderId}/payments`);
  }

  addPayment(orderId: number, payload: {
    amount: number; payment_date: string; payment_method: string; reference?: string; notes?: string;
  }): Observable<ApiResponse<ExpenseOrder>> {
    return this.http.post<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${orderId}/payments`, payload);
  }

  deletePayment(orderId: number, paymentId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/expense-orders/${orderId}/payments/${paymentId}`);
  }

  // Proveedores de gastos
  searchSuppliers(q: string): Observable<ApiResponse<ExpenseSupplier[]>> {
    const p = new HttpParams().set('q', q).set('type', 'expense');
    return this.http.get<ApiResponse<ExpenseSupplier[]>>(`${this.api}/suppliers/search`, { params: p });
  }

  createExpenseSupplier(payload: {
    name: string; email?: string; phone?: string; tax_id?: string; notes?: string;
  }): Observable<ApiResponse<ExpenseSupplier>> {
    return this.http.post<ApiResponse<ExpenseSupplier>>(`${this.api}/expense-orders/supplier`, payload);
  }

  // Factura
  registerInvoice(id: number, payload: { invoice_number: string; invoice_date: string }): Observable<ApiResponse<ExpenseOrder>> {
    return this.http.post<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${id}/invoice`, payload);
  }

  // Contabilidad
  sendAccounting(id: number, recipients: string[], attachments: File[] = []): Observable<ApiResponse<ExpenseOrder>> {
    const fd = new FormData();
    recipients.forEach(r => fd.append('recipients[]', r));
    attachments.forEach(f => fd.append('attachments[]', f, f.name));
    return this.http.post<ApiResponse<ExpenseOrder>>(`${this.api}/expense-orders/${id}/send-accounting`, fd);
  }
}

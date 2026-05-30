import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../core/models/api-response.model';

export interface TaxBreakdownLine {
  tax_rate: number;
  tax_amount: number;
}

export interface PurchaseOrderItem {
  id?: number; product_id: number; product_presentation_id: number;
  quantity_requested: number; quantity_received?: number;
  unit_price: number | string;
  tax_rate?: number | string;
  tax_amount?: number | string;
  total_price?: number | string;
  notes?: string;
  product?: { id: number; code: string; name: string };
  presentation?: { id: number; name: string; factor_to_base: number };
  subtotal?: number;
}

export interface PurchaseOrder {
  id: number; code: string; supplier_id: number; warehouse_id: number;
  status: string; notes: string | null; expected_delivery_date: string | null;
  subtotal: number | string; tax_amount: number | string; total_amount: number | string;
  created_at: string;
  supplier?: { id: number; name: string };
  warehouse?: { id: number; name: string };
  items?: PurchaseOrderItem[];
  tax_breakdown?: TaxBreakdownLine[];
}

export interface ReorderSuggestion {
  product_id: number;
  product_name: string;
  product_code: string;
  current_stock: number;
  reorder_point: number;
  suggested_quantity: number;
  preferred_supplier?: { id: number; name: string };
}

export interface ApprovalFlow {
  id: number; name: string; entity_type: string; conditions: any; is_active: boolean;
  steps?: { id: number; step_order: number; role_id: number; is_required: boolean; role?: { id: number; name: string } }[];
}

@Injectable({ providedIn: 'root' })
export class PurchasingService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getOrders(f: { status?: string; per_page?: number; page?: number } = {}): Observable<PaginatedResponse<PurchaseOrder>> {
    let p = new HttpParams();
    if (f.status) p = p.set('status', f.status);
    if (f.per_page) p = p.set('per_page', String(f.per_page));
    if (f.page) p = p.set('page', String(f.page));
    return this.http.get<PaginatedResponse<PurchaseOrder>>(`${this.api}/purchase-orders`, { params: p });
  }

  getOrder(id: number): Observable<ApiResponse<PurchaseOrder>> {
    return this.http.get<ApiResponse<PurchaseOrder>>(`${this.api}/purchase-orders/${id}`);
  }

  createOrder(payload: any): Observable<ApiResponse<PurchaseOrder>> {
    return this.http.post<ApiResponse<PurchaseOrder>>(`${this.api}/purchase-orders`, payload);
  }

  updateOrder(id: number, payload: any): Observable<ApiResponse<PurchaseOrder>> {
    return this.http.put<ApiResponse<PurchaseOrder>>(`${this.api}/purchase-orders/${id}`, payload);
  }

  submit(id: number): Observable<ApiResponse<PurchaseOrder>> {
    return this.http.post<ApiResponse<PurchaseOrder>>(`${this.api}/purchase-orders/${id}/submit`, {});
  }

  approve(id: number, comments: string): Observable<ApiResponse<PurchaseOrder>> {
    return this.http.post<ApiResponse<PurchaseOrder>>(`${this.api}/purchase-orders/${id}/approve`, { comments });
  }

  reject(id: number, comments: string): Observable<ApiResponse<PurchaseOrder>> {
    return this.http.post<ApiResponse<PurchaseOrder>>(`${this.api}/purchase-orders/${id}/reject`, { comments });
  }

  send(id: number): Observable<ApiResponse<PurchaseOrder>> {
    return this.http.post<ApiResponse<PurchaseOrder>>(`${this.api}/purchase-orders/${id}/send`, {});
  }

  cancel(id: number): Observable<ApiResponse<PurchaseOrder>> {
    return this.http.post<ApiResponse<PurchaseOrder>>(`${this.api}/purchase-orders/${id}/cancel`, {});
  }

  receive(id: number, items: { item_id: number; quantity_received: number; lot_number: string; expiration_date: string; location_id?: number }[]): Observable<ApiResponse<PurchaseOrder>> {
    return this.http.post<ApiResponse<PurchaseOrder>>(`${this.api}/purchase-orders/${id}/receive`, { items });
  }

  getSuggestions(): Observable<ApiResponse<ReorderSuggestion[]>> {
    return this.http.get<ApiResponse<ReorderSuggestion[]>>(`${this.api}/purchase-orders/suggestions`);
  }

  // Approval Flows
  getApprovalFlows(): Observable<ApiResponse<ApprovalFlow[]>> {
    return this.http.get<ApiResponse<ApprovalFlow[]>>(`${this.api}/approval-flows`);
  }

  createApprovalFlow(payload: any): Observable<ApiResponse<ApprovalFlow>> {
    return this.http.post<ApiResponse<ApprovalFlow>>(`${this.api}/approval-flows`, payload);
  }

  updateApprovalFlow(id: number, payload: any): Observable<ApiResponse<ApprovalFlow>> {
    return this.http.put<ApiResponse<ApprovalFlow>>(`${this.api}/approval-flows/${id}`, payload);
  }

  deleteApprovalFlow(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/approval-flows/${id}`);
  }
}

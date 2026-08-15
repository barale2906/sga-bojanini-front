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
  id?: number; product_variant_id: number; product_presentation_id: number;
  quantity_requested: number; quantity_received?: number;
  unit_price: number | string;
  tax_rate?: number | string;
  tax_amount?: number | string;
  total_price?: number | string;
  notes?: string;
  variant?: { id: number; lab_brand: string; brand_sku: string; generic?: { id: number; name: string; barcode: string } };
  presentation?: { id: number; name: string; factor_to_base: number };
  subtotal?: number;
}

export interface PurchaseOrder {
  id: number; code: string; supplier_id: number; warehouse_id: number;
  status: string; notes: string | null; expected_delivery_date: string | null;
  subtotal: number | string; tax_amount: number | string; total_amount: number | string;
  created_at: string;
  received_at?: string | null;
  consolidated_order_id?: number | null;
  supplier?: { id: number; name: string };
  warehouse?: { id: number; name: string };
  items?: PurchaseOrderItem[];
  tax_breakdown?: TaxBreakdownLine[];
  approval_records?: PurchaseOrderApprovalRecord[];
}

export interface ConsolidableSupplier {
  id: number;
  name: string;
  tax_id: string;
}

export interface ConsolidatedOrderItem {
  id: number;
  product_variant_id: number;
  product_presentation_id: number;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  tax_amount: string;
  total_price: string;
  variant?: { id: number; lab_brand: string; brand_sku: string; generic?: { id: number; name: string; barcode: string } };
  presentation?: { id: number; code: string; name: string };
}

export interface ConsolidatedOrder {
  id: number;
  code: string;
  supplier_id: number;
  period_from: string;
  period_to: string;
  subtotal: string;
  tax_breakdown?: TaxBreakdownEntry[];
  tax_amount: string;
  total_amount: string;
  notes?: string | null;
  created_by?: number;
  created_at: string;
  supplier?: { id: number; name: string };
  createdBy?: { id: number; name: string };
  items?: ConsolidatedOrderItem[];
  purchase_orders?: Array<{
    id: number; code: string; status: string; total_amount: string;
    received_at?: string;
    warehouse?: { id: number; name: string; code: string };
    items?: PurchaseOrderItem[];
  }>;
}

export interface ConsolidationPreviewItem {
  product_variant_id: number;
  product_presentation_id: number;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total_price: number;
  source_order_codes: string[];
  variant?: { id: number; lab_brand: string; brand_sku: string; generic?: { id: number; name: string } };
  presentation?: { id: number; code: string; name: string };
}

export interface TaxBreakdownEntry {
  rate: number;
  taxable_base: number;
  tax_amount: number;
}

export interface ConsolidationPreview {
  supplier: { id: number; name: string; tax_id: string };
  purchase_orders: Array<{ id: number; code: string; total_amount: number; warehouse: { id: number; name: string } }>;
  items: ConsolidationPreviewItem[];
  subtotal: number;
  tax_breakdown: TaxBreakdownEntry[];
  tax_amount: number;
  total_amount: number;
}

export interface ReorderSuggestion {
  generic_product_id: number;
  product_name: string;
  product_barcode: string;
  current_stock: number;
  reorder_point: number;
  suggested_quantity: number;
  preferred_supplier?: { id: number; name: string };
}

export interface PurchaseOrderApprovalRecord {
  id: number;
  step_order: number;
  status: 'pending' | 'approved' | 'rejected';
  role?: { id: number; name: string };
  approver?: { id: number; name: string };
  comments?: string | null;
  decided_at?: string | null;
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

  deleteOrder(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/purchase-orders/${id}`);
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

  getApprovalFlow(id: number): Observable<ApiResponse<ApprovalFlow>> {
    return this.http.get<ApiResponse<ApprovalFlow>>(`${this.api}/approval-flows/${id}`);
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

  // Consolidación de OC
  getConsolidableSuppliers(): Observable<ApiResponse<ConsolidableSupplier[]>> {
    return this.http.get<ApiResponse<ConsolidableSupplier[]>>(`${this.api}/purchase-orders/consolidable-suppliers`);
  }

  getConsolidableOrders(params: { supplier_id: number; date_from?: string; date_to?: string }): Observable<ApiResponse<{ in_range: PurchaseOrder[]; pending: PurchaseOrder[] }>> {
    let p = new HttpParams().set('supplier_id', String(params.supplier_id));
    if (params.date_from) p = p.set('date_from', params.date_from);
    if (params.date_to) p = p.set('date_to', params.date_to);
    return this.http.get<ApiResponse<{ in_range: PurchaseOrder[]; pending: PurchaseOrder[] }>>(`${this.api}/purchase-orders/consolidable`, { params: p });
  }

  createConsolidatedOrder(payload: { purchase_order_ids: number[]; notes?: string }): Observable<ApiResponse<ConsolidatedOrder>> {
    return this.http.post<ApiResponse<ConsolidatedOrder>>(`${this.api}/consolidated-orders`, payload);
  }

  getConsolidatedOrders(f: { supplier_id?: number; date_from?: string; date_to?: string; per_page?: number; page?: number } = {}): Observable<PaginatedResponse<ConsolidatedOrder>> {
    let p = new HttpParams();
    if (f.supplier_id) p = p.set('supplier_id', String(f.supplier_id));
    if (f.date_from) p = p.set('date_from', f.date_from);
    if (f.date_to) p = p.set('date_to', f.date_to);
    if (f.per_page) p = p.set('per_page', String(f.per_page));
    if (f.page) p = p.set('page', String(f.page));
    return this.http.get<PaginatedResponse<ConsolidatedOrder>>(`${this.api}/consolidated-orders`, { params: p });
  }

  getConsolidatedOrder(id: number): Observable<ApiResponse<ConsolidatedOrder>> {
    return this.http.get<ApiResponse<ConsolidatedOrder>>(`${this.api}/consolidated-orders/${id}`);
  }

  getConsolidationPreview(purchase_order_ids: number[]): Observable<ApiResponse<ConsolidationPreview>> {
    return this.http.post<ApiResponse<ConsolidationPreview>>(`${this.api}/purchase-orders/consolidation-preview`, { purchase_order_ids });
  }
}

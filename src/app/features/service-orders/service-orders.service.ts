import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';

// ── Payload interfaces ────────────────────────────────────────────────────────

export interface ServiceOrderSupplyPayload {
  warehouse_id: number;
  generic_product_id: number;
  batch_id: number;
  quantity: number;
}

export interface ServiceOrderProcedurePayload {
  medical_service_id: number;
  unit_price: number;
  quantity: number;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  notes?: string;
  supplies?: ServiceOrderSupplyPayload[];
}

export interface ServiceOrderPayload {
  patient_external_id: string;
  patient_document: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_email?: string;
  patient_address?: string;
  patient_phone?: string;
  service_date: string;
  notes?: string;
  seller?: string;
  referrer?: string;
  procedures: ServiceOrderProcedurePayload[];
}

// ── Response interfaces ───────────────────────────────────────────────────────

export interface ServiceOrderProcedure {
  id: number;
  medical_service_id: number;
  medical_service_name: string;
  movement_document_id: number | null;
  patient_external_id: string;
  patient_document: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_email?: string | null;
  patient_address?: string | null;
  patient_phone?: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  discount_type: 'percentage' | 'fixed' | null;
  discount_value: number | null;
  discount_amount: number | null;
  net_total: number | null;
  discount_status: 'pending' | 'approved' | null;
  order_number: string;
  created_by_user_id: number;
  approved_by_user_id: number | null;
  approved_at: string | null;
  service_date: string;
  seller: string | null;
  referrer: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface ServiceOrder {
  order_number: string;
  patient_external_id: string;
  patient_document: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_email?: string | null;
  patient_address?: string | null;
  patient_phone?: string | null;
  service_date: string;
  order_status: 'approved' | 'discount_pending';
  total_amount: number;
  total_discount: number;
  net_total: number;
  created_by_user_id: number;
  procedures: ServiceOrderProcedure[];
}

export interface ProcedureCurrentPrice {
  medical_service_id?: number;
  unit_price?: number;
  effective_from?: string;
  effective_to?: string | null;
  price?: null;
}

export interface DiscountOrder {
  order_number: string;
  patient_external_id: string;
  patient_document: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_email?: string | null;
  patient_address?: string | null;
  patient_phone?: string | null;
  service_date: string;
  created_by_user_id: number;
  records: ServiceOrderProcedure[];
}

export interface PriceListImportResult {
  processed: number;
  skipped: number;
  skipped_detail: { row: number; code: string; reason: string }[];
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ServiceOrdersService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  getCurrentPrice(procedureId: number): Observable<ApiResponse<ProcedureCurrentPrice>> {
    return this.http.get<ApiResponse<ProcedureCurrentPrice>>(
      `${this.api}/procedures/${procedureId}/current-price`
    );
  }

  createOrder(payload: ServiceOrderPayload): Observable<ApiResponse<ServiceOrder>> {
    return this.http.post<ApiResponse<ServiceOrder>>(`${this.api}/service-orders`, payload);
  }

  getOrder(orderNumber: string): Observable<ApiResponse<ServiceOrder>> {
    return this.http.get<ApiResponse<ServiceOrder>>(
      `${this.api}/service-orders/${encodeURIComponent(orderNumber)}`
    );
  }

  getDiscounts(): Observable<ApiResponse<DiscountOrder[]>> {
    return this.http.get<ApiResponse<DiscountOrder[]>>(`${this.api}/service-orders/discounts`);
  }

  approveDiscount(orderNumber: string): Observable<ApiResponse<ServiceOrder>> {
    return this.http.post<ApiResponse<ServiceOrder>>(
      `${this.api}/service-orders/${encodeURIComponent(orderNumber)}/approve`,
      {}
    );
  }

  downloadPriceListTemplate(): Observable<Blob> {
    return this.http.get(`${this.api}/price-lists/template`, { responseType: 'blob' });
  }

  importPriceList(file: File): Observable<ApiResponse<PriceListImportResult>> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ApiResponse<PriceListImportResult>>(`${this.api}/price-lists/import`, fd);
  }
}

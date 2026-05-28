import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../core/models/api-response.model';

export interface Batch {
  id: number; product_id: number; lot_number: string;
  expiration_date: string | null; manufacturing_date: string | null;
  quantity_received: number; quantity_available: number;
  status: 'active' | 'expired' | 'depleted';
  notes: string | null; received_at: string; days_until_expiry: number | null;
  product?: { id: number; code: string; name: string };
}

/** Detalle de lote con ubicaciones físicas (respuesta de /products/{id}/batches y /batches/{id}) */
export interface BatchDetail {
  id: number;
  product_id: number;
  lot_number: string;
  expiration_date: string | null;
  manufacturing_date: string | null;
  quantity_received: number;
  quantity_available: number;
  status: 'active' | 'expired' | 'depleted';
  days_until_expiry: number | null;
  received_at: string;
  product?: { id: number; code: string; name: string };
  locations: BatchLocation[];
}

export interface BatchLocation {
  location_id: number;
  location_name: string;
  location_code: string;
  quantity: number;
  zone: { zone_id: number; zone_name: string; zone_code: string } | null;
}

/** Respuesta de GET /stock/summary */
export interface StockSummary {
  product_id:         number;
  warehouse_id:       number;
  total_quantity:     number;
  reserved_quantity:  number;
  available_quantity: number;
  last_movement_at:   string | null;
}

export interface StockItem {
  product: { id: number; code: string; name: string };
  warehouse: { id: number; name: string; code: string };
  total_quantity: number; reserved_quantity: number; available_quantity: number;
  last_movement_at: string | null;
}

export interface Movement {
  id: number;
  product_id: number;
  warehouse_id: number;
  batch_id: number | null;
  movement_type: string;
  quantity: number;
  reason: string | null;
  user_id: number;
  created_at: string;
  product_name: string;
  batch_lot_number: string | null;
  user_name: string;
  // Nested objects (algunos endpoints los incluyen)
  product?: { id: number; code: string; name: string };
  warehouse?: { id: number; name: string };
}

export interface MovementReportRow {
  date: string;
  type: string;
  product: string;
  warehouse: string;
  quantity: number;
  user: string;
}

export interface MovementReport {
  generated: string;
  date_from: string;
  date_to: string;
  headers: string[];
  rows: MovementReportRow[];
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  // Batches
  getBatches(f: { product_id?: number; status?: string; warehouse_id?: number; per_page?: number; page?: number } = {}): Observable<PaginatedResponse<Batch>> {
    let p = new HttpParams();
    if (f.product_id) p = p.set('product_id', String(f.product_id));
    if (f.status) p = p.set('status', f.status);
    if (f.warehouse_id) p = p.set('warehouse_id', String(f.warehouse_id));
    if (f.per_page) p = p.set('per_page', String(f.per_page));
    if (f.page) p = p.set('page', String(f.page));
    return this.http.get<PaginatedResponse<Batch>>(`${this.api}/batches`, { params: p });
  }

  getExpiringBatches(): Observable<ApiResponse<Batch[]>> {
    return this.http.get<ApiResponse<Batch[]>>(`${this.api}/batches/expiring`);
  }

  getExpiredBatches(): Observable<ApiResponse<Batch[]>> {
    return this.http.get<ApiResponse<Batch[]>>(`${this.api}/batches/expired`);
  }

  /** Paso 5 — Detalle de un lote individual (post-salida) */
  getBatchById(batchId: number): Observable<ApiResponse<BatchDetail>> {
    return this.http.get<ApiResponse<BatchDetail>>(`${this.api}/batches/${batchId}`);
  }

  /** Paso 3 — Lotes del producto ordenados FEFO (expiration_date ASC) */
  getProductBatches(productId: number): Observable<ApiResponse<BatchDetail[]>> {
    return this.http.get<ApiResponse<BatchDetail[]>>(`${this.api}/products/${productId}/batches`);
  }

  // Stock
  getStock(f: { warehouse_id?: number; product_id?: number; per_page?: number; page?: number } = {}): Observable<PaginatedResponse<StockItem>> {
    let p = new HttpParams();
    if (f.warehouse_id) p = p.set('warehouse_id', String(f.warehouse_id));
    if (f.product_id) p = p.set('product_id', String(f.product_id));
    if (f.per_page) p = p.set('per_page', String(f.per_page));
    if (f.page) p = p.set('page', String(f.page));
    return this.http.get<PaginatedResponse<StockItem>>(`${this.api}/stock`, { params: p });
  }

  getLowStock(): Observable<ApiResponse<StockItem[]>> {
    return this.http.get<ApiResponse<StockItem[]>>(`${this.api}/stock/low`);
  }

  /** Paso 2 — Resumen de stock por producto y almacén */
  getStockSummary(warehouseId: number, productId: number): Observable<ApiResponse<StockSummary>> {
    const params = new HttpParams()
      .set('warehouse_id', String(warehouseId))
      .set('product_id', String(productId));
    return this.http.get<ApiResponse<StockSummary>>(`${this.api}/stock/summary`, { params });
  }

  // Movements
  getMovements(f: {
    warehouse_id?: number;
    product_id?: number;
    movement_type?: string;
    date_from?: string;
    date_to?: string;
    per_page?: number;
    page?: number;
  } = {}): Observable<PaginatedResponse<Movement>> {
    let p = new HttpParams();
    if (f.warehouse_id)  p = p.set('warehouse_id',  String(f.warehouse_id));
    if (f.product_id)    p = p.set('product_id',    String(f.product_id));
    if (f.movement_type) p = p.set('movement_type', f.movement_type);
    if (f.date_from)     p = p.set('date_from',     f.date_from);
    if (f.date_to)       p = p.set('date_to',       f.date_to);
    if (f.per_page)      p = p.set('per_page',      String(f.per_page));
    if (f.page)          p = p.set('page',          String(f.page));
    return this.http.get<PaginatedResponse<Movement>>(`${this.api}/movements`, { params: p });
  }

  getMovementsReport(f: { date_from?: string; date_to?: string; type?: string } = {}): Observable<ApiResponse<MovementReport>> {
    let p = new HttpParams();
    if (f.date_from) p = p.set('date_from', f.date_from);
    if (f.date_to) p = p.set('date_to', f.date_to);
    if (f.type) p = p.set('type', f.type);
    return this.http.get<ApiResponse<MovementReport>>(`${this.api}/reports/movements`, { params: p });
  }

  entry(payload: any): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.api}/movements/entry`, payload);
  }
  exit(payload: any): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.api}/movements/exit`, payload);
  }
  transfer(payload: any): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.api}/movements/transfer`, payload);
  }
  adjustment(payload: any): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.api}/movements/adjustment`, payload);
  }
  return_(payload: any): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.api}/movements/return`, payload);
  }
  writeOff(batchId: number): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.api}/movements/write-off`, { batch_id: batchId });
  }
}

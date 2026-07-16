import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../core/models/api-response.model';

export interface VariantWithGeneric {
  id: number;
  lab_brand: string | null;
  generic: { id: number; barcode: string; name: string } | null;
}

export interface Batch {
  id: number; product_variant_id: number; lot_number: string;
  expiration_date: string | null; manufacturing_date: string | null;
  quantity_received: number; quantity_available: number;
  status: 'active' | 'expired' | 'depleted';
  notes: string | null; received_at: string; days_until_expiry: number | null;
  variant?: VariantWithGeneric | null;
  accessible_quantity?: number | null;
  warehouses?: { id: number; code: string; name: string; quantity: number }[] | null;
}

/** Detalle de lote con ubicaciones físicas (respuesta de /generic-products/{id}/batches y /batches/{id}) */
export interface BatchDetail {
  id: number;
  product_variant_id: number;
  lot_number: string;
  expiration_date: string | null;
  manufacturing_date: string | null;
  quantity_received: number;
  quantity_available: number;
  status: 'active' | 'expired' | 'depleted';
  days_until_expiry: number | null;
  received_at: string;
  variant?: VariantWithGeneric | null;
  locations: BatchLocation[];
}

export interface BatchLocation {
  location_id: number;
  location_name: string;
  location_code: string;
  quantity: number;
  zone: { zone_id: number; zone_name: string; zone_code: string; warehouse_id: number; warehouse_name: string | null; warehouse_code: string | null } | null;
}

/** Respuesta de GET /stock/summary */
export interface StockSummary {
  generic_product_id: number;
  warehouse_id:       number;
  total_quantity:     number;
  reserved_quantity:  number;
  available_quantity: number;
  /** Unidades de lotes vencidos (no incluidas en available_quantity), gestionables vía devolución, ajuste o baja. */
  expired_quantity:   number;
  last_movement_at:   string | null;
}

export interface StockItem {
  variant: VariantWithGeneric | null;
  warehouse: { id: number; name: string; code: string } | null;
  total_quantity: number; reserved_quantity: number; available_quantity: number;
  last_movement_at: string | null;
}

export interface CostCenter {
  id: number;
  code: string;
  name: string;
  type: 'internal' | 'external';
  type_label: string;
  is_external: boolean;
  description: string | null;
  is_active: boolean;
}

export interface MedicalService {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface MovementSignatureRecord {
  id?: number;
  role: 'delivered_by' | 'received_by';
  signer_name: string;
  signer_document: string;
  signed_at: string;
  signature_data?: string;
}

/**
 * Documento de movimiento — agrupa una o varias líneas de producto bajo un único comprobante.
 * Respuesta de POST /movements/exit|entry|transfer y GET /movement-documents/{id}.
 */
export interface MovementDocument {
  id: number;
  document_number: string;
  document_type: string;
  status: 'pending_signature' | 'confirmed';
  warehouse_id: number;
  warehouse_name: string | null;
  warehouse_to_id: number | null;
  warehouse_to_name: string | null;
  cost_center_id: number | null;
  cost_center?: { id: number; code: string; name: string; type: string } | null;
  service_id: number | null;
  medical_service?: { id: number; code: string; name: string } | null;
  patient_document: string | null;
  patient_external_id: string | null;
  invoice_number: string | null;
  entry_temperature: number | null;
  reason: string | null;
  user_id: number;
  user_name: string;
  created_at: string;
  signatures?: MovementSignatureRecord[];
  movements?: Movement[];
}

export interface ConfirmMovementPayload {
  delivered_by: { name: string; document: string; signature: string };
  received_by:  { name: string; document: string; signature: string };
}

export interface Movement {
  id: number;
  movement_document_id?: number | null;
  product_variant_id: number;
  warehouse_id: number;
  warehouse_to_id?: number | null;
  warehouse_to_name?: string | null;
  batch_id: number | null;
  location_from_id?: number | null;
  location_to_id?: number | null;
  movement_type: string;
  quantity: number;
  reason: string | null;
  user_id: number;
  created_at: string;
  /** Nombre del genérico — presente en GET /movements/{id} (carga variant.genericProduct). Puede ser null en el listado. */
  product_name?: string | null;
  /** Marca/laboratorio de la variante — nuevo campo en el modelo genérico+variante. */
  variant_lab_brand?: string | null;
  batch_lot_number: string | null;
  batch_expiration_date: string | null;
  user_name: string;
  status?: 'pending_signature' | 'confirmed';
  signatures?: MovementSignatureRecord[] | null;
  cost_center_id?: number | null;
  service_id?: number | null;
  patient_document?: string | null;
  patient_external_id?: string | null;
  seller?: string | null;
  referrer?: string | null;
  cost_center?: { id: number; code: string; name: string; type: string };
  medical_service?: { id: number; code: string; name: string };
  product?: { id: number; barcode: string; name: string };
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

/** Resultado de POST /movements/initial-entries/import */
export interface InitialEntriesImportResult {
  total: number;
  success: number;
  failed: number;
  errors: { row: number; errors: Record<string, string[]> }[];
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  // Batches
  getBatches(f: { product_variant_id?: number; generic_product_id?: number; status?: string; warehouse_id?: number; per_page?: number; page?: number } = {}): Observable<PaginatedResponse<Batch>> {
    let p = new HttpParams();
    if (f.product_variant_id)  p = p.set('product_variant_id',  String(f.product_variant_id));
    if (f.generic_product_id)  p = p.set('generic_product_id',  String(f.generic_product_id));
    if (f.status)              p = p.set('status', f.status);
    if (f.warehouse_id)        p = p.set('warehouse_id',         String(f.warehouse_id));
    if (f.per_page)            p = p.set('per_page',             String(f.per_page));
    if (f.page)                p = p.set('page',                 String(f.page));
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

  /**
   * Paso 3 — Lotes del producto ordenados FEFO (expiration_date ASC)
   * @param availableForExit Si es true, solo devuelve lotes activos, no vencidos y con stock disponible
   *   (usar en salidas/transferencias). Sin este parámetro incluye también lotes vencidos
   *   (usar en devoluciones, ajustes y bajas).
   * @param warehouseId Si se indica, solo devuelve lotes con stock en alguna ubicación de ese
   *   almacén (usar en el selector de lote de la baja de inventario).
   */
  getProductBatches(productId: number, availableForExit = false, warehouseId?: number): Observable<ApiResponse<BatchDetail[]>> {
    let params = new HttpParams();
    if (availableForExit) params = params.set('available_for_exit', '1');
    if (warehouseId) params = params.set('warehouse_id', String(warehouseId));
    return this.http.get<ApiResponse<BatchDetail[]>>(`${this.api}/generic-products/${productId}/batches`, { params });
  }

  // Stock
  getStock(f: { warehouse_id?: number; generic_product_id?: number; per_page?: number; page?: number } = {}): Observable<PaginatedResponse<StockItem>> {
    let p = new HttpParams();
    if (f.warehouse_id) p = p.set('warehouse_id', String(f.warehouse_id));
    if (f.generic_product_id) p = p.set('generic_product_id', String(f.generic_product_id));
    if (f.per_page) p = p.set('per_page', String(f.per_page));
    if (f.page) p = p.set('page', String(f.page));
    return this.http.get<PaginatedResponse<StockItem>>(`${this.api}/stock`, { params: p });
  }

  getLowStock(): Observable<ApiResponse<StockItem[]>> {
    return this.http.get<ApiResponse<StockItem[]>>(`${this.api}/stock/low`);
  }

  /** Paso 2 — Resumen de stock por genérico y almacén */
  getStockSummary(warehouseId: number, genericProductId: number): Observable<ApiResponse<StockSummary>> {
    const params = new HttpParams()
      .set('warehouse_id',       String(warehouseId))
      .set('generic_product_id', String(genericProductId));
    return this.http.get<ApiResponse<StockSummary>>(`${this.api}/stock/summary`, { params });
  }

  /** Kits armables a partir del stock de componentes en un almacén. */
  getKitAvailability(kitGenericId: number, warehouseId: number): Observable<ApiResponse<{ generic_product_id: number; warehouse_id: number; available_kits: number }>> {
    const params = new HttpParams()
      .set('kit_generic_id', String(kitGenericId))
      .set('warehouse_id',   String(warehouseId));
    return this.http.get<ApiResponse<{ generic_product_id: number; warehouse_id: number; available_kits: number }>>(`${this.api}/stock/kit-availability`, { params });
  }

  // Movements
  getMovement(id: number): Observable<ApiResponse<Movement>> {
    return this.http.get<ApiResponse<Movement>>(`${this.api}/movements/${id}`);
  }

  /** Devuelve el comprobante completo con todas sus líneas y firmas. Usar para reimpresión. */
  getMovementDocument(id: number): Observable<ApiResponse<MovementDocument>> {
    return this.http.get<ApiResponse<MovementDocument>>(`${this.api}/movement-documents/${id}`);
  }

  getMovements(f: {
    warehouse_id?: number;
    warehouse_to_id?: number;
    product_variant_id?: number;
    generic_product_id?: number;
    movement_type?: string;
    cost_center_id?: number;
    cost_center_type?: 'internal' | 'external';
    status?: 'pending_signature' | 'confirmed';
    date_from?: string;
    date_to?: string;
    seller?: string;
    referrer?: string;
    per_page?: number;
    page?: number;
  } = {}): Observable<PaginatedResponse<Movement>> {
    let p = new HttpParams();
    if (f.warehouse_id)        p = p.set('warehouse_id',        String(f.warehouse_id));
    if (f.warehouse_to_id)     p = p.set('warehouse_to_id',     String(f.warehouse_to_id));
    if (f.product_variant_id)  p = p.set('product_variant_id',  String(f.product_variant_id));
    if (f.generic_product_id)  p = p.set('generic_product_id',  String(f.generic_product_id));
    if (f.movement_type)    p = p.set('movement_type',    f.movement_type);
    if (f.cost_center_id)   p = p.set('cost_center_id',   String(f.cost_center_id));
    if (f.cost_center_type) p = p.set('cost_center_type', f.cost_center_type);
    if (f.status)           p = p.set('status',           f.status);
    if (f.date_from)        p = p.set('date_from',        f.date_from);
    if (f.date_to)          p = p.set('date_to',          f.date_to);
    if (f.seller)           p = p.set('seller',           f.seller);
    if (f.referrer)         p = p.set('referrer',         f.referrer);
    if (f.per_page)         p = p.set('per_page',         String(f.per_page));
    if (f.page)             p = p.set('page',             String(f.page));
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
  /** Baja de inventario por daño, muestra, pérdida/robo o vencimiento — requiere `batch_id` y `location_id` elegidos explícitamente por el usuario (no aplica FEFO). */
  loss(payload: any): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.api}/movements/loss`, payload);
  }

  /** Confirma un documento de movimiento (id = movement_document.id). */
  confirmMovement(id: number, payload: ConfirmMovementPayload): Observable<ApiResponse<MovementDocument>> {
    return this.http.post<ApiResponse<MovementDocument>>(`${this.api}/movement-documents/${id}/confirm`, payload);
  }

  /** Cancela un documento pendiente de firma (id = movement_document.id). */
  cancelPendingMovement(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/movement-documents/${id}/pending`);
  }

  /** Obtiene una firma específica de un documento (id = movement_document.id). */
  getMovementSignature(id: number, role: 'delivered_by' | 'received_by'): Observable<ApiResponse<MovementSignatureRecord>> {
    return this.http.get<ApiResponse<MovementSignatureRecord>>(`${this.api}/movement-documents/${id}/signature/${role}`);
  }

  getCostCenters(f: { is_active?: boolean } = {}): Observable<ApiResponse<CostCenter[]>> {
    let p = new HttpParams();
    if (f.is_active !== undefined) p = p.set('is_active', String(f.is_active));
    return this.http.get<ApiResponse<CostCenter[]>>(`${this.api}/cost-centers`, { params: p });
  }

  getMedicalServices(f: { is_active?: boolean } = {}): Observable<ApiResponse<MedicalService[]>> {
    let p = new HttpParams();
    if (f.is_active !== undefined) p = p.set('is_active', String(f.is_active));
    return this.http.get<ApiResponse<MedicalService[]>>(`${this.api}/medical-services`, { params: p });
  }

  // ── Carga masiva de inventario inicial ──────────────────────────
  // Ver /mnt/trabajo/repos/Back/laravel/sga-bojanini/src/docs/frontend-initial-entries-import.md

  downloadInitialEntriesTemplate(warehouseId?: number): Observable<Blob> {
    let p = new HttpParams();
    if (warehouseId) p = p.set('warehouse_id', String(warehouseId));
    return this.http.get(`${this.api}/movements/initial-entries/template`, { params: p, responseType: 'blob' });
  }

  importInitialEntries(file: File, warehouseId?: number): Observable<ApiResponse<InitialEntriesImportResult>> {
    const fd = new FormData();
    fd.append('file', file);
    if (warehouseId) fd.append('warehouse_id', String(warehouseId));
    return this.http.post<ApiResponse<InitialEntriesImportResult>>(`${this.api}/movements/initial-entries/import`, fd);
  }
}

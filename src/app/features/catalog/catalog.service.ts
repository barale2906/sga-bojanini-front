import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';

// ── Interfaces ──────────────────────────────────────────────────

export interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  children?: Category[];
}

export interface UnitOfMeasure {
  id: number;
  name: string;
  abbreviation: string;
  is_base: boolean;
  is_active: boolean;
}

export interface Product {
  id: number;
  category_id: number;
  base_unit_id: number;
  product_type: 'simple' | 'kit';
  name: string;
  code: string;
  sku: string | null;
  description: string | null;
  requires_cold_chain: boolean;
  reorder_point: number;
  reorder_quantity: number;
  min_stock: number;
  max_stock: number;
  /** Volumen de una unidad del producto en cm³ (para cálculo de capacidad de ubicaciones) */
  volume_cm3: number | null;
  /** Peso de una unidad del producto en kg (para cálculo de capacidad de ubicaciones) */
  weight_kg: number | null;
  is_active: boolean;
  category?: Pick<Category, 'id' | 'name' | 'code'>;
  base_unit?: Pick<UnitOfMeasure, 'id' | 'name' | 'abbreviation'>;
  components?: KitComponent[];
  created_at?: string;
}

export interface KitComponent {
  id: number;
  kit_product_id?: number;
  component_product_id: number;
  quantity_per_kit: number;
  sort_order: number;
  notes?: string | null;
  is_active?: boolean;
  component?: Pick<Product, 'id' | 'name' | 'code'>;
}

export interface ProductPresentation {
  id: number;
  /** @deprecated product_id ya no existe en presentaciones (modelo M:N) */
  product_id?: number;
  parent_id: number | null;
  name: string;
  code: string;
  units_of_measure_id: number;
  quantity_per_parent: number | null;
  factor_to_base: number;
  level: number;
  /** Campo de la tabla pivot — presente solo en respuestas por-producto */
  is_purchase_default?: boolean;
  is_active: boolean;
  sort_order: number;
  children?: ProductPresentation[];
}

/** Payload para asignar / actualizar la vinculación presentación ↔ producto */
export interface PresentationAttachPayload {
  is_purchase_default?: boolean;
  sort_order?: number;
}

export interface Supplier {
  id: number;
  name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface SupplierProductPivot {
  supplier_sku: string | null;
  product_presentation_id: number | null;
  lead_time_days: number | null;
  unit_price: number;
  is_preferred: boolean;
}

/** Producto con datos del pivot proveedor↔producto */
export interface SupplierProduct extends Product {
  pivot: SupplierProductPivot;
}

export interface SupplierCategoryAssignResult {
  assigned: number;
  skipped: number;
  category: string;
}

export interface SupplierCategoryRemoveResult {
  removed: number;
  category: string;
}

export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: { row: number; errors: Record<string, string[]> }[];
}

export interface KitAvailability {
  kit_product_id: number;
  warehouse_id: number;
  available_kits: number;
}

export interface KitExplosionLine {
  component_product_id: number;
  component_code: string;
  component_name: string;
  quantity_base: number;
}

// ── Service ──────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  // ── Categorías ──────────────────────────────────────────────

  getCategories(filters: { search?: string; is_active?: string; parent_id?: number } = {}): Observable<ApiResponse<Category[]>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    if (filters.parent_id !== undefined) params = params.set('parent_id', String(filters.parent_id));
    return this.http.get<ApiResponse<Category[]>>(`${this.api}/categories`, { params });
  }

  getCategoriesTree(): Observable<ApiResponse<Category[]>> {
    return this.http.get<ApiResponse<Category[]>>(`${this.api}/categories-tree`);
  }

  getCategory(id: number): Observable<ApiResponse<Category>> {
    return this.http.get<ApiResponse<Category>>(`${this.api}/categories/${id}`);
  }

  createCategory(payload: Partial<Category>): Observable<ApiResponse<Category>> {
    return this.http.post<ApiResponse<Category>>(`${this.api}/categories`, payload);
  }

  updateCategory(id: number, payload: Partial<Category>): Observable<ApiResponse<Category>> {
    return this.http.put<ApiResponse<Category>>(`${this.api}/categories/${id}`, payload);
  }

  deleteCategory(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/categories/${id}`);
  }

  // ── Unidades de medida ───────────────────────────────────────

  getUnits(filters: { search?: string; is_active?: string; is_base?: string } = {}): Observable<ApiResponse<UnitOfMeasure[]>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    if (filters.is_base !== undefined && filters.is_base !== '') params = params.set('is_base', filters.is_base);
    return this.http.get<ApiResponse<UnitOfMeasure[]>>(`${this.api}/units-of-measure`, { params });
  }

  getUnit(id: number): Observable<ApiResponse<UnitOfMeasure>> {
    return this.http.get<ApiResponse<UnitOfMeasure>>(`${this.api}/units-of-measure/${id}`);
  }

  createUnit(payload: Partial<UnitOfMeasure>): Observable<ApiResponse<UnitOfMeasure>> {
    return this.http.post<ApiResponse<UnitOfMeasure>>(`${this.api}/units-of-measure`, payload);
  }

  updateUnit(id: number, payload: Partial<UnitOfMeasure>): Observable<ApiResponse<UnitOfMeasure>> {
    return this.http.put<ApiResponse<UnitOfMeasure>>(`${this.api}/units-of-measure/${id}`, payload);
  }

  deleteUnit(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/units-of-measure/${id}`);
  }

  // ── Productos ────────────────────────────────────────────────

  getProducts(filters: { search?: string; category_id?: number; product_type?: string; is_active?: string; per_page?: number } = {}): Observable<ApiResponse<Product[]>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.category_id) params = params.set('category_id', String(filters.category_id));
    if (filters.product_type) params = params.set('product_type', filters.product_type);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    if (filters.per_page) params = params.set('per_page', String(filters.per_page));
    return this.http.get<ApiResponse<Product[]>>(`${this.api}/products`, { params });
  }

  getProduct(id: number): Observable<ApiResponse<Product>> {
    return this.http.get<ApiResponse<Product>>(`${this.api}/products/${id}`);
  }

  createProduct(payload: any): Observable<ApiResponse<Product>> {
    return this.http.post<ApiResponse<Product>>(`${this.api}/products`, payload);
  }

  updateProduct(id: number, payload: any): Observable<ApiResponse<Product>> {
    return this.http.put<ApiResponse<Product>>(`${this.api}/products/${id}`, payload);
  }

  deleteProduct(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/products/${id}`);
  }

  // ── Presentaciones (catálogo global) ────────────────────────

  /**
   * Lista todas las presentaciones del catálogo global.
   * GET /api/v1/presentations
   */
  getCatalogPresentations(filters: { search?: string; is_active?: string } = {}): Observable<ApiResponse<ProductPresentation[]>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    return this.http.get<ApiResponse<ProductPresentation[]>>(`${this.api}/presentations`, { params });
  }

  /**
   * Árbol global de presentaciones.
   * GET /api/v1/presentations/tree
   */
  getPresentationsTree(): Observable<ApiResponse<ProductPresentation[]>> {
    return this.http.get<ApiResponse<ProductPresentation[]>>(`${this.api}/presentations/tree`);
  }

  /**
   * Crea una presentación en el catálogo global (sin vincular a ningún producto).
   * POST /api/v1/presentations
   */
  createPresentation(payload: Partial<ProductPresentation>): Observable<ApiResponse<ProductPresentation>> {
    return this.http.post<ApiResponse<ProductPresentation>>(`${this.api}/presentations`, payload);
  }

  /**
   * Actualiza campos globales de una presentación del catálogo.
   * PUT /api/v1/presentations/{id}
   */
  updatePresentation(id: number, payload: Partial<ProductPresentation>): Observable<ApiResponse<ProductPresentation>> {
    return this.http.put<ApiResponse<ProductPresentation>>(`${this.api}/presentations/${id}`, payload);
  }

  /**
   * Elimina una presentación del catálogo global (la desvincula de TODOS los productos).
   * DELETE /api/v1/presentations/{id}
   */
  deletePresentation(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/presentations/${id}`);
  }

  // ── Presentaciones por producto ──────────────────────────────

  /**
   * Lista las presentaciones asignadas a un producto específico.
   * GET /api/v1/products/{productId}/presentations
   */
  getPresentations(productId: number): Observable<ApiResponse<ProductPresentation[]>> {
    return this.http.get<ApiResponse<ProductPresentation[]>>(`${this.api}/products/${productId}/presentations`);
  }

  /**
   * Asigna (o actualiza la vinculación de) una presentación a un producto.
   * POST /api/v1/products/{productId}/presentations/{presentationId}
   */
  attachPresentation(
    productId: number,
    presentationId: number,
    payload: PresentationAttachPayload = {},
  ): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(
      `${this.api}/products/${productId}/presentations/${presentationId}`,
      payload,
    );
  }

  /**
   * Desvincula una presentación de un producto (no la elimina del catálogo global).
   * DELETE /api/v1/products/{productId}/presentations/{presentationId}
   */
  detachPresentation(productId: number, presentationId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(
      `${this.api}/products/${productId}/presentations/${presentationId}`,
    );
  }

  /**
   * Valida la coherencia de jerarquía antes de crear/editar una presentación.
   * POST /api/v1/presentations/validate-hierarchy
   */
  validatePresentationHierarchy(payload: {
    parent_id?: number | null;
    factor_to_base: number;
    quantity_per_parent?: number | null;
    level: number;
  }): Observable<{ valid: boolean }> {
    return this.http.post<{ valid: boolean }>(`${this.api}/presentations/validate-hierarchy`, payload);
  }

  convertToBase(presentationId: number, quantity: number): Observable<ApiResponse<{ quantity_base: number }>> {
    return this.http.post<ApiResponse<{ quantity_base: number }>>(`${this.api}/presentations/convert-to-base`, { presentation_id: presentationId, quantity });
  }

  // ── Kit / BOM ────────────────────────────────────────────────

  getKitComponents(productId: number): Observable<ApiResponse<KitComponent[]>> {
    return this.http.get<ApiResponse<KitComponent[]>>(`${this.api}/products/${productId}/kit-components`);
  }

  syncKitComponents(productId: number, components: Partial<KitComponent>[]): Observable<ApiResponse<KitComponent[]>> {
    return this.http.put<ApiResponse<KitComponent[]>>(`${this.api}/products/${productId}/kit-components`, { components });
  }

  deleteKitComponent(productId: number, componentId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/products/${productId}/kit-components/${componentId}`);
  }

  explodeKit(productId: number, quantityKits: number): Observable<ApiResponse<KitExplosionLine[]>> {
    return this.http.post<ApiResponse<KitExplosionLine[]>>(`${this.api}/products/${productId}/kit-components/explode`, { quantity_kits: quantityKits });
  }

  getKitAvailability(productId: number, warehouseId: number): Observable<ApiResponse<KitAvailability>> {
    let params = new HttpParams().set('warehouse_id', String(warehouseId));
    return this.http.get<ApiResponse<KitAvailability>>(`${this.api}/products/${productId}/kit-availability`, { params });
  }

  // ── Proveedores ──────────────────────────────────────────────

  getSuppliers(filters: { search?: string; is_active?: string; per_page?: number } = {}): Observable<ApiResponse<Supplier[]>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    if (filters.per_page) params = params.set('per_page', String(filters.per_page));
    return this.http.get<ApiResponse<Supplier[]>>(`${this.api}/suppliers`, { params });
  }

  getSupplier(id: number): Observable<ApiResponse<Supplier>> {
    return this.http.get<ApiResponse<Supplier>>(`${this.api}/suppliers/${id}`);
  }

  createSupplier(payload: Partial<Supplier>): Observable<ApiResponse<Supplier>> {
    return this.http.post<ApiResponse<Supplier>>(`${this.api}/suppliers`, payload);
  }

  updateSupplier(id: number, payload: Partial<Supplier>): Observable<ApiResponse<Supplier>> {
    return this.http.put<ApiResponse<Supplier>>(`${this.api}/suppliers/${id}`, payload);
  }

  deleteSupplier(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/suppliers/${id}`);
  }

  // ── Productos del proveedor ──────────────────────────────────

  getSupplierProducts(supplierId: number): Observable<ApiResponse<SupplierProduct[]>> {
    return this.http.get<ApiResponse<SupplierProduct[]>>(`${this.api}/suppliers/${supplierId}/products`);
  }

  assignSupplierProduct(supplierId: number, productId: number, payload: Partial<SupplierProductPivot> = {}): Observable<ApiResponse<SupplierProduct>> {
    return this.http.post<ApiResponse<SupplierProduct>>(`${this.api}/suppliers/${supplierId}/products/${productId}`, payload);
  }

  assignSupplierProductsByCategory(
    supplierId: number,
    payload: { category_id: number; lead_time_days?: number | null; unit_price?: number; is_preferred?: boolean },
  ): Observable<ApiResponse<SupplierCategoryAssignResult>> {
    return this.http.post<ApiResponse<SupplierCategoryAssignResult>>(`${this.api}/suppliers/${supplierId}/products/by-category`, payload);
  }

  updateSupplierProductPivot(supplierId: number, productId: number, payload: Partial<SupplierProductPivot>): Observable<ApiResponse<SupplierProduct>> {
    return this.http.put<ApiResponse<SupplierProduct>>(`${this.api}/suppliers/${supplierId}/products/${productId}`, payload);
  }

  removeSupplierProduct(supplierId: number, productId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/suppliers/${supplierId}/products/${productId}`);
  }

  removeSupplierProductsByCategory(supplierId: number, categoryId: number): Observable<ApiResponse<SupplierCategoryRemoveResult>> {
    return this.http.delete<ApiResponse<SupplierCategoryRemoveResult>>(`${this.api}/suppliers/${supplierId}/products/by-category`, { body: { category_id: categoryId } });
  }

  // ── Importación masiva ───────────────────────────────────────

  importProducts(file: File): Observable<ApiResponse<ImportResult>> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ApiResponse<ImportResult>>(`${this.api}/import/products`, fd);
  }

  importSuppliers(file: File): Observable<ApiResponse<ImportResult>> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ApiResponse<ImportResult>>(`${this.api}/import/suppliers`, fd);
  }

  downloadTemplate(entity: 'products' | 'suppliers'): Observable<Blob> {
    return this.http.get(`${this.api}/import/templates/${entity}`, { responseType: 'blob' });
  }
}

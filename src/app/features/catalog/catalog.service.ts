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

/** Producto genérico — concepto clínico/logístico sin marca. Barcode auto-generado (6 dígitos). */
export interface Product {
  id: number;
  category_id: number;
  base_unit_id: number;
  classification_id: number | null;
  product_type: 'simple' | 'kit';
  name: string;
  barcode: string;
  description: string | null;
  requires_cold_chain: boolean;
  reorder_point: number;
  reorder_quantity: number;
  min_stock: number;
  max_stock: number;
  volume_cm3: number | null;
  weight_kg: number | null;
  concentration: string | null;
  pharmaceutical_form: string | null;
  is_active: boolean;
  category?: Pick<Category, 'id' | 'name' | 'code'>;
  base_unit?: Pick<UnitOfMeasure, 'id' | 'name' | 'abbreviation'>;
  classification?: ProductClassification;
  variants?: ProductVariant[];
  components?: KitComponent[];
  created_at?: string;
}

/** Variante de un genérico — instancia de marca/laboratorio. */
export interface ProductVariant {
  id: number;
  generic_product_id: number;
  lab_brand: string | null;
  brand_sku: string | null;
  commercial_presentation: string | null;
  serie_reference: string | null;
  useful_life: string | null;
  risk_level: string | null;
  is_active: boolean;
  sanitary_registrations?: SanitaryRegistration[];
}

export interface KitComponent {
  id: number;
  kit_generic_id?: number;
  component_generic_id: number;
  quantity_per_kit: number;
  sort_order: number;
  notes?: string | null;
  is_active?: boolean;
  component?: Pick<Product, 'id' | 'name' | 'barcode'>;
}

export interface ProductPresentation {
  id: number;
  parent_id: number | null;
  name: string;
  code: string;
  units_of_measure_id: number;
  quantity_per_parent: number | null;
  factor_to_base: number;
  level: number;
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

/** Variante con datos del pivot proveedor↔variante */
export interface SupplierProduct extends ProductVariant {
  generic?: Pick<Product, 'id' | 'name' | 'barcode' | 'category'>;
  pivot: SupplierProductPivot;
}

/** Proveedor con datos del pivot proveedor↔variante (vista desde la variante) */
export interface ProductSupplier extends Supplier {
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

export interface CatalogImportResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: { row: number; errors: Record<string, string[]> }[];
}

export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: { row: number; errors: Record<string, string[]> }[];
  related_catalogs?: {
    categories: CatalogImportResult;
    units_of_measure: CatalogImportResult;
    classifications: CatalogImportResult;
  };
}

export interface KitAvailability {
  generic_product_id: number;
  warehouse_id: number;
  available_kits: number;
}

export interface KitExplosionLine {
  component_generic_id: number;
  component_barcode: string;
  component_name: string;
  quantity_base: number;
}

export interface ProductClassification {
  id: number;
  code: string;
  name: string;
  description: string | null;
  has_sanitary_registration: boolean;
  has_concentration: boolean;
  has_risk_level: boolean;
  has_pharma_fields: boolean;
  has_device_fields: boolean;
  has_lab_brand: boolean;
  is_active: boolean;
}

export interface SanitaryRegistration {
  id: number;
  product_variant_id: number;
  registration_number: string;
  expiry_date: string;
  is_active: boolean;
  is_expired: boolean;
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

  // ── Productos genéricos ──────────────────────────────────────

  getProducts(filters: { search?: string; category_id?: number; product_type?: string; is_active?: string; per_page?: number } = {}): Observable<ApiResponse<Product[]>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.category_id) params = params.set('category_id', String(filters.category_id));
    if (filters.product_type) params = params.set('product_type', filters.product_type);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    if (filters.per_page) params = params.set('per_page', String(filters.per_page));
    return this.http.get<ApiResponse<Product[]>>(`${this.api}/generic-products`, { params });
  }

  getProduct(id: number): Observable<ApiResponse<Product>> {
    return this.http.get<ApiResponse<Product>>(`${this.api}/generic-products/${id}`);
  }

  createProduct(payload: any): Observable<ApiResponse<Product>> {
    return this.http.post<ApiResponse<Product>>(`${this.api}/generic-products`, payload);
  }

  updateProduct(id: number, payload: any): Observable<ApiResponse<Product>> {
    return this.http.put<ApiResponse<Product>>(`${this.api}/generic-products/${id}`, payload);
  }

  deleteProduct(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/generic-products/${id}`);
  }

  /** Busca un genérico por barcode escaneado (6 dígitos). */
  getProductByBarcode(barcode: string): Observable<ApiResponse<Product>> {
    return this.http.get<ApiResponse<Product>>(`${this.api}/generic-products/barcode/${barcode}`);
  }

  /** Devuelve el HTML listo para imprimir de la etiqueta de un genérico. */
  getBarcodePrintHtml(id: number): Observable<string> {
    return this.http.get(`${this.api}/generic-products/${id}/barcode/print`, { responseType: 'text' });
  }

  /** Devuelve el HTML listo para imprimir con la lista completa de barcodes. */
  getBarcodeListHtml(filters: { active?: string; category_id?: number } = {}): Observable<string> {
    let params = new HttpParams();
    if (filters.active) params = params.set('active', filters.active);
    if (filters.category_id) params = params.set('category_id', String(filters.category_id));
    return this.http.get(`${this.api}/generic-products/barcodes/list`, { params, responseType: 'text' });
  }

  // ── Variantes ────────────────────────────────────────────────

  getVariants(genericId: number): Observable<ApiResponse<ProductVariant[]>> {
    return this.http.get<ApiResponse<ProductVariant[]>>(`${this.api}/generic-products/${genericId}/variants`);
  }

  createVariant(genericId: number, payload: Partial<ProductVariant>): Observable<ApiResponse<ProductVariant>> {
    return this.http.post<ApiResponse<ProductVariant>>(`${this.api}/generic-products/${genericId}/variants`, payload);
  }

  updateVariant(genericId: number, variantId: number, payload: Partial<ProductVariant>): Observable<ApiResponse<ProductVariant>> {
    return this.http.put<ApiResponse<ProductVariant>>(`${this.api}/generic-products/${genericId}/variants/${variantId}`, payload);
  }

  deleteVariant(genericId: number, variantId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/generic-products/${genericId}/variants/${variantId}`);
  }

  // ── Presentaciones (catálogo global) ────────────────────────

  getCatalogPresentations(filters: { search?: string; is_active?: string } = {}): Observable<ApiResponse<ProductPresentation[]>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    return this.http.get<ApiResponse<ProductPresentation[]>>(`${this.api}/presentations`, { params });
  }

  getPresentationsTree(): Observable<ApiResponse<ProductPresentation[]>> {
    return this.http.get<ApiResponse<ProductPresentation[]>>(`${this.api}/presentations/tree`);
  }

  createPresentation(payload: Partial<ProductPresentation>): Observable<ApiResponse<ProductPresentation>> {
    return this.http.post<ApiResponse<ProductPresentation>>(`${this.api}/presentations`, payload);
  }

  updatePresentation(id: number, payload: Partial<ProductPresentation>): Observable<ApiResponse<ProductPresentation>> {
    return this.http.put<ApiResponse<ProductPresentation>>(`${this.api}/presentations/${id}`, payload);
  }

  deletePresentation(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/presentations/${id}`);
  }

  // ── Presentaciones por genérico ──────────────────────────────

  getPresentations(productId: number): Observable<ApiResponse<ProductPresentation[]>> {
    return this.http.get<ApiResponse<ProductPresentation[]>>(`${this.api}/generic-products/${productId}/presentations`);
  }

  attachPresentation(
    productId: number,
    presentationId: number,
    payload: PresentationAttachPayload = {},
  ): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(
      `${this.api}/generic-products/${productId}/presentations/${presentationId}`,
      payload,
    );
  }

  detachPresentation(productId: number, presentationId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(
      `${this.api}/generic-products/${productId}/presentations/${presentationId}`,
    );
  }

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
    return this.http.get<ApiResponse<KitComponent[]>>(`${this.api}/generic-products/${productId}/kit-components`);
  }

  syncKitComponents(productId: number, components: Partial<KitComponent>[]): Observable<ApiResponse<KitComponent[]>> {
    return this.http.put<ApiResponse<KitComponent[]>>(`${this.api}/generic-products/${productId}/kit-components`, { components });
  }

  deleteKitComponent(productId: number, componentId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/generic-products/${productId}/kit-components/${componentId}`);
  }

  explodeKit(productId: number, quantityKits: number): Observable<ApiResponse<KitExplosionLine[]>> {
    return this.http.post<ApiResponse<KitExplosionLine[]>>(`${this.api}/generic-products/${productId}/kit-components/explode`, { quantity_kits: quantityKits });
  }

  getKitAvailability(productId: number, warehouseId: number): Observable<ApiResponse<KitAvailability>> {
    let params = new HttpParams().set('warehouse_id', String(warehouseId));
    return this.http.get<ApiResponse<KitAvailability>>(`${this.api}/generic-products/${productId}/kit-availability`, { params });
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

  // ── Variantes del proveedor ──────────────────────────────────

  getSupplierProducts(supplierId: number): Observable<ApiResponse<SupplierProduct[]>> {
    return this.http.get<ApiResponse<SupplierProduct[]>>(`${this.api}/suppliers/${supplierId}/variants`);
  }

  getProductSuppliers(variantId: number): Observable<ApiResponse<ProductSupplier[]>> {
    return this.http.get<ApiResponse<ProductSupplier[]>>(`${this.api}/variants/${variantId}/suppliers`);
  }

  assignSupplierProduct(supplierId: number, variantId: number, payload: Partial<SupplierProductPivot> = {}): Observable<ApiResponse<SupplierProduct>> {
    return this.http.post<ApiResponse<SupplierProduct>>(`${this.api}/suppliers/${supplierId}/variants/${variantId}`, payload);
  }

  assignSupplierProductsByCategory(
    supplierId: number,
    payload: { category_id: number; lead_time_days?: number | null; unit_price?: number; is_preferred?: boolean },
  ): Observable<ApiResponse<SupplierCategoryAssignResult>> {
    return this.http.post<ApiResponse<SupplierCategoryAssignResult>>(`${this.api}/suppliers/${supplierId}/variants/by-category`, payload);
  }

  updateSupplierProductPivot(supplierId: number, variantId: number, payload: Partial<SupplierProductPivot>): Observable<ApiResponse<SupplierProduct>> {
    return this.http.put<ApiResponse<SupplierProduct>>(`${this.api}/suppliers/${supplierId}/variants/${variantId}`, payload);
  }

  removeSupplierProduct(supplierId: number, variantId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/suppliers/${supplierId}/variants/${variantId}`);
  }

  removeSupplierProductsByCategory(supplierId: number, categoryId: number): Observable<ApiResponse<SupplierCategoryRemoveResult>> {
    return this.http.delete<ApiResponse<SupplierCategoryRemoveResult>>(`${this.api}/suppliers/${supplierId}/variants/by-category`, { body: { category_id: categoryId } });
  }

  // ── Clasificaciones de Producto ──────────────────────────────

  getProductClassifications(filters: { search?: string; is_active?: string } = {}): Observable<ApiResponse<ProductClassification[]>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    return this.http.get<ApiResponse<ProductClassification[]>>(`${this.api}/product-classifications`, { params });
  }

  getProductClassification(id: number): Observable<ApiResponse<ProductClassification>> {
    return this.http.get<ApiResponse<ProductClassification>>(`${this.api}/product-classifications/${id}`);
  }

  createProductClassification(payload: Partial<ProductClassification>): Observable<ApiResponse<ProductClassification>> {
    return this.http.post<ApiResponse<ProductClassification>>(`${this.api}/product-classifications`, payload);
  }

  updateProductClassification(id: number, payload: Partial<ProductClassification>): Observable<ApiResponse<ProductClassification>> {
    return this.http.put<ApiResponse<ProductClassification>>(`${this.api}/product-classifications/${id}`, payload);
  }

  deleteProductClassification(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/product-classifications/${id}`);
  }

  // ── Registros Sanitarios (por variante) ─────────────────────

  getSanitaryRegistrations(variantId: number, filters: { only_active?: boolean } = {}): Observable<ApiResponse<SanitaryRegistration[]>> {
    let params = new HttpParams();
    if (filters.only_active) params = params.set('only_active', 'true');
    return this.http.get<ApiResponse<SanitaryRegistration[]>>(`${this.api}/variants/${variantId}/sanitary-registrations`, { params });
  }

  createSanitaryRegistration(variantId: number, payload: Partial<SanitaryRegistration>): Observable<ApiResponse<SanitaryRegistration>> {
    return this.http.post<ApiResponse<SanitaryRegistration>>(`${this.api}/variants/${variantId}/sanitary-registrations`, payload);
  }

  updateSanitaryRegistration(variantId: number, regId: number, payload: Partial<SanitaryRegistration>): Observable<ApiResponse<SanitaryRegistration>> {
    return this.http.put<ApiResponse<SanitaryRegistration>>(`${this.api}/variants/${variantId}/sanitary-registrations/${regId}`, payload);
  }

  deleteSanitaryRegistration(variantId: number, regId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/variants/${variantId}/sanitary-registrations/${regId}`);
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

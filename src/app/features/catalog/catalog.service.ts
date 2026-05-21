import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../core/models/api-response.model';

export interface Category {
  id: number; name: string; code: string; parent_id: number | null;
  description: string | null; children?: Category[];
}

export interface UnitOfMeasure {
  id: number; name: string; abbreviation: string;
}

export interface Product {
  id: number; code: string; name: string; description: string | null;
  product_type: 'simple' | 'kit'; category_id: number; unit_of_measure_id: number;
  min_stock: number | null; max_stock: number | null; reorder_point: number | null;
  is_active: boolean;
  category?: { id: number; name: string };
  unit_of_measure?: { id: number; name: string; abbreviation: string };
  suppliers?: { id: number; name: string; is_preferred: boolean; unit_cost: number; lead_time_days: number }[];
}

export interface ProductPresentation {
  id: number; product_id: number; code: string; name: string;
  quantity_per_parent: number | null; factor_to_base: number;
  parent_id: number | null; barcode: string | null; is_base_unit: boolean; level?: number;
  children?: ProductPresentation[];
}

export interface KitComponent {
  id: number; kit_product_id: number; component_product_id: number; quantity_per_kit: number;
  component?: { id: number; code: string; name: string };
}

export interface Supplier {
  id: number; name: string; tax_id: string | null; contact_name: string | null;
  contact_email: string | null; contact_phone: string | null; address: string | null;
  notes: string | null; is_active: boolean;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  // Categories
  getCategories(): Observable<ApiResponse<Category[]>> {
    return this.http.get<ApiResponse<Category[]>>(`${this.api}/categories`);
  }
  getCategoriesTree(): Observable<ApiResponse<Category[]>> {
    return this.http.get<ApiResponse<Category[]>>(`${this.api}/categories-tree`);
  }
  createCategory(p: Partial<Category>): Observable<ApiResponse<Category>> {
    return this.http.post<ApiResponse<Category>>(`${this.api}/categories`, p);
  }
  updateCategory(id: number, p: Partial<Category>): Observable<ApiResponse<Category>> {
    return this.http.put<ApiResponse<Category>>(`${this.api}/categories/${id}`, p);
  }
  deleteCategory(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/categories/${id}`);
  }

  // Units of Measure
  getUnits(): Observable<ApiResponse<UnitOfMeasure[]>> {
    return this.http.get<ApiResponse<UnitOfMeasure[]>>(`${this.api}/units-of-measure`);
  }
  createUnit(p: Partial<UnitOfMeasure>): Observable<ApiResponse<UnitOfMeasure>> {
    return this.http.post<ApiResponse<UnitOfMeasure>>(`${this.api}/units-of-measure`, p);
  }
  updateUnit(id: number, p: Partial<UnitOfMeasure>): Observable<ApiResponse<UnitOfMeasure>> {
    return this.http.put<ApiResponse<UnitOfMeasure>>(`${this.api}/units-of-measure/${id}`, p);
  }

  // Products
  getProducts(filters: { search?: string; category_id?: number; product_type?: string; is_active?: string; per_page?: number; page?: number } = {}): Observable<PaginatedResponse<Product>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.category_id) params = params.set('category_id', String(filters.category_id));
    if (filters.product_type) params = params.set('product_type', filters.product_type);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    if (filters.per_page) params = params.set('per_page', String(filters.per_page));
    if (filters.page) params = params.set('page', String(filters.page));
    return this.http.get<PaginatedResponse<Product>>(`${this.api}/products`, { params });
  }
  getProduct(id: number): Observable<ApiResponse<Product>> {
    return this.http.get<ApiResponse<Product>>(`${this.api}/products/${id}`);
  }
  createProduct(p: Partial<Product> & { components?: any[] }): Observable<ApiResponse<Product>> {
    return this.http.post<ApiResponse<Product>>(`${this.api}/products`, p);
  }
  updateProduct(id: number, p: Partial<Product>): Observable<ApiResponse<Product>> {
    return this.http.put<ApiResponse<Product>>(`${this.api}/products/${id}`, p);
  }
  deleteProduct(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/products/${id}`);
  }

  // Presentations
  getPresentations(productId: number): Observable<ApiResponse<ProductPresentation[]>> {
    return this.http.get<ApiResponse<ProductPresentation[]>>(`${this.api}/products/${productId}/presentations`);
  }
  createPresentation(productId: number, p: Partial<ProductPresentation>): Observable<ApiResponse<ProductPresentation>> {
    return this.http.post<ApiResponse<ProductPresentation>>(`${this.api}/products/${productId}/presentations`, p);
  }
  updatePresentation(id: number, p: Partial<ProductPresentation>): Observable<ApiResponse<ProductPresentation>> {
    return this.http.put<ApiResponse<ProductPresentation>>(`${this.api}/presentations/${id}`, p);
  }
  deletePresentation(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/presentations/${id}`);
  }

  // Kit Components
  getKitComponents(productId: number): Observable<ApiResponse<KitComponent[]>> {
    return this.http.get<ApiResponse<KitComponent[]>>(`${this.api}/products/${productId}/kit-components`);
  }
  syncKitComponents(productId: number, components: { component_product_id: number; quantity_per_kit: number }[]): Observable<ApiResponse<KitComponent[]>> {
    return this.http.put<ApiResponse<KitComponent[]>>(`${this.api}/products/${productId}/kit-components`, { components });
  }

  // Suppliers
  getSuppliers(filters: { search?: string; is_active?: string; page?: number; per_page?: number } = {}): Observable<PaginatedResponse<Supplier>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.per_page) params = params.set('per_page', String(filters.per_page));
    return this.http.get<PaginatedResponse<Supplier>>(`${this.api}/suppliers`, { params });
  }
  createSupplier(p: Partial<Supplier>): Observable<ApiResponse<Supplier>> {
    return this.http.post<ApiResponse<Supplier>>(`${this.api}/suppliers`, p);
  }
  updateSupplier(id: number, p: Partial<Supplier>): Observable<ApiResponse<Supplier>> {
    return this.http.put<ApiResponse<Supplier>>(`${this.api}/suppliers/${id}`, p);
  }
  deleteSupplier(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/suppliers/${id}`);
  }

  linkSupplierToProduct(productId: number, p: { supplier_id: number; product_presentation_id: number; unit_price: number; lead_time_days: number; is_preferred: boolean }): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.api}/products/${productId}/suppliers`, p);
  }

  // Import
  downloadTemplate(entity: 'products' | 'suppliers'): Observable<Blob> {
    return this.http.get(`${this.api}/import/templates/${entity}`, { responseType: 'blob' });
  }
  importProducts(file: File): Observable<ApiResponse<{ imported: number; errors: any[] }>> {
    const fd = new FormData(); fd.append('file', file);
    return this.http.post<ApiResponse<any>>(`${this.api}/import/products`, fd);
  }
  importSuppliers(file: File): Observable<ApiResponse<{ imported: number; errors: any[] }>> {
    const fd = new FormData(); fd.append('file', file);
    return this.http.post<ApiResponse<any>>(`${this.api}/import/suppliers`, fd);
  }
}

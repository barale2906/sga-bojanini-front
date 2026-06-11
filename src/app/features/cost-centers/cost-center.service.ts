import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';

export type CostCenterType = 'internal' | 'external';

export interface CostCenter {
  id: number;
  code: string;
  name: string;
  type: CostCenterType;
  type_label: string;
  is_external: boolean;
  description: string | null;
  is_active: boolean;
}

export interface CostCenterFilters {
  type?: CostCenterType;
  is_active?: boolean;
  search?: string;
}

export interface CostCenterPayload {
  code: string;
  name: string;
  type: CostCenterType;
  description?: string | null;
  is_active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CostCenterService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getCostCenters(filters: CostCenterFilters = {}): Observable<ApiResponse<CostCenter[]>> {
    let params = new HttpParams();
    if (filters.type) params = params.set('type', filters.type);
    if (filters.is_active !== undefined) params = params.set('is_active', String(filters.is_active));
    if (filters.search) params = params.set('search', filters.search);

    return this.http.get<ApiResponse<CostCenter[]>>(`${this.api}/cost-centers`, { params });
  }

  getCostCenter(id: number): Observable<ApiResponse<CostCenter>> {
    return this.http.get<ApiResponse<CostCenter>>(`${this.api}/cost-centers/${id}`);
  }

  createCostCenter(payload: CostCenterPayload): Observable<ApiResponse<CostCenter>> {
    return this.http.post<ApiResponse<CostCenter>>(`${this.api}/cost-centers`, payload);
  }

  updateCostCenter(id: number, payload: CostCenterPayload): Observable<ApiResponse<CostCenter>> {
    return this.http.put<ApiResponse<CostCenter>>(`${this.api}/cost-centers/${id}`, payload);
  }

  deleteCostCenter(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/cost-centers/${id}`);
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';

export interface Warehouse {
  id: number;
  name: string;
  code: string;
  address: string | null;
  description: string | null;
  is_active: boolean;
}

export interface Zone {
  id: number;
  warehouse_id: number;
  name: string;
  code: string;
  type: 'ambient' | 'cold' | 'frozen' | 'controlled';
  temp_min: number | null;
  temp_max: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  description: string | null;
  is_active: boolean;
}

export interface Location {
  id: number;
  zone_id: number;
  name: string;
  code: string;
  volume_cm3: number | null;
  max_weight_kg: number | null;
  description: string | null;
  is_active: boolean;
}

// ── Capacidad física ──────────────────────────────────────────

export interface CapacityVolume {
  max_cm3: number | null;
  used_cm3: number;
  available_cm3: number | null;
  usage_pct: number | null;
}

export interface CapacityWeight {
  max_kg: number | null;
  used_kg: number;
  available_kg: number | null;
  usage_pct: number | null;
}

export interface LocationCapacity {
  id: number;
  name: string;
  code: string;
  zone_id: number;
  capacity_volume: CapacityVolume;
  capacity_weight: CapacityWeight;
}

export interface ZoneCapacity {
  id: number;
  name: string;
  code: string;
  warehouse_id: number;
  capacity_volume: CapacityVolume;
  capacity_weight: CapacityWeight;
  locations: LocationCapacity[];
}

export interface WarehouseCapacity {
  id: number;
  name: string;
  code: string;
  capacity_volume: CapacityVolume;
  capacity_weight: CapacityWeight;
  zones: ZoneCapacity[];
}

@Injectable({ providedIn: 'root' })
export class WarehouseService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  // Warehouses
  getWarehouses(filters: { search?: string; is_active?: string } = {}): Observable<ApiResponse<Warehouse[]>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    return this.http.get<ApiResponse<Warehouse[]>>(`${this.api}/warehouses`, { params });
  }

  getWarehouse(id: number): Observable<ApiResponse<Warehouse>> {
    return this.http.get<ApiResponse<Warehouse>>(`${this.api}/warehouses/${id}`);
  }

  createWarehouse(payload: Partial<Warehouse>): Observable<ApiResponse<Warehouse>> {
    return this.http.post<ApiResponse<Warehouse>>(`${this.api}/warehouses`, payload);
  }

  updateWarehouse(id: number, payload: Partial<Warehouse>): Observable<ApiResponse<Warehouse>> {
    return this.http.put<ApiResponse<Warehouse>>(`${this.api}/warehouses/${id}`, payload);
  }

  deleteWarehouse(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/warehouses/${id}`);
  }

  getWarehouseZones(warehouseId: number): Observable<ApiResponse<Zone[]>> {
    return this.http.get<ApiResponse<Zone[]>>(`${this.api}/warehouses/${warehouseId}/zones`);
  }

  getWarehouseLocations(warehouseId: number): Observable<ApiResponse<Location[]>> {
    return this.http.get<ApiResponse<Location[]>>(`${this.api}/warehouses/${warehouseId}/locations`);
  }

  // Zones
  getZones(filters: { warehouse_id?: number; is_active?: string; type?: string; search?: string } = {}): Observable<ApiResponse<Zone[]>> {
    let params = new HttpParams();
    if (filters.warehouse_id) params = params.set('warehouse_id', String(filters.warehouse_id));
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    if (filters.type) params = params.set('type', filters.type);
    if (filters.search) params = params.set('search', filters.search);
    return this.http.get<ApiResponse<Zone[]>>(`${this.api}/zones`, { params });
  }

  createZone(payload: Partial<Zone>): Observable<ApiResponse<Zone>> {
    return this.http.post<ApiResponse<Zone>>(`${this.api}/zones`, payload);
  }

  updateZone(id: number, payload: Partial<Zone>): Observable<ApiResponse<Zone>> {
    return this.http.put<ApiResponse<Zone>>(`${this.api}/zones/${id}`, payload);
  }

  deleteZone(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/zones/${id}`);
  }

  // Locations
  getLocations(filters: { zone_id?: number; warehouse_id?: number; is_active?: string } = {}): Observable<ApiResponse<Location[]>> {
    let params = new HttpParams();
    if (filters.zone_id) params = params.set('zone_id', String(filters.zone_id));
    if (filters.warehouse_id) params = params.set('warehouse_id', String(filters.warehouse_id));
    if (filters.is_active !== undefined && filters.is_active !== '') params = params.set('is_active', filters.is_active);
    return this.http.get<ApiResponse<Location[]>>(`${this.api}/locations`, { params });
  }

  createLocation(payload: Partial<Location>): Observable<ApiResponse<Location>> {
    return this.http.post<ApiResponse<Location>>(`${this.api}/locations`, payload);
  }

  updateLocation(id: number, payload: Partial<Location>): Observable<ApiResponse<Location>> {
    return this.http.put<ApiResponse<Location>>(`${this.api}/locations/${id}`, payload);
  }

  deleteLocation(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/locations/${id}`);
  }

  // ── Capacidad física ──────────────────────────────────────────

  getLocationCapacity(id: number): Observable<ApiResponse<LocationCapacity>> {
    return this.http.get<ApiResponse<LocationCapacity>>(`${this.api}/locations/${id}/capacity`);
  }

  getZoneCapacity(id: number): Observable<ApiResponse<ZoneCapacity>> {
    return this.http.get<ApiResponse<ZoneCapacity>>(`${this.api}/zones/${id}/capacity`);
  }

  getWarehouseCapacity(id: number): Observable<ApiResponse<WarehouseCapacity>> {
    return this.http.get<ApiResponse<WarehouseCapacity>>(`${this.api}/warehouses/${id}/capacity`);
  }
}

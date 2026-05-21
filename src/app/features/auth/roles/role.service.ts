import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../core/models/api-response.model';

export interface Permission {
  id: number;
  name: string;
  guard_name: string;
}

export interface Role {
  id: number;
  name: string;
  permissions: string[];
  users_count: number;
}

export interface PermissionsGrouped {
  [module: string]: Permission[];
}

@Injectable({ providedIn: 'root' })
export class RoleService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getAll(): Observable<ApiResponse<Role[]>> {
    return this.http.get<ApiResponse<Role[]>>(`${this.api}/roles`);
  }

  getById(id: number): Observable<ApiResponse<Role>> {
    return this.http.get<ApiResponse<Role>>(`${this.api}/roles/${id}`);
  }

  create(payload: { name: string; permission_ids: number[] }): Observable<ApiResponse<Role>> {
    return this.http.post<ApiResponse<Role>>(`${this.api}/roles`, payload);
  }

  update(id: number, payload: { name: string; permission_ids: number[] }): Observable<ApiResponse<Role>> {
    return this.http.put<ApiResponse<Role>>(`${this.api}/roles/${id}`, payload);
  }

  delete(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/roles/${id}`);
  }

  getPermissions(): Observable<ApiResponse<PermissionsGrouped>> {
    return this.http.get<ApiResponse<PermissionsGrouped>>(`${this.api}/permissions`);
  }
}

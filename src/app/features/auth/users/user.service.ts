import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';
import { User } from '../../../core/models/user.model';

export interface UserCreatePayload {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  is_active?: boolean;
  role_ids?: number[];
}

export interface UserFilters {
  search?: string;
  is_active?: boolean | string;
  role?: string;
  per_page?: number;
  page?: number;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getAll(filters: UserFilters = {}): Observable<PaginatedResponse<User>> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.is_active !== undefined && filters.is_active !== '')
      params = params.set('is_active', String(filters.is_active));
    if (filters.role) params = params.set('role', filters.role);
    if (filters.per_page) params = params.set('per_page', String(filters.per_page));
    if (filters.page) params = params.set('page', String(filters.page));

    return this.http.get<PaginatedResponse<User>>(`${this.api}/users`, { params });
  }

  getById(id: number): Observable<ApiResponse<User>> {
    return this.http.get<ApiResponse<User>>(`${this.api}/users/${id}`);
  }

  create(payload: UserCreatePayload): Observable<ApiResponse<User>> {
    return this.http.post<ApiResponse<User>>(`${this.api}/users`, payload);
  }

  update(id: number, payload: Partial<UserCreatePayload>): Observable<ApiResponse<User>> {
    return this.http.put<ApiResponse<User>>(`${this.api}/users/${id}`, payload);
  }

  delete(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/users/${id}`);
  }

  assignRoles(id: number, roleIds: number[]): Observable<ApiResponse<User>> {
    return this.http.post<ApiResponse<User>>(`${this.api}/users/${id}/roles`, {
      role_ids: roleIds,
    });
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../core/models/api-response.model';
import { FileDownloadService } from '../../shared/services/file-download.service';
import {
  AssetMaintenance, CompleteMaintenancePayload, MaintenanceFilters, MaintenancePlan,
  MaintenancePlanPayload, ScheduleMaintenancePayload, compactParams,
} from './assets.models';

/** Planes, cronograma y órdenes de mantenimiento de activos. */
@Injectable({ providedIn: 'root' })
export class AssetMaintenanceService {
  private http = inject(HttpClient);
  private files = inject(FileDownloadService);
  private api = `${environment.apiUrl}/assets`;

  // ── Planes ────────────────────────────────────────────────────────────────

  plans(assetId: number): Observable<ApiResponse<MaintenancePlan[]>> {
    return this.http.get<ApiResponse<MaintenancePlan[]>>(`${this.api}/${assetId}/maintenance-plans`);
  }

  createPlan(assetId: number, payload: MaintenancePlanPayload): Observable<ApiResponse<MaintenancePlan>> {
    return this.http.post<ApiResponse<MaintenancePlan>>(`${this.api}/${assetId}/maintenance-plans`, payload);
  }

  updatePlan(planId: number, payload: MaintenancePlanPayload): Observable<ApiResponse<MaintenancePlan>> {
    return this.http.put<ApiResponse<MaintenancePlan>>(`${this.api}/maintenance-plans/${planId}`, payload);
  }

  deletePlan(planId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/maintenance-plans/${planId}`);
  }

  // ── Órdenes ───────────────────────────────────────────────────────────────

  list(filters: MaintenanceFilters = {}): Observable<PaginatedResponse<AssetMaintenance>> {
    return this.http.get<PaginatedResponse<AssetMaintenance>>(`${this.api}/maintenances`, { params: compactParams(filters) });
  }

  get(id: number): Observable<ApiResponse<AssetMaintenance>> {
    return this.http.get<ApiResponse<AssetMaintenance>>(`${this.api}/maintenances/${id}`);
  }

  schedule(assetId: number, payload: ScheduleMaintenancePayload): Observable<ApiResponse<AssetMaintenance>> {
    return this.http.post<ApiResponse<AssetMaintenance>>(`${this.api}/${assetId}/maintenances`, payload);
  }

  reschedule(id: number, scheduledDate: string, reportedFailure?: string | null): Observable<ApiResponse<AssetMaintenance>> {
    return this.http.put<ApiResponse<AssetMaintenance>>(`${this.api}/maintenances/${id}`, {
      scheduled_date: scheduledDate,
      reported_failure: reportedFailure || null,
    });
  }

  start(id: number): Observable<ApiResponse<AssetMaintenance>> {
    return this.http.post<ApiResponse<AssetMaintenance>>(`${this.api}/maintenances/${id}/start`, {});
  }

  complete(id: number, payload: CompleteMaintenancePayload): Observable<ApiResponse<AssetMaintenance>> {
    return this.http.post<ApiResponse<AssetMaintenance>>(`${this.api}/maintenances/${id}/complete`, payload);
  }

  cancel(id: number, reason: string): Observable<ApiResponse<AssetMaintenance>> {
    return this.http.post<ApiResponse<AssetMaintenance>>(`${this.api}/maintenances/${id}/cancel`, { reason });
  }

  openReport(id: number): Observable<void> {
    return this.files.open(`${this.api}/maintenances/${id}/report`);
  }

  exportSchedule(filters: MaintenanceFilters = {}): Observable<void> {
    return this.files.download(`${this.api}/reports/maintenance-schedule`, 'cronograma_mantenimiento.xlsx', compactParams(filters));
  }
}

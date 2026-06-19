import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable, catchError, from, map, switchMap, throwError } from 'rxjs';
import { saveAs } from 'file-saver';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { User } from '../../core/models/user.model';

export interface Sensor {
  id: number; zone_id: number; code: string; name: string;
  type: 'temperature' | 'humidity' | 'pressure'; unit: string; is_active: boolean;
  zone?: { id: number; name: string };
}

export interface SensorReading {
  id: number; sensor_id: number; value: number; reading_source: string;
  recorded_at: string; user_id?: number;
}

export interface SensorStats {
  sensor_id: number; total_readings: number; mean: number; std_dev: number;
  ucl: number; lcl: number; uwl: number; lwl: number;
  cp: number; cpk: number; process_capable: boolean;
  out_of_control_count: number;
  out_of_control_readings: { id: number; value: number; recorded_at: string; deviation: number }[];
  readings: { id: number; value: number; recorded_at: string; status: 'ok' | 'warning' | 'alarm' }[];
}

export interface AlertRule {
  id: number; sensor_id: number; condition_type: string; threshold: number;
  consecutive_readings: number; notification_channels: string[]; is_active: boolean;
}

@Injectable({ providedIn: 'root' })
export class MonitoringService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getSensors(f: { zone_id?: number; type?: string; is_active?: string } = {}): Observable<ApiResponse<Sensor[]>> {
    let p = new HttpParams();
    if (f.zone_id) p = p.set('zone_id', String(f.zone_id));
    if (f.type) p = p.set('type', f.type);
    if (f.is_active !== undefined && f.is_active !== '') p = p.set('is_active', f.is_active);
    return this.http.get<ApiResponse<Sensor[]>>(`${this.api}/sensors`, { params: p });
  }

  createSensor(payload: Partial<Sensor>): Observable<ApiResponse<Sensor>> {
    return this.http.post<ApiResponse<Sensor>>(`${this.api}/sensors`, payload);
  }

  updateSensor(id: number, payload: Partial<Sensor>): Observable<ApiResponse<Sensor>> {
    return this.http.put<ApiResponse<Sensor>>(`${this.api}/sensors/${id}`, payload);
  }

  deleteSensor(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/sensors/${id}`);
  }

  getSensorUsers(sensorId: number): Observable<ApiResponse<User[]>> {
    return this.http.get<ApiResponse<User[]>>(`${this.api}/sensors/${sensorId}/users`);
  }

  getReadings(sensorId: number, dateFrom?: string, dateTo?: string): Observable<ApiResponse<SensorReading[]>> {
    let p = new HttpParams();
    if (dateFrom) p = p.set('date_from', dateFrom);
    if (dateTo) p = p.set('date_to', dateTo);
    return this.http.get<ApiResponse<SensorReading[]>>(`${this.api}/sensors/${sensorId}/readings`, { params: p });
  }

  createReading(sensorId: number, payload: { value: number; reading_source: string; recorded_at: string }): Observable<ApiResponse<{ reading: SensorReading; alerts: any[] }>> {
    return this.http.post<ApiResponse<{ reading: SensorReading; alerts: any[] }>>(`${this.api}/sensors/${sensorId}/readings`, payload);
  }

  getStatistics(sensorId: number, dateFrom: string, dateTo: string): Observable<ApiResponse<SensorStats>> {
    return this.http.get<ApiResponse<SensorStats>>(`${this.api}/sensors/${sensorId}/statistics`, {
      params: new HttpParams().set('date_from', dateFrom).set('date_to', dateTo),
    });
  }

  getTrend(sensorId: number, dateFrom: string, dateTo: string): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${this.api}/sensors/${sensorId}/trend`, {
      params: new HttpParams().set('date_from', dateFrom).set('date_to', dateTo),
    });
  }

  getAlertRules(sensorId: number): Observable<ApiResponse<AlertRule[]>> {
    return this.http.get<ApiResponse<AlertRule[]>>(`${this.api}/sensors/${sensorId}/alert-rules`);
  }

  createAlertRule(sensorId: number, payload: Partial<AlertRule>): Observable<ApiResponse<AlertRule>> {
    return this.http.post<ApiResponse<AlertRule>>(`${this.api}/sensors/${sensorId}/alert-rules`, payload);
  }

  updateAlertRule(_sensorId: number, ruleId: number, payload: Partial<AlertRule>): Observable<ApiResponse<AlertRule>> {
    return this.http.put<ApiResponse<AlertRule>>(`${this.api}/alert-rules/${ruleId}`, payload);
  }

  deleteAlertRule(_sensorId: number, ruleId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/alert-rules/${ruleId}`);
  }

  /**
   * Genera el PDF de condiciones de un sensor y dispara su descarga
   * directa en el navegador (el backend no lo guarda en disco).
   */
  generateReport(sensorId: number, dateFrom: string, dateTo: string): Observable<void> {
    return this.http
      .post(
        `${this.api}/monitoring/reports/generate`,
        { sensor_id: sensorId, date_from: dateFrom, date_to: dateTo },
        { responseType: 'blob', observe: 'response' },
      )
      .pipe(
        map((res: HttpResponse<Blob>) => {
          const filename = this.extractFilename(res.headers.get('content-disposition')) ?? 'reporte-condiciones.pdf';
          saveAs(res.body as Blob, filename);
        }),
        catchError((err: HttpErrorResponse) => this.parseBlobError(err)),
      );
  }

  /** Reportes diarios de condiciones archivados automáticamente (ver sga:generate-condition-reports). */
  getReports(): Observable<ApiResponse<any[]>> {
    return this.http.get<ApiResponse<any[]>>(`${this.api}/monitoring/reports`);
  }

  private parseBlobError(err: HttpErrorResponse): Observable<never> {
    if (err.error instanceof Blob && err.error.type.includes('json')) {
      return from(err.error.text()).pipe(
        switchMap((text) => {
          let parsed: unknown = {};
          try {
            parsed = JSON.parse(text);
          } catch {
            /* respuesta no parseable, se conserva el error original */
          }
          return throwError(() => new HttpErrorResponse({ error: parsed, headers: err.headers, status: err.status, statusText: err.statusText, url: err.url ?? undefined }));
        }),
      );
    }
    return throwError(() => err);
  }

  private extractFilename(header: string | null): string | null {
    if (!header) return null;
    const match = header.match(/filename="?([^";]+)"?/i);
    return match ? match[1] : null;
  }
}

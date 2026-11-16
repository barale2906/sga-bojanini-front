import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable, catchError, from, map, switchMap, throwError } from 'rxjs';
import { saveAs } from 'file-saver';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { User } from '../../core/models/user.model';
import { FileDownloadService } from '../../shared/services/file-download.service';

export type ZoneType = 'ambient' | 'cold' | 'frozen' | 'controlled';

/** Zona del sensor con su almacén y las condiciones que debe cumplir. */
export interface SensorZone {
  id: number; name: string; code: string; type: ZoneType;
  temp_min: number | null; temp_max: number | null;
  humidity_min: number | null; humidity_max: number | null;
  warehouse_id: number; warehouse_name: string | null;
}

export type CalibrationStatus = 'missing' | 'valid' | 'expiring' | 'expired';

export interface CalibrationSummary {
  status: CalibrationStatus; status_label: string;
  id: number | null; expires_at: string | null; days_left: number | null;
}

export interface LastReading {
  id: number; value: number; recorded_at: string; created_at: string | null;
  reading_source: 'manual' | 'iot'; user_name: string | null;
}

export interface Sensor {
  id: number; zone_id: number; code?: string; name: string;
  type: 'temperature' | 'humidity'; unit: string; is_active: boolean;
  zone?: SensorZone | null;
  calibration?: CalibrationSummary;
  last_reading?: LastReading | null;
}

export interface CalibrationCertificate {
  id: number; sensor_id: number;
  certificate_number: string | null; laboratory: string | null;
  calibrated_at: string | null; expires_at: string; days_left: number;
  is_current: boolean;
  status: CalibrationStatus | 'replaced'; status_label: string;
  replaced_at: string | null;
  original_name: string; mime_type: string; size: number; notes: string | null;
  uploaded_by: { id: number; name: string } | null;
  created_at: string | null;
}

/** Campos del certificado (multipart). */
export interface CalibrationPayload {
  file: File; expires_at: string; calibrated_at?: string | null;
  certificate_number?: string | null; laboratory?: string | null; notes?: string | null;
}

export interface SensorPayload {
  zone_id: number; name: string; type: string; unit: string; is_active?: boolean;
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
  private files = inject(FileDownloadService);

  getSensors(f: { zone_id?: number; type?: string; is_active?: string } = {}): Observable<ApiResponse<Sensor[]>> {
    let p = new HttpParams();
    if (f.zone_id) p = p.set('zone_id', String(f.zone_id));
    if (f.type) p = p.set('type', f.type);
    if (f.is_active !== undefined && f.is_active !== '') p = p.set('is_active', f.is_active);
    return this.http.get<ApiResponse<Sensor[]>>(`${this.api}/sensors`, { params: p });
  }

  /**
   * Crea el sensor. Si se adjunta el certificado de calibración se envía
   * todo en un único multipart (campos `certificate_*`); si no, JSON.
   */
  createSensor(payload: SensorPayload, certificate?: CalibrationPayload | null): Observable<ApiResponse<Sensor>> {
    if (!certificate) {
      return this.http.post<ApiResponse<Sensor>>(`${this.api}/sensors`, payload);
    }
    const fd = new FormData();
    fd.append('zone_id', String(payload.zone_id));
    fd.append('name', payload.name);
    fd.append('type', payload.type);
    fd.append('unit', payload.unit);
    this.appendCertificate(fd, certificate, 'certificate_');
    return this.http.post<ApiResponse<Sensor>>(`${this.api}/sensors`, fd);
  }

  updateSensor(id: number, payload: SensorPayload): Observable<ApiResponse<Sensor>> {
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

  /** Último registro del equipo (null si aún no tiene lecturas). */
  getLatestReading(sensorId: number): Observable<ApiResponse<LastReading | null>> {
    return this.http.get<ApiResponse<LastReading | null>>(`${this.api}/sensors/${sensorId}/readings/latest`);
  }

  /** Descarga en Excel las lecturas del periodo (con resumen estadístico). */
  exportReadings(sensorId: number, dateFrom: string, dateTo: string): Observable<void> {
    return this.files.download(
      `${this.api}/sensors/${sensorId}/readings/export`,
      `lecturas_${dateFrom}_${dateTo}.xlsx`,
      { date_from: dateFrom, date_to: dateTo },
    );
  }

  // ── Certificados de calibración ─────────────────────────────

  getCalibrations(sensorId: number): Observable<ApiResponse<CalibrationCertificate[]>> {
    return this.http.get<ApiResponse<CalibrationCertificate[]>>(`${this.api}/sensors/${sensorId}/calibrations`);
  }

  uploadCalibration(sensorId: number, payload: CalibrationPayload): Observable<ApiResponse<CalibrationCertificate>> {
    const fd = new FormData();
    this.appendCertificate(fd, payload);
    return this.http.post<ApiResponse<CalibrationCertificate>>(`${this.api}/sensors/${sensorId}/calibrations`, fd);
  }

  downloadCalibration(cert: CalibrationCertificate): Observable<void> {
    return this.files.download(`${this.api}/calibrations/${cert.id}/download`, cert.original_name);
  }

  deleteCalibration(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/calibrations/${id}`);
  }

  private appendCertificate(fd: FormData, c: CalibrationPayload, prefix = ''): void {
    fd.append(`${prefix}file`, c.file);
    fd.append(`${prefix}expires_at`, c.expires_at);
    if (c.calibrated_at) fd.append(`${prefix}calibrated_at`, c.calibrated_at);
    if (c.certificate_number) fd.append(`${prefix}certificate_number`, c.certificate_number);
    if (c.laboratory) fd.append(`${prefix}laboratory`, c.laboratory);
    if (c.notes) fd.append(`${prefix}notes`, c.notes);
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

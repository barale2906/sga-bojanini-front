import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';

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

  generateReport(sensorId: number, dateFrom: string, dateTo: string): Observable<ApiResponse<{ path: string; filename: string }>> {
    return this.http.post<ApiResponse<any>>(`${this.api}/monitoring/reports/generate`, { sensor_id: sensorId, date_from: dateFrom, date_to: dateTo });
  }

  getReports(): Observable<ApiResponse<any[]>> {
    return this.http.get<ApiResponse<any[]>>(`${this.api}/monitoring/reports`);
  }
}

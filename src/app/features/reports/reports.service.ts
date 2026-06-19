import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable, catchError, from, of, switchMap, throwError } from 'rxjs';
import { saveAs } from 'file-saver';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../core/models/api-response.model';

export type ReportType = 'inventory' | 'movements' | 'expiring' | 'purchases' | 'consumption' | 'audit' | 'conditions';
export type ReportFormat = 'pdf' | 'excel' | 'csv';
export type ExportStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'expired';

export interface ReportFilters {
  format: ReportFormat;
  [key: string]: string | number | undefined;
}

export interface ReportExport {
  id: string;
  type: string;
  format: ReportFormat;
  status: ExportStatus;
  is_ready: boolean;
  is_expired: boolean;
  file_size: number | null;
  error_message: string | null;
  expires_at: string | null;
  download_url: string | null;
  created_at?: string;
}

export type GenerateReportResult =
  | { mode: 'sync' }
  | { mode: 'async'; export_id: string; status: string; message: string };

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  generate(type: ReportType, filters: ReportFilters): Observable<GenerateReportResult> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    });

    return this.http
      .get(`${this.api}/reports/${type}`, { params, responseType: 'blob', observe: 'response' })
      .pipe(
        switchMap((res) => this.handleReportResponse(res)),
        catchError((err: HttpErrorResponse) => this.parseBlobError(err))
      );
  }

  getExport(exportId: string): Observable<ApiResponse<ReportExport>> {
    return this.http.get<ApiResponse<ReportExport>>(`${this.api}/reports/exports/${exportId}`);
  }

  listExports(page = 1, perPage = 25): Observable<PaginatedResponse<ReportExport>> {
    const params = new HttpParams().set('page', page).set('per_page', perPage);
    return this.http.get<PaginatedResponse<ReportExport>>(`${this.api}/reports/exports`, { params });
  }

  downloadExport(exportId: string): Observable<void> {
    return this.http
      .get(`${this.api}/reports/exports/${exportId}/download`, { responseType: 'blob', observe: 'response' })
      .pipe(
        switchMap((res) => {
          this.saveBlobResponse(res);
          return of(void 0);
        }),
        catchError((err: HttpErrorResponse) => this.parseBlobError(err))
      );
  }

  private handleReportResponse(res: HttpResponse<Blob>): Observable<GenerateReportResult> {
    const contentType = res.headers.get('content-type') || '';
    const blob = res.body as Blob;

    if (contentType.includes('application/json')) {
      return from(blob.text()).pipe(
        switchMap((text) => {
          const json = JSON.parse(text);
          const result: GenerateReportResult = {
            mode: 'async',
            export_id: json.data?.export_id,
            status: json.data?.status,
            message: json.message,
          };
          return of(result);
        })
      );
    }

    this.saveBlobResponse(res);
    return of({ mode: 'sync' } as GenerateReportResult);
  }

  private saveBlobResponse(res: HttpResponse<Blob>): void {
    const contentType = res.headers.get('content-type') || '';
    const filename = this.extractFilename(res.headers.get('content-disposition')) ?? `reporte.${this.extFromContentType(contentType)}`;
    saveAs(res.body as Blob, filename);
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
        })
      );
    }
    return throwError(() => err);
  }

  private extractFilename(header: string | null): string | null {
    if (!header) return null;
    const match = header.match(/filename="?([^";]+)"?/i);
    return match ? match[1] : null;
  }

  private extFromContentType(contentType: string): string {
    if (contentType.includes('pdf')) return 'pdf';
    if (contentType.includes('spreadsheet') || contentType.includes('excel')) return 'xlsx';
    if (contentType.includes('csv')) return 'csv';
    return 'bin';
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable, catchError, from, map, switchMap, throwError } from 'rxjs';
import { saveAs } from 'file-saver';

/**
 * Descarga archivos binarios (PDF, Excel) del API y los guarda con el nombre
 * indicado por `Content-Disposition`. Si el API responde un error JSON dentro
 * del blob, lo convierte en un `HttpErrorResponse` legible (`error.message`).
 */
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  private http = inject(HttpClient);

  download(url: string, fallbackName: string, params: Record<string, string> = {}): Observable<void> {
    return this.http
      .get(url, { params: new HttpParams({ fromObject: params }), responseType: 'blob', observe: 'response' })
      .pipe(
        map(res => saveAs(res.body as Blob, this.filename(res) ?? fallbackName)),
        catchError((err: HttpErrorResponse) => this.parseBlobError(err)),
      );
  }

  /** Abre un PDF en una pestaña nueva (para imprimir) en lugar de descargarlo. */
  open(url: string, params: Record<string, string> = {}): Observable<void> {
    return this.http
      .get(url, { params: new HttpParams({ fromObject: params }), responseType: 'blob' })
      .pipe(
        map(blob => {
          const objectUrl = URL.createObjectURL(blob);
          window.open(objectUrl, '_blank');
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        }),
        catchError((err: HttpErrorResponse) => this.parseBlobError(err)),
      );
  }

  private filename(res: HttpResponse<Blob>): string | null {
    const header = res.headers.get('content-disposition');
    const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private parseBlobError(err: HttpErrorResponse): Observable<never> {
    if (err.error instanceof Blob && err.error.type.includes('json')) {
      return from(err.error.text()).pipe(
        switchMap(text => {
          let body: unknown = {};
          try { body = JSON.parse(text); } catch { /* cuerpo no JSON */ }
          return throwError(() => new HttpErrorResponse({ status: err.status, error: body, headers: err.headers }));
        }),
      );
    }
    return throwError(() => err);
  }
}

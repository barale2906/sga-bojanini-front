import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AssetsService } from './assets.service';
import { AssetMaintenanceService } from './asset-maintenance.service';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/assets`;

describe('AssetsService', () => {
  let svc: AssetsService;
  let maintenance: AssetMaintenanceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(AssetsService);
    maintenance = TestBed.inject(AssetMaintenanceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list() envía solo los filtros con valor', () => {
    svc.list({ search: 'monitor', site_id: null, asset_type: '', maintenance_overdue: true, page: 2 }).subscribe();

    const req = http.expectOne(r => r.url === API);
    expect(req.request.params.keys().sort()).toEqual(['maintenance_overdue', 'page', 'search']);
    expect(req.request.params.get('maintenance_overdue')).toBe('1');
    req.flush({ success: true, message: '', data: [], meta: { current_page: 1, last_page: 1, per_page: 15, total: 0 } });
  });

  it('requestTransfer() incluye las firmas cuando se envían', () => {
    svc.requestTransfer(5, { type: 'loan', external_destination: 'Hospital', received_by: { pin: '123' } }).subscribe();

    const req = http.expectOne(`${API}/5/transfers`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'loan', external_destination: 'Hospital', received_by: { pin: '123' } });
    req.flush({ success: true, message: '', data: {} });
  });

  it('confirmTransfer() envía solo los firmantes', () => {
    svc.confirmTransfer(9, { received_by: { pin: '456' } }).subscribe();

    const req = http.expectOne(`${API}/transfers/9/confirm`);
    expect(req.request.body).toEqual({ received_by: { pin: '456' } });
    req.flush({ success: true, message: '', data: {} });
  });

  it('uploadDocument() envía multipart con el soporte del mantenimiento', () => {
    const file = new File(['%PDF'], 'informe.pdf', { type: 'application/pdf' });
    svc.uploadDocument(3, { file, document_type: 'service_report', title: 'Informe', maintenance_id: 7 }).subscribe();

    const req = http.expectOne(`${API}/3/documents`);
    const body = req.request.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.get('maintenance_id')).toBe('7');
    expect(body.has('issued_at')).toBe(false);
    req.flush({ success: true, message: '', data: {} });
  });

  it('complete() registra la ejecución del mantenimiento', () => {
    maintenance.complete(4, {
      performed_at: '2026-10-17 08:00:00', performed_by_type: 'internal', technician_id: 2,
      activities_performed: 'Limpieza', result: 'operational',
    }).subscribe();

    const req = http.expectOne(`${API}/maintenances/4/complete`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.technician_id).toBe(2);
    req.flush({ success: true, message: '', data: {} });
  });
});

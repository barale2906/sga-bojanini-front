import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../core/models/api-response.model';

export interface MedicalServiceNode {
  id: number;
  type: 'service' | 'procedure';
  type_label: string;
  parent_id: number | null;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  children: MedicalServiceNode[];
}

export interface ProcedurePrice {
  id: number;
  medical_service_id: number;
  unit_price: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  is_currently_valid: boolean;
  notes: string | null;
}

export interface PatientProcedureRecord {
  id: number;
  medical_service_id: number;
  procedure_code?: string;
  procedure_name?: string;
  medical_service?: { id: number; code: string; name: string };
  patient_external_id: string;
  patient_document: string;
  quantity: number;
  unit_price: number;
  total: number;
  service_date: string;
  notes: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface PatientProcedureRecordPayload {
  medical_service_id: number;
  patient_external_id: string;
  patient_document: string;
  quantity: number;
  unit_price: number;
  service_date: string;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class MedicalServicesService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getTree(onlyActive = true): Observable<ApiResponse<MedicalServiceNode[]>> {
    const params = new HttpParams().set('only_active', String(onlyActive));
    return this.http.get<ApiResponse<MedicalServiceNode[]>>(`${this.api}/medical-services/tree`, { params });
  }

  getProcedurePrices(procedureId: number, filter: { is_active?: boolean } = {}): Observable<ApiResponse<ProcedurePrice[]>> {
    let params = new HttpParams();
    if (filter.is_active !== undefined) params = params.set('is_active', String(filter.is_active));
    return this.http.get<ApiResponse<ProcedurePrice[]>>(`${this.api}/procedures/${procedureId}/prices`, { params });
  }

  getPatientProcedureRecords(filter: {
    medical_service_id?: number;
    patient_external_id?: string;
    patient_document?: string;
    service_date_from?: string;
    service_date_to?: string;
    is_active?: boolean;
    per_page?: number;
    page?: number;
  } = {}): Observable<PaginatedResponse<PatientProcedureRecord>> {
    let params = new HttpParams();
    if (filter.medical_service_id)  params = params.set('medical_service_id',  String(filter.medical_service_id));
    if (filter.patient_external_id) params = params.set('patient_external_id', filter.patient_external_id);
    if (filter.patient_document)    params = params.set('patient_document',    filter.patient_document);
    if (filter.service_date_from)   params = params.set('service_date_from',   filter.service_date_from);
    if (filter.service_date_to)     params = params.set('service_date_to',     filter.service_date_to);
    if (filter.is_active !== undefined) params = params.set('is_active', String(filter.is_active));
    if (filter.per_page)            params = params.set('per_page',            String(filter.per_page));
    if (filter.page)                params = params.set('page',                String(filter.page));
    return this.http.get<PaginatedResponse<PatientProcedureRecord>>(`${this.api}/patient-procedure-records`, { params });
  }

  getPatientProcedureRecord(id: number): Observable<ApiResponse<PatientProcedureRecord>> {
    return this.http.get<ApiResponse<PatientProcedureRecord>>(`${this.api}/patient-procedure-records/${id}`);
  }

  createPatientProcedureRecord(payload: PatientProcedureRecordPayload): Observable<ApiResponse<PatientProcedureRecord>> {
    return this.http.post<ApiResponse<PatientProcedureRecord>>(`${this.api}/patient-procedure-records`, payload);
  }

  updatePatientProcedureRecord(id: number, payload: Partial<PatientProcedureRecordPayload>): Observable<ApiResponse<PatientProcedureRecord>> {
    return this.http.put<ApiResponse<PatientProcedureRecord>>(`${this.api}/patient-procedure-records/${id}`, payload);
  }

  deletePatientProcedureRecord(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.api}/patient-procedure-records/${id}`);
  }
}

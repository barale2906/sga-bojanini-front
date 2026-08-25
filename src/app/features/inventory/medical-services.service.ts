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

export interface MedicalService {
  id: number;
  type: 'service' | 'procedure';
  type_label: string;
  parent_id: number | null;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface MedicalServiceFilters {
  type?: 'service' | 'procedure';
  parent_id?: number;
  is_active?: boolean;
  search?: string;
}

export interface MedicalServicePayload {
  type: 'service' | 'procedure';
  parent_id?: number | null;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
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

export interface ProcedurePricePayload {
  unit_price: number;
  effective_from: string;
  effective_to?: string | null;
  is_active?: boolean;
  notes?: string | null;
}

export interface PatientProcedureRecord {
  id: number;
  medical_service_id: number;
  medical_service_name?: string;
  procedure_code?: string;
  procedure_name?: string;
  medical_service?: { id: number; code: string; name: string };
  patient_external_id: string;
  patient_document: string;
  patient_first_name?: string;
  patient_last_name?: string;
  quantity: number;
  unit_price: number;
  total: number;
  service_date: string;
  notes: string | null;
  seller?: string | null;
  referrer?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface PatientProcedureRecordPayload {
  medical_service_id: number;
  patient_external_id: string;
  patient_document: string;
  patient_first_name: string;
  patient_last_name: string;
  quantity: number;
  unit_price: number;
  service_date: string;
  notes?: string | null;
  seller?: string | null;
  referrer?: string | null;
  appointment_code?: string | null;
}

export interface ClinicalTemplate {
  id: number;
  medical_service_id: number;
  medical_service_name: string;
  title: string;
  content: string;
  is_active: boolean;
}

export interface ClinicalTemplatePayload {
  medical_service_id?: number;
  title: string;
  content: string;
  is_active?: boolean;
}

export interface ClinicalEvolution {
  id: number;
  patient_procedure_record_id: number;
  content: string;
  user_id: number;
  user_name: string;
  recorded_at: string;
}

export interface ClinicalEvolutionPayload {
  content: string;
  recorded_at?: string;
}

export interface ProcedureMedication {
  generic_product_id: number;
  product_name: string;
  batch_id: number;
  lot_number: string;
  expiration_date: string;
  quantity: number;
}

export interface MedicalServiceImportResult {
  total: number;
  success: number;
  failed: number;
  errors: { row: number; errors: Record<string, string[]> }[];
}

// ── MedSys integration ────────────────────────────────────────
export interface MedsysPatient {
  codigo: string;
  tipodoc: string;
  documento: string;
  nombre: string;
}

export interface MedsysAppointment {
  codcontrol: string;
  fecha: string;
  hora: string;
  codtipocontrol: string;
  servicio: string;
  estado: string;
  medical_service_id: number | null;
  medical_service_name: string | null;
  is_mapped: boolean;
}

export interface MedsysPatientSearchResult {
  patient?: MedsysPatient;
  appointments?: MedsysAppointment[];
  patients?: MedsysPatient[];
}

@Injectable({ providedIn: 'root' })
export class MedicalServicesService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getTree(onlyActive = true): Observable<ApiResponse<MedicalServiceNode[]>> {
    const params = new HttpParams().set('only_active', String(onlyActive));
    return this.http.get<ApiResponse<MedicalServiceNode[]>>(`${this.api}/medical-services/tree`, { params });
  }

  getMedicalServices(filters: MedicalServiceFilters = {}): Observable<ApiResponse<MedicalService[]>> {
    let params = new HttpParams();
    if (filters.type) params = params.set('type', filters.type);
    if (filters.parent_id) params = params.set('parent_id', String(filters.parent_id));
    if (filters.is_active !== undefined) params = params.set('is_active', String(filters.is_active));
    if (filters.search) params = params.set('search', filters.search);
    return this.http.get<ApiResponse<MedicalService[]>>(`${this.api}/medical-services`, { params });
  }

  createMedicalService(payload: MedicalServicePayload): Observable<ApiResponse<MedicalService>> {
    return this.http.post<ApiResponse<MedicalService>>(`${this.api}/medical-services`, payload);
  }

  updateMedicalService(id: number, payload: MedicalServicePayload): Observable<ApiResponse<MedicalService>> {
    return this.http.put<ApiResponse<MedicalService>>(`${this.api}/medical-services/${id}`, payload);
  }

  deleteMedicalService(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/medical-services/${id}`);
  }

  getProcedurePrices(procedureId: number, filter: { is_active?: boolean } = {}): Observable<ApiResponse<ProcedurePrice[]>> {
    let params = new HttpParams();
    if (filter.is_active !== undefined) params = params.set('is_active', String(filter.is_active));
    return this.http.get<ApiResponse<ProcedurePrice[]>>(`${this.api}/procedures/${procedureId}/prices`, { params });
  }

  createProcedurePrice(procedureId: number, payload: ProcedurePricePayload): Observable<ApiResponse<ProcedurePrice>> {
    return this.http.post<ApiResponse<ProcedurePrice>>(`${this.api}/procedures/${procedureId}/prices`, payload);
  }

  updateProcedurePrice(procedureId: number, priceId: number, payload: ProcedurePricePayload): Observable<ApiResponse<ProcedurePrice>> {
    return this.http.put<ApiResponse<ProcedurePrice>>(`${this.api}/procedures/${procedureId}/prices/${priceId}`, payload);
  }

  deleteProcedurePrice(procedureId: number, priceId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/procedures/${procedureId}/prices/${priceId}`);
  }

  getPatientProcedureRecords(filter: {
    medical_service_id?: number;
    patient_external_id?: string;
    patient_document?: string;
    service_date_from?: string;
    service_date_to?: string;
    seller?: string;
    referrer?: string;
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
    if (filter.seller)              params = params.set('seller',              filter.seller);
    if (filter.referrer)            params = params.set('referrer',            filter.referrer);
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

  // ── Plantillas de evolución clínica ─────────────────────────

  getTemplateForService(medicalServiceId: number): Observable<ApiResponse<ClinicalTemplate | null>> {
    return this.http.get<ApiResponse<ClinicalTemplate | null>>(`${this.api}/clinical-templates/for-service/${medicalServiceId}`);
  }

  getClinicalTemplates(filter: { medical_service_id?: number; is_active?: boolean } = {}): Observable<ApiResponse<ClinicalTemplate[]>> {
    let params = new HttpParams();
    if (filter.medical_service_id !== undefined) params = params.set('medical_service_id', String(filter.medical_service_id));
    if (filter.is_active !== undefined)          params = params.set('is_active', String(filter.is_active));
    return this.http.get<ApiResponse<ClinicalTemplate[]>>(`${this.api}/clinical-templates`, { params });
  }

  getClinicalTemplate(id: number): Observable<ApiResponse<ClinicalTemplate>> {
    return this.http.get<ApiResponse<ClinicalTemplate>>(`${this.api}/clinical-templates/${id}`);
  }

  createClinicalTemplate(payload: ClinicalTemplatePayload): Observable<ApiResponse<ClinicalTemplate>> {
    return this.http.post<ApiResponse<ClinicalTemplate>>(`${this.api}/clinical-templates`, payload);
  }

  updateClinicalTemplate(id: number, payload: Omit<ClinicalTemplatePayload, 'medical_service_id'>): Observable<ApiResponse<ClinicalTemplate>> {
    return this.http.put<ApiResponse<ClinicalTemplate>>(`${this.api}/clinical-templates/${id}`, payload);
  }

  deleteClinicalTemplate(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/clinical-templates/${id}`);
  }

  // ── Evoluciones clínicas ─────────────────────────────────────

  getEvolutions(recordId: number): Observable<ApiResponse<ClinicalEvolution[]>> {
    return this.http.get<ApiResponse<ClinicalEvolution[]>>(`${this.api}/patient-procedure-records/${recordId}/evolutions`);
  }

  createEvolution(recordId: number, payload: ClinicalEvolutionPayload): Observable<ApiResponse<ClinicalEvolution>> {
    return this.http.post<ApiResponse<ClinicalEvolution>>(`${this.api}/patient-procedure-records/${recordId}/evolutions`, payload);
  }

  updateEvolution(recordId: number, evolutionId: number, payload: { content: string }): Observable<ApiResponse<ClinicalEvolution>> {
    return this.http.put<ApiResponse<ClinicalEvolution>>(`${this.api}/patient-procedure-records/${recordId}/evolutions/${evolutionId}`, payload);
  }

  deleteEvolution(recordId: number, evolutionId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/patient-procedure-records/${recordId}/evolutions/${evolutionId}`);
  }

  // ── Medicamentos aplicados ───────────────────────────────────

  getProcedureMedications(recordId: number): Observable<ApiResponse<ProcedureMedication[]>> {
    return this.http.get<ApiResponse<ProcedureMedication[]>>(`${this.api}/patient-procedure-records/${recordId}/medications`);
  }

  // ── MedSys integration ──────────────────────────────────────

  searchMedsysPatients(search: string): Observable<ApiResponse<MedsysPatientSearchResult>> {
    const params = new HttpParams().set('search', search);
    return this.http.get<ApiResponse<MedsysPatientSearchResult>>(`${this.api}/medsys/patients`, { params });
  }

  getMedsysAppointments(codigo: string, date?: string): Observable<ApiResponse<MedsysAppointment[]>> {
    let params = new HttpParams();
    if (date) params = params.set('date', date);
    return this.http.get<ApiResponse<MedsysAppointment[]>>(`${this.api}/medsys/patients/${encodeURIComponent(codigo)}/appointments`, { params });
  }

  // ── Importación masiva ───────────────────────────────────────

  importMedicalServices(file: File): Observable<ApiResponse<MedicalServiceImportResult>> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ApiResponse<MedicalServiceImportResult>>(`${this.api}/import/medical-services`, fd);
  }

  downloadMedicalServicesTemplate(): Observable<Blob> {
    return this.http.get(`${this.api}/import/medical-services/template`, { responseType: 'blob' });
  }
}

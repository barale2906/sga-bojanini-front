import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../core/models/api-response.model';
import { FileDownloadService } from '../../shared/services/file-download.service';
import {
  Asset, AssetCategory, AssetComment, AssetDocument, AssetDocumentUpload, AssetFilterCatalogs, AssetFilters,
  AssetImportResult, AssetLocationSegment, AssetMovement, AssetPayload, AssetSite, AssetPlace, AssetStatistics,
  AssetStatus, AssetTechnicalProfile, AssetTransfer, AssetTransferPayload, AssetTransferStatus, AssetType,
  SignersPayload, compactParams,
} from './assets.models';

/** Inventario de activos: activos, catálogos, traslados, documentos, importación y reportes. */
@Injectable({ providedIn: 'root' })
export class AssetsService {
  private http = inject(HttpClient);
  private files = inject(FileDownloadService);
  private api = `${environment.apiUrl}/assets`;

  // ── Activos ───────────────────────────────────────────────────────────────

  list(filters: AssetFilters = {}): Observable<PaginatedResponse<Asset>> {
    return this.http.get<PaginatedResponse<Asset>>(this.api, { params: compactParams(filters) });
  }

  get(id: number): Observable<ApiResponse<Asset>> {
    return this.http.get<ApiResponse<Asset>>(`${this.api}/${id}`);
  }

  create(payload: AssetPayload): Observable<ApiResponse<Asset>> {
    return this.http.post<ApiResponse<Asset>>(this.api, payload);
  }

  update(id: number, payload: AssetPayload): Observable<ApiResponse<Asset>> {
    return this.http.put<ApiResponse<Asset>>(`${this.api}/${id}`, payload);
  }

  delete(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/${id}`);
  }

  changeStatus(id: number, status: AssetStatus, reason?: string | null): Observable<ApiResponse<Asset>> {
    return this.http.post<ApiResponse<Asset>>(`${this.api}/${id}/status`, { status, reason: reason || null });
  }

  filters(): Observable<ApiResponse<AssetFilterCatalogs>> {
    return this.http.get<ApiResponse<AssetFilterCatalogs>>(`${this.api}/filters`);
  }

  statistics(filters: Pick<AssetFilters, 'site_id' | 'asset_type' | 'category_id'> = {}): Observable<ApiResponse<AssetStatistics>> {
    return this.http.get<ApiResponse<AssetStatistics>>(`${this.api}/statistics`, { params: compactParams(filters) });
  }

  movements(id: number, page = 1, perPage = 20): Observable<PaginatedResponse<AssetMovement>> {
    return this.http.get<PaginatedResponse<AssetMovement>>(`${this.api}/${id}/movements`, {
      params: new HttpParams().set('page', page).set('per_page', perPage),
    });
  }

  locationHistory(id: number): Observable<ApiResponse<AssetLocationSegment[]>> {
    return this.http.get<ApiResponse<AssetLocationSegment[]>>(`${this.api}/${id}/location-history`);
  }

  comments(id: number): Observable<ApiResponse<AssetComment[]>> {
    return this.http.get<ApiResponse<AssetComment[]>>(`${this.api}/${id}/comments`);
  }

  addComment(id: number, comment: string): Observable<ApiResponse<AssetComment>> {
    return this.http.post<ApiResponse<AssetComment>>(`${this.api}/${id}/comments`, { comment });
  }

  getTechnicalProfile(id: number): Observable<ApiResponse<AssetTechnicalProfile | null>> {
    return this.http.get<ApiResponse<AssetTechnicalProfile | null>>(`${this.api}/${id}/technical-profile`);
  }

  saveTechnicalProfile(id: number, profile: Partial<AssetTechnicalProfile>): Observable<ApiResponse<AssetTechnicalProfile>> {
    return this.http.put<ApiResponse<AssetTechnicalProfile>>(`${this.api}/${id}/technical-profile`, profile);
  }

  // ── Catálogos ─────────────────────────────────────────────────────────────

  categories(filters: { asset_type?: AssetType | ''; is_active?: boolean; search?: string } = {}): Observable<ApiResponse<AssetCategory[]>> {
    return this.http.get<ApiResponse<AssetCategory[]>>(`${this.api}/categories`, { params: compactParams(filters) });
  }

  saveCategory(payload: Omit<AssetCategory, 'id' | 'asset_type_label' | 'requires_maintenance'>, id?: number): Observable<ApiResponse<AssetCategory>> {
    return id
      ? this.http.put<ApiResponse<AssetCategory>>(`${this.api}/categories/${id}`, payload)
      : this.http.post<ApiResponse<AssetCategory>>(`${this.api}/categories`, payload);
  }

  deleteCategory(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/categories/${id}`);
  }

  sites(onlyActive?: boolean): Observable<ApiResponse<AssetSite[]>> {
    const params: Record<string, string> = onlyActive === undefined ? {} : { is_active: onlyActive ? '1' : '0' };
    return this.http.get<ApiResponse<AssetSite[]>>(`${this.api}/sites`, { params });
  }

  saveSite(payload: { name: string; address?: string | null; is_active?: boolean }, id?: number): Observable<ApiResponse<AssetSite>> {
    return id
      ? this.http.put<ApiResponse<AssetSite>>(`${this.api}/sites/${id}`, payload)
      : this.http.post<ApiResponse<AssetSite>>(`${this.api}/sites`, payload);
  }

  deleteSite(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/sites/${id}`);
  }

  savePlace(payload: { site_id: number; name: string; is_active?: boolean }, id?: number): Observable<ApiResponse<AssetPlace>> {
    return id
      ? this.http.put<ApiResponse<AssetPlace>>(`${this.api}/places/${id}`, payload)
      : this.http.post<ApiResponse<AssetPlace>>(`${this.api}/places`, payload);
  }

  deletePlace(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/places/${id}`);
  }

  // ── Traslados ─────────────────────────────────────────────────────────────

  transfers(filters: { status?: AssetTransferStatus | ''; type?: string; asset_id?: number; search?: string; page?: number; per_page?: number } = {}): Observable<PaginatedResponse<AssetTransfer>> {
    return this.http.get<PaginatedResponse<AssetTransfer>>(`${this.api}/transfers`, { params: compactParams(filters) });
  }

  requestTransfer(assetId: number, payload: AssetTransferPayload): Observable<ApiResponse<AssetTransfer>> {
    return this.http.post<ApiResponse<AssetTransfer>>(`${this.api}/${assetId}/transfers`, payload);
  }

  confirmTransfer(id: number, signers: SignersPayload): Observable<ApiResponse<AssetTransfer>> {
    return this.http.post<ApiResponse<AssetTransfer>>(`${this.api}/transfers/${id}/confirm`, signers);
  }

  cancelTransfer(id: number, reason: string): Observable<ApiResponse<AssetTransfer>> {
    return this.http.post<ApiResponse<AssetTransfer>>(`${this.api}/transfers/${id}/cancel`, { reason });
  }

  // ── Documentos ────────────────────────────────────────────────────────────

  documents(assetId: number, maintenanceId?: number): Observable<ApiResponse<AssetDocument[]>> {
    const params: Record<string, string> = maintenanceId ? { maintenance_id: String(maintenanceId) } : {};
    return this.http.get<ApiResponse<AssetDocument[]>>(`${this.api}/${assetId}/documents`, { params });
  }

  uploadDocument(assetId: number, upload: AssetDocumentUpload): Observable<ApiResponse<AssetDocument>> {
    const body = new FormData();
    body.append('file', upload.file);
    body.append('document_type', upload.document_type);
    body.append('title', upload.title);
    if (upload.maintenance_id) body.append('maintenance_id', String(upload.maintenance_id));
    if (upload.issued_at) body.append('issued_at', upload.issued_at);
    if (upload.expires_at) body.append('expires_at', upload.expires_at);

    return this.http.post<ApiResponse<AssetDocument>>(`${this.api}/${assetId}/documents`, body);
  }

  deleteDocument(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.api}/documents/${id}`);
  }

  downloadDocument(doc: AssetDocument): Observable<void> {
    return this.files.download(`${this.api}/documents/${doc.id}/download`, doc.original_name);
  }

  // ── Importación ───────────────────────────────────────────────────────────

  downloadTemplate(): Observable<void> {
    return this.files.download(`${this.api}/import/template`, 'plantilla_activos.xlsx');
  }

  import(file: File): Observable<ApiResponse<AssetImportResult>> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<ApiResponse<AssetImportResult>>(`${this.api}/import`, body);
  }

  // ── PDF y reportes ────────────────────────────────────────────────────────

  openLifeSheet(assetId: number): Observable<void> {
    return this.files.open(`${this.api}/${assetId}/life-sheet`);
  }

  openTransferAct(transferId: number): Observable<void> {
    return this.files.open(`${this.api}/transfers/${transferId}/act`);
  }

  openLabels(ids: number[]): Observable<void> {
    return this.files.open(`${this.api}/labels`, { ids: ids.join(',') });
  }

  exportInventory(filters: AssetFilters = {}): Observable<void> {
    return this.files.download(`${this.api}/reports/inventory`, 'inventario_activos.xlsx', compactParams(filters));
  }
}

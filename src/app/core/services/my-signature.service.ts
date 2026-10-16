import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

/** Longitud del PIN de firma (debe coincidir con SignaturePinService::PIN_LENGTH del backend). */
export const SIGNATURE_PIN_LENGTH = 3;

/** Firma registrada del usuario autenticado. Nunca incluye el PIN. */
export interface MySignature {
  signer_name:         string;
  document_type:       string;
  document_type_label: string;
  document_number:     string;
  signature_data:      string;
  has_pin:             boolean;
  pin_generated_at:    string | null;
  registered_at:       string;
}

export interface DocumentTypeOption {
  value: string;
  label: string;
}

export interface MySignatureResponse {
  signature:      MySignature | null;
  document_types: DocumentTypeOption[];
}

/** Respuesta de registrar firma o regenerar PIN. `pin` solo viene una vez. */
export interface MySignatureSaveResponse {
  signature: MySignature;
  pin:       string | null;
}

export interface SaveMySignaturePayload {
  current_password: string;
  document_type:    string;
  document_number:  string;
  signature:        string;
}

/**
 * "Mi firma": opera únicamente sobre el usuario de la sesión.
 * Ningún endpoint recibe un ID de usuario, por lo que no es posible
 * consultar ni modificar la firma de otra persona.
 *
 * No se guarda en localStorage a propósito: la firma no debe quedar
 * en el navegador después de cerrar sesión.
 */
@Injectable({ providedIn: 'root' })
export class MySignatureService {
  private http = inject(HttpClient);
  private api  = `${environment.apiUrl}/auth/me/signature`;

  get(): Observable<ApiResponse<MySignatureResponse>> {
    return this.http.get<ApiResponse<MySignatureResponse>>(this.api);
  }

  save(payload: SaveMySignaturePayload): Observable<ApiResponse<MySignatureSaveResponse>> {
    return this.http.put<ApiResponse<MySignatureSaveResponse>>(this.api, payload);
  }

  regeneratePin(currentPassword: string): Observable<ApiResponse<MySignatureSaveResponse>> {
    return this.http.post<ApiResponse<MySignatureSaveResponse>>(`${this.api}/pin`, {
      current_password: currentPassword,
    });
  }
}

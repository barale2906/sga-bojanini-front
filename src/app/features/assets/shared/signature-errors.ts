import { HttpErrorResponse } from '@angular/common/http';

/**
 * Mensajes de error al enviar un documento con firmas (traslados,
 * mantenimientos): validación, PIN inválido, demasiados intentos o conflicto.
 */
export function signatureErrorMessages(err: HttpErrorResponse, fallback: string): string[] {
  if (err.status === 422) {
    return Object.values(err.error?.errors ?? {}).flat() as string[];
  }
  if (err.status === 429) {
    return ['Demasiados intentos de PIN fallidos. Espere 15 minutos o use la firma manual.'];
  }
  return [err.error?.message ?? fallback];
}

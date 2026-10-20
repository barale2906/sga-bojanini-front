import { describe, it, expect } from 'vitest';
import { compactParams, resolveTransferType, toApiDate, toApiDateTime } from './assets.models';

describe('assets.models', () => {
  describe('resolveTransferType', () => {
    it('reubicar dentro de la misma sede es traslado interno sin firma obligatoria', () => {
      expect(resolveTransferType('relocation', 1, 1)).toEqual({ type: 'relocation', requiresSignature: false });
    });

    it('reubicar en otra sede se registra como traslado entre sedes con firma', () => {
      expect(resolveTransferType('relocation', 1, 2)).toEqual({ type: 'site_transfer', requiresSignature: true });
    });

    it('sin sitio destino (solo cambio de responsable) sigue siendo interno', () => {
      expect(resolveTransferType('relocation', 1, null).requiresSignature).toBe(false);
    });

    it('salidas del edificio exigen firma y el retorno no', () => {
      expect(resolveTransferType('external_repair', 1, null).requiresSignature).toBe(true);
      expect(resolveTransferType('loan', 1, null).requiresSignature).toBe(true);
      expect(resolveTransferType('retirement', 1, null).requiresSignature).toBe(true);
      expect(resolveTransferType('return', null, 1).requiresSignature).toBe(false);
    });
  });

  it('compactParams descarta vacíos y convierte booleanos', () => {
    expect(compactParams({ search: '', site_id: null, status: undefined, overdue: true, include_retired: false, page: 2 }))
      .toEqual({ overdue: '1', page: '2' });
  });

  it('toApiDate usa la fecha local sin desfase de zona horaria', () => {
    expect(toApiDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(toApiDate('2026-03-15T10:00:00Z')).toBe('2026-03-15');
    expect(toApiDate(null)).toBeNull();
  });

  it('toApiDateTime formatea fecha y hora local', () => {
    expect(toApiDateTime(new Date(2026, 9, 17, 8, 5))).toBe('2026-10-17 08:05:00');
  });
});

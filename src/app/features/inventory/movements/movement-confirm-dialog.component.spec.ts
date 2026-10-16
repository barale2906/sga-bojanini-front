import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MovementConfirmDialogComponent, MovementConfirmDialogData } from './movement-confirm-dialog.component';
import { InventoryService, MovementSignatureRecord } from '../inventory.service';
import { AuthService } from '../../../core/services/auth.service';
import { MySignature } from '../../../core/services/my-signature.service';
import { SignatureCapturePadComponent } from '../../../shared/components/signature-capture-pad/signature-capture-pad.component';
import { environment } from '../../../../environments/environment';

const MY_SIGNATURE_URL = `${environment.apiUrl}/auth/me/signature`;
const PAD_IMAGE = 'data:image/png;base64,PAD';

const mySignature: MySignature = {
  signer_name:         'Juan Pérez',
  document_type:       'CC',
  document_type_label: 'Cédula de ciudadanía',
  document_number:     '1010101',
  signature_data:      'data:image/png;base64,STORED',
  has_pin:             true,
  pin_generated_at:    null,
  registered_at:       '2026-10-16T10:00:00+00:00',
};

const confirmedSignatures: MovementSignatureRecord[] = [
  { role: 'delivered_by', method: 'stored', signer_name: 'Juan Pérez', signer_document: 'CC 1010101',
    signature_data: 'data:image/png;base64,STORED', signed_at: '2026-10-16T17:05:00+00:00' },
  { role: 'received_by', method: 'pin', signer_name: 'María López', signer_document: 'CC 2020202',
    signature_data: 'data:image/png;base64,RECEIVER', signed_at: '2026-10-16T17:05:00+00:00' },
];

/** El canvas no existe en jsdom: se reemplaza el pad por un doble. */
const padStub = (empty = false) =>
  ({ isEmpty: () => empty, getBase64: () => PAD_IMAGE }) as unknown as SignatureCapturePadComponent;

const httpError = (status: number, error: unknown) => throwError(() => new HttpErrorResponse({ status, error }));

describe('MovementConfirmDialogComponent — firma registrada y PIN', () => {
  let component: MovementConfirmDialogComponent;
  let http: HttpTestingController;
  let inventorySvc: { confirmMovement: ReturnType<typeof vi.fn>; cancelPendingMovement: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  /** Crea el diálogo y responde la consulta de "Mi firma" (sin renderizar la plantilla). */
  const setup = (signature: MySignature | null) => {
    const fixture = TestBed.createComponent(MovementConfirmDialogComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
    http.expectOne(MY_SIGNATURE_URL).flush({
      success: true, message: '', data: { signature, document_types: [] },
    });
  };

  const sentPayload = () => inventorySvc.confirmMovement.mock.calls[0][1];

  beforeEach(() => {
    inventorySvc = {
      confirmMovement:       vi.fn(() => of({ success: true, message: '', data: { id: 42, status: 'confirmed', signatures: confirmedSignatures } })),
      cancelPendingMovement: vi.fn(() => of({ success: true, message: '', data: null })),
    };
    dialogRef = { close: vi.fn() };

    const data: MovementConfirmDialogData = {
      document_id:   42,
      movements:     [{ id: 1, product_name: 'Guantes', batch_lot_number: 'LOT-1', quantity: -10, movement_type: 'exit' }],
      warehouseName: 'Principal',
      inventorySvc:  inventorySvc as unknown as InventoryService,
    };

    TestBed.configureTestingModule({
      imports: [MovementConfirmDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: AuthService, useValue: { user: () => ({ name: 'Juan Pérez' }), hasPermission: () => false } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── Quien entrega ───────────────────────────────────────────
  describe('quien entrega', () => {
    it('con firma registrada usa el modo "stored" y no envía delivered_by', () => {
      setup(mySignature);
      expect(component.deliveredMode()).toBe('stored');

      component.pinCtrl.setValue('483');
      component.confirm();

      expect(inventorySvc.confirmMovement).toHaveBeenCalledWith(42, { received_by: { pin: '483' } });
    });

    it('sin firma registrada usa el pad con el nombre del usuario precargado', () => {
      setup(null);
      expect(component.deliveredMode()).toBe('pad');
      expect(component.deliveredForm.value.name).toBe('Juan Pérez');

      component.deliveredPad = padStub();
      component.deliveredForm.patchValue({ document: '1010101' });
      component.pinCtrl.setValue('483');
      component.confirm();

      expect(sentPayload()).toEqual({
        delivered_by: { name: 'Juan Pérez', document: '1010101', signature: PAD_IMAGE },
        received_by:  { pin: '483' },
      });
    });

    it('puede firmar manualmente aunque tenga firma registrada', () => {
      setup(mySignature);
      component.setDeliveredMode('pad');
      component.deliveredPad = padStub();
      component.deliveredForm.patchValue({ document: '1010101' });
      component.pinCtrl.setValue('483');

      component.confirm();

      expect(sentPayload().delivered_by).toEqual({ name: 'Juan Pérez', document: '1010101', signature: PAD_IMAGE });
    });

    it('en modo pad exige la firma de quien entrega', () => {
      setup(null);
      component.deliveredPad = padStub(true);
      component.deliveredForm.patchValue({ document: '1010101' });
      component.pinCtrl.setValue('483');

      component.confirm();

      expect(inventorySvc.confirmMovement).not.toHaveBeenCalled();
      expect(component.errors()).toContain('La firma de quien entrega es obligatoria.');
    });

    it('si no se puede consultar "Mi firma" cae al flujo manual', () => {
      const fixture = TestBed.createComponent(MovementConfirmDialogComponent);
      component = fixture.componentInstance;
      component.ngOnInit();
      http.expectOne(MY_SIGNATURE_URL).flush({}, { status: 500, statusText: 'Server Error' });

      expect(component.loadingMySignature()).toBe(false);
      expect(component.deliveredMode()).toBe('pad');
    });

    it('no confirma mientras se carga la firma registrada', () => {
      const fixture = TestBed.createComponent(MovementConfirmDialogComponent);
      component = fixture.componentInstance;
      component.ngOnInit();
      component.pinCtrl.setValue('483');

      component.confirm();

      expect(inventorySvc.confirmMovement).not.toHaveBeenCalled();
      http.expectOne(MY_SIGNATURE_URL).flush({ success: true, message: '', data: { signature: null, document_types: [] } });
    });
  });

  // ── Quien recibe ────────────────────────────────────────────
  describe('quien recibe', () => {
    it('el PIN es el modo por defecto y debe tener 3 dígitos', () => {
      setup(mySignature);
      expect(component.receivedMode()).toBe('pin');
      expect(component.pinLength).toBe(3);

      component.pinCtrl.setValue('48');
      component.confirm();

      expect(inventorySvc.confirmMovement).not.toHaveBeenCalled();
      expect(component.errors()).toEqual(['Quien recibe debe digitar su PIN de 3 dígitos.']);
    });

    it('el campo PIN descarta letras y recorta a 3 dígitos', () => {
      setup(mySignature);
      const input = { value: '4a8-39' } as HTMLInputElement;

      component.onPinInput({ target: input } as unknown as Event);

      expect(component.pinCtrl.value).toBe('483');
    });

    it('externo / sin registro envía nombre, documento y firma del pad', () => {
      setup(mySignature);
      component.setReceivedMode('pad');
      component.receivedPad = padStub();
      component.receivedForm.setValue({ name: 'Proveedor Externo', document: '900123456' });

      component.confirm();

      expect(sentPayload()).toEqual({
        received_by: { name: 'Proveedor Externo', document: '900123456', signature: PAD_IMAGE },
      });
    });

    it('externo exige nombre, documento y firma', () => {
      setup(mySignature);
      component.setReceivedMode('pad');
      component.receivedPad = padStub(true);

      component.confirm();

      expect(inventorySvc.confirmMovement).not.toHaveBeenCalled();
      expect(component.errors()).toEqual([
        'Complete nombre y documento de quien recibe.',
        'La firma de quien recibe es obligatoria.',
      ]);
    });
  });

  // ── Errores del backend ─────────────────────────────────────
  describe('errores al confirmar', () => {
    it('PIN inválido (422) limpia el campo y muestra el mensaje', () => {
      setup(mySignature);
      inventorySvc.confirmMovement.mockReturnValueOnce(
        httpError(422, { errors: { 'received_by.pin': ['El PIN de firma no es válido.'] } }),
      );
      component.pinCtrl.setValue('483');

      component.confirm();

      expect(component.confirming()).toBe(false);
      expect(component.confirmed()).toBe(false);
      expect(component.pinCtrl.value).toBe('');
      expect(component.errors()).toEqual(['El PIN de firma no es válido.']);
    });

    it('demasiados intentos (429) limpia el PIN y sugiere la firma manual', () => {
      setup(mySignature);
      inventorySvc.confirmMovement.mockReturnValueOnce(httpError(429, {}));
      component.pinCtrl.setValue('483');

      component.confirm();

      expect(component.pinCtrl.value).toBe('');
      expect(component.errors()[0]).toContain('Demasiados intentos de PIN fallidos');
    });

    it('sin firma registrada en el backend (409) muestra el mensaje del servidor', () => {
      setup(mySignature);
      inventorySvc.confirmMovement.mockReturnValueOnce(
        httpError(409, { message: 'No tiene una firma registrada. Regístrela en Mi perfil → Mi firma o firme manualmente.' }),
      );
      component.pinCtrl.setValue('483');

      component.confirm();

      expect(component.errors()).toEqual(['No tiene una firma registrada. Regístrela en Mi perfil → Mi firma o firme manualmente.']);
    });
  });

  // ── Resultado ───────────────────────────────────────────────
  describe('resultado', () => {
    it('al cerrar devuelve las firmas que confirmó el backend (para el PDF)', () => {
      setup(mySignature);
      component.pinCtrl.setValue('483');
      component.confirm();
      expect(component.confirmed()).toBe(true);

      component.closeConfirmed();

      expect(dialogRef.close).toHaveBeenCalledWith({
        confirmed: true,
        delivered_by: {
          signer_name: 'Juan Pérez', signer_document: 'CC 1010101',
          signature_data: 'data:image/png;base64,STORED', signed_at: '2026-10-16T17:05:00+00:00',
        },
        received_by: {
          signer_name: 'María López', signer_document: 'CC 2020202',
          signature_data: 'data:image/png;base64,RECEIVER', signed_at: '2026-10-16T17:05:00+00:00',
        },
      });
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MySignatureComponent } from './my-signature.component';
import { MySignature } from '../../../../core/services/my-signature.service';
import { SignatureCapturePadComponent } from '../../../../shared/components/signature-capture-pad/signature-capture-pad.component';
import { environment } from '../../../../../environments/environment';

const URL = `${environment.apiUrl}/auth/me/signature`;
const PAD_IMAGE = 'data:image/png;base64,PAD';

const DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
];

const mockSignature = (overrides: Partial<MySignature> = {}): MySignature => ({
  signer_name:         'Juan Pérez',
  document_type:       'CC',
  document_type_label: 'Cédula de ciudadanía',
  document_number:     '1020304050',
  signature_data:      'data:image/png;base64,STORED',
  has_pin:             true,
  pin_generated_at:    '2026-10-16T10:00:00+00:00',
  registered_at:       '2026-10-16T10:00:00+00:00',
  ...overrides,
});

/** El canvas no existe en jsdom: se reemplaza el pad por un doble. */
const padStub = (empty = false) =>
  ({ isEmpty: () => empty, getBase64: () => PAD_IMAGE }) as unknown as SignatureCapturePadComponent;

describe('MySignatureComponent', () => {
  let component: MySignatureComponent;
  let http: HttpTestingController;

  /** Crea el componente y responde la carga inicial (sin renderizar la plantilla). */
  const setup = (signature: MySignature | null) => {
    const fixture = TestBed.createComponent(MySignatureComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
    http.expectOne(URL).flush({
      success: true, message: '', data: { signature, document_types: DOCUMENT_TYPES },
    });
  };

  const fillForm = () => {
    component.form.setValue({
      document_type:    'CC',
      document_number:  '1020304050',
      current_password: 'Secreta123',
    });
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MySignatureComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── Carga inicial ───────────────────────────────────────────
  describe('carga inicial', () => {
    it('sin firma registrada abre el formulario de registro', () => {
      setup(null);
      expect(component.loading()).toBe(false);
      expect(component.signature()).toBeNull();
      expect(component.mode()).toBe('edit');
      expect(component.documentTypes()).toEqual(DOCUMENT_TYPES);
    });

    it('con firma registrada muestra la vista de la firma', () => {
      setup(mockSignature());
      expect(component.mode()).toBe('view');
      expect(component.signature()?.document_number).toBe('1020304050');
    });

    it('si la carga falla muestra un error', () => {
      const fixture = TestBed.createComponent(MySignatureComponent);
      component = fixture.componentInstance;
      component.ngOnInit();
      http.expectOne(URL).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(component.loading()).toBe(false);
      expect(component.errors()).toEqual(['No fue posible cargar su firma.']);
    });
  });

  // ── Registro / actualización ────────────────────────────────
  describe('guardar firma', () => {
    it('primer registro envía la firma del pad y muestra el PIN una sola vez', () => {
      setup(null);
      component.pad = padStub();
      fillForm();

      component.save();

      const req = http.expectOne(URL);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        current_password: 'Secreta123',
        document_type:    'CC',
        document_number:  '1020304050',
        signature:        PAD_IMAGE,
      });
      req.flush({ success: true, message: 'Firma registrada', data: { signature: mockSignature(), pin: '482' } },
        { status: 201, statusText: 'Created' });

      expect(component.mode()).toBe('view');
      expect(component.revealedPin()).toBe('482');
      expect(component.pinVisible()).toBe(true);

      component.dismissPin();
      expect(component.revealedPin()).toBeNull();
      expect(component.pinVisible()).toBe(false);
    });

    it('al actualizar la firma no muestra PIN (se conserva el vigente)', () => {
      setup(mockSignature());
      component.startEdit();
      component.pad = padStub();
      component.form.patchValue({ current_password: 'Secreta123' });

      component.save();

      http.expectOne(URL).flush({
        success: true, message: 'Firma actualizada', data: { signature: mockSignature(), pin: null },
      });
      expect(component.revealedPin()).toBeNull();
      expect(component.mode()).toBe('view');
    });

    it('startEdit precarga el documento registrado y limpia la contraseña', () => {
      setup(mockSignature({ document_type: 'CE', document_number: 'AB123' }));
      component.startEdit();

      expect(component.form.value).toEqual({
        document_type: 'CE', document_number: 'AB123', current_password: '',
      });
      expect(component.mode()).toBe('edit');
    });

    it('no envía nada si el pad está vacío', () => {
      setup(null);
      component.pad = padStub(true);
      fillForm();

      component.save();

      http.expectNone(URL);
      expect(component.errors()).toEqual(['Dibuje su firma en el recuadro.']);
    });

    it('no envía nada si el documento tiene puntos o falta la contraseña', () => {
      setup(null);
      component.pad = padStub();
      component.form.setValue({ document_type: 'CC', document_number: '10.203.040', current_password: '' });

      component.save();

      http.expectNone(URL);
      expect(component.form.get('document_number')?.hasError('pattern')).toBe(true);
      expect(component.form.get('current_password')?.hasError('required')).toBe(true);
    });

    it('muestra los errores de validación del backend (422)', () => {
      setup(null);
      component.pad = padStub();
      fillForm();

      component.save();

      http.expectOne(URL).flush(
        { success: false, message: 'Error de validación.', errors: { current_password: ['La contraseña actual no es correcta.'] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      expect(component.saving()).toBe(false);
      expect(component.errors()).toEqual(['La contraseña actual no es correcta.']);
    });

    it('informa cuando hay demasiados intentos (429)', () => {
      setup(null);
      component.pad = padStub();
      fillForm();

      component.save();

      http.expectOne(URL).flush({ success: false, message: '' }, { status: 429, statusText: 'Too Many Requests' });
      expect(component.errors()).toEqual(['Demasiados intentos. Espere un momento e intente de nuevo.']);
    });
  });

  // ── PIN ─────────────────────────────────────────────────────
  describe('PIN', () => {
    it('la máscara del PIN tiene 3 posiciones', () => {
      setup(null);
      expect(component.pinLength).toBe(3);
      expect(component.pinMask).toBe('•••');
    });

    it('regenerar PIN exige contraseña', () => {
      setup(mockSignature());
      component.startRegenerate();

      component.regeneratePin();

      http.expectNone(`${URL}/pin`);
      expect(component.pinForm.get('current_password')?.hasError('required')).toBe(true);
    });

    it('regenerar PIN muestra el nuevo PIN', () => {
      setup(mockSignature());
      component.startRegenerate();
      component.pinForm.setValue({ current_password: 'Secreta123' });

      component.regeneratePin();

      const req = http.expectOne(`${URL}/pin`);
      expect(req.request.body).toEqual({ current_password: 'Secreta123' });
      req.flush({ success: true, message: '', data: { signature: mockSignature(), pin: '730' } });

      expect(component.revealedPin()).toBe('730');
      expect(component.mode()).toBe('view');
    });

    it('cancelar vuelve a la vista sin errores', () => {
      setup(mockSignature());
      component.startRegenerate();
      component.errors.set(['algo']);

      component.cancel();

      expect(component.mode()).toBe('view');
      expect(component.errors()).toEqual([]);
    });
  });
});

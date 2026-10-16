import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MySignatureService, SIGNATURE_PIN_LENGTH } from './my-signature.service';
import { environment } from '../../../environments/environment';

const URL = `${environment.apiUrl}/auth/me/signature`;

describe('MySignatureService', () => {
  let svc: MySignatureService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc  = TestBed.inject(MySignatureService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('el PIN de firma es de 3 dígitos', () => {
    expect(SIGNATURE_PIN_LENGTH).toBe(3);
  });

  it('get() consulta la firma del usuario de la sesión sin enviar ID ni parámetros', () => {
    svc.get().subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ success: true, message: '', data: { signature: null, document_types: [] } });
  });

  it('save() envía PUT con contraseña, documento y firma', () => {
    const payload = {
      current_password: 'Secreta123',
      document_type:    'CC',
      document_number:  '1020304050',
      signature:        'data:image/png;base64,AAAA',
    };

    svc.save(payload).subscribe();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    expect(req.request.body).not.toHaveProperty('user_id');
    req.flush({ success: true, message: '', data: { signature: {}, pin: '482' } });
  });

  it('regeneratePin() envía POST a /pin solo con la contraseña actual', () => {
    svc.regeneratePin('Secreta123').subscribe(res => expect(res.data.pin).toBe('730'));

    const req = http.expectOne(`${URL}/pin`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ current_password: 'Secreta123' });
    req.flush({ success: true, message: '', data: { signature: {}, pin: '730' } });
  });
});

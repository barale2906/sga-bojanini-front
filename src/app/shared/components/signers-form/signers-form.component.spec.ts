import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignersFormComponent } from './signers-form.component';
import { SignatureCapturePadComponent } from '../signature-capture-pad/signature-capture-pad.component';
import { MySignature } from '../../../core/services/my-signature.service';
import { environment } from '../../../../environments/environment';

const MY_SIGNATURE_URL = `${environment.apiUrl}/auth/me/signature`;

const mySignature: MySignature = {
  signer_name: 'Juan Pérez', document_type: 'CC', document_type_label: 'Cédula', document_number: '1010',
  signature_data: 'data:image/png;base64,STORED', has_pin: true, pin_generated_at: null, registered_at: '2026-10-16T10:00:00Z',
};

/** El canvas no existe en jsdom: se reemplaza el pad por un doble. */
const padStub = (empty = false) =>
  ({ isEmpty: () => empty, getBase64: () => 'data:image/png;base64,PAD' }) as unknown as SignatureCapturePadComponent;

describe('SignersFormComponent', () => {
  let component: SignersFormComponent;
  let http: HttpTestingController;

  const setup = (signature: MySignature | null, inputs: Partial<SignersFormComponent> = {}) => {
    const fixture = TestBed.createComponent(SignersFormComponent);
    component = fixture.componentInstance;
    Object.assign(component, inputs);
    component.ngOnInit();
    if (!inputs.deliveredByPad) {
      http.expectOne(MY_SIGNATURE_URL).flush({ success: true, message: '', data: { signature, document_types: [] } });
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('con firma registrada omite delivered_by y recibe con PIN', () => {
    setup(mySignature);
    component.pinCtrl.setValue('483');

    expect(component.collect()).toEqual({ valid: true, payload: { received_by: { pin: '483' } } });
  });

  it('exige el PIN completo', () => {
    setup(mySignature);
    component.pinCtrl.setValue('48');

    const result = component.collect();
    expect(result.valid).toBe(false);
  });

  it('sin firma registrada exige pad y datos de quien entrega', () => {
    setup(null);
    expect(component.deliveredMode()).toBe('pad');

    component.deliveredPad = padStub(true);
    component.pinCtrl.setValue('483');
    expect(component.collect().valid).toBe(false);

    component.deliveredPad = padStub();
    component.deliveredForm.patchValue({ name: 'Ana', document: '2020' });
    expect(component.collect()).toEqual({
      valid: true,
      payload: {
        delivered_by: { name: 'Ana', document: '2020', signature: 'data:image/png;base64,PAD' },
        received_by: { pin: '483' },
      },
    });
  });

  it('para técnico externo firma en pad sin consultar "Mi firma" y recibe en pad', () => {
    setup(null, { deliveredByPad: true, initialReceivedMode: 'pad' });

    component.deliveredPad = padStub();
    component.receivedPad = padStub();
    component.deliveredForm.patchValue({ name: 'Carlos', document: '3030' });
    component.receivedForm.patchValue({ name: 'Enfermera', document: '4040' });

    const result = component.collect();
    expect(result.valid).toBe(true);
    expect(result.valid && 'name' in result.payload.received_by).toBe(true);
  });

  it('resetPin limpia el PIN', () => {
    setup(mySignature);
    component.pinCtrl.setValue('999');
    component.resetPin();
    expect(component.pinCtrl.value).toBe('');
  });
});

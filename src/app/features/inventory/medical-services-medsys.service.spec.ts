import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MedicalServicesService,
  MedsysPatient,
  MedsysAppointment,
} from './medical-services.service';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

const PATIENT: MedsysPatient = {
  codigo: 'P00123',
  tipodoc: 'CC',
  documento: '1234567890',
  nombre: 'María Alejandra García López',
};

const APPOINTMENT: MedsysAppointment = {
  codcontrol: 'C00456',
  fecha: '2026-08-19',
  hora: '09:30:00',
  codtipocontrol: 'CONS-DER',
  servicio: 'Consulta Dermatológica',
  estado: 'Cita Agendada',
  medical_service_id: 5,
  medical_service_name: 'Consulta Dermatológica',
  is_mapped: true,
};

describe('MedicalServicesService — integración MedSys', () => {
  let svc: MedicalServicesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc  = TestBed.inject(MedicalServicesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── searchMedsysPatients ────────────────────────────────────
  it('searchMedsysPatients() hace GET a /medsys/patients con ?search=', () => {
    svc.searchMedsysPatients('1234567890').subscribe();
    const req = http.expectOne(`${BASE}/medsys/patients?search=1234567890`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: 'Paciente encontrado', data: { patient: PATIENT, appointments: [APPOINTMENT] } });
  });

  it('searchMedsysPatients() por documento retorna patient + appointments', () => {
    let result: any;
    svc.searchMedsysPatients('1234567890').subscribe(r => (result = r.data));
    http.expectOne(`${BASE}/medsys/patients?search=1234567890`)
      .flush({ success: true, message: '', data: { patient: PATIENT, appointments: [APPOINTMENT] } });
    expect(result.patient.codigo).toBe('P00123');
    expect(result.patient.nombre).toBe('María Alejandra García López');
    expect(result.appointments).toHaveLength(1);
    expect(result.appointments[0].codcontrol).toBe('C00456');
  });

  it('searchMedsysPatients() por nombre retorna lista de patients', () => {
    let result: any;
    svc.searchMedsysPatients('García').subscribe(r => (result = r.data));
    http.expectOne(`${BASE}/medsys/patients?search=Garc%C3%ADa`)
      .flush({ success: true, message: '', data: { patients: [PATIENT] } });
    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].documento).toBe('1234567890');
  });

  it('searchMedsysPatients() codifica correctamente espacios en el término', () => {
    svc.searchMedsysPatients('Carlos García').subscribe();
    const req = http.expectOne(r => r.url === `${BASE}/medsys/patients` && r.params.get('search') === 'Carlos García');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: '', data: { patients: [] } });
  });

  // ── getMedsysAppointments ───────────────────────────────────
  it('getMedsysAppointments() hace GET a /medsys/patients/{codigo}/appointments', () => {
    svc.getMedsysAppointments('P00123').subscribe();
    const req = http.expectOne(`${BASE}/medsys/patients/P00123/appointments`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: '', data: [APPOINTMENT] });
  });

  it('getMedsysAppointments() pasa ?date= cuando se indica', () => {
    svc.getMedsysAppointments('P00123', '2026-08-19').subscribe();
    const req = http.expectOne(
      r => r.url === `${BASE}/medsys/patients/P00123/appointments` && r.params.get('date') === '2026-08-19'
    );
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: '', data: [APPOINTMENT] });
  });

  it('getMedsysAppointments() retorna el array de citas con is_mapped', () => {
    let citas: MedsysAppointment[] | undefined;
    svc.getMedsysAppointments('P00123', '2026-08-19').subscribe(r => (citas = r.data));
    http.expectOne(r => r.url === `${BASE}/medsys/patients/P00123/appointments`)
      .flush({ success: true, message: '', data: [APPOINTMENT] });
    expect(citas).toHaveLength(1);
    expect(citas![0].is_mapped).toBe(true);
    expect(citas![0].medical_service_id).toBe(5);
  });

  it('getMedsysAppointments() omite ?date= si no se proporciona', () => {
    svc.getMedsysAppointments('P00123').subscribe();
    const req = http.expectOne(`${BASE}/medsys/patients/P00123/appointments`);
    expect(req.request.params.has('date')).toBe(false);
    req.flush({ success: true, message: '', data: [] });
  });

  it('getMedsysAppointments() codifica el código del paciente en la URL', () => {
    svc.getMedsysAppointments('P 00/123').subscribe();
    const req = http.expectOne(`${BASE}/medsys/patients/P%2000%2F123/appointments`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: '', data: [] });
  });
});

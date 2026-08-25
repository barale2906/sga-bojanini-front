import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PatientSaleFormComponent } from './patient-sale-form.component';
import { MedsysPatient, MedsysAppointment } from '../../../features/inventory/medical-services.service';
import { environment } from '../../../../environments/environment';

const BASE = environment.apiUrl;

// ── Helpers ────────────────────────────────────────────────────────────────

const mockPatient = (overrides: Partial<MedsysPatient> = {}): MedsysPatient => ({
  codigo: 'P001',
  tipodoc: 'CC',
  documento: '123456789',
  nombre: 'Nombre Apellido1 Apellido2',
  ...overrides,
});

const mockAppointment = (overrides: Partial<MedsysAppointment> = {}): MedsysAppointment => ({
  codcontrol: 'C001',
  fecha: '2026-08-19',
  hora: '09:00:00',
  codtipocontrol: 'SRV-001',
  servicio: 'Consulta',
  estado: 'Cita Agendada',
  medical_service_id: 10,
  medical_service_name: 'Consulta',
  is_mapped: true,
  ...overrides,
});

// ── Suite ──────────────────────────────────────────────────────────────────

describe('PatientSaleFormComponent — integración MedSys', () => {
  let component: PatientSaleFormComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PatientSaleFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
      ],
    });
    const fixture = TestBed.createComponent(PatientSaleFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // Flush árbol de servicios que se carga en ngOnInit
    http.expectOne(r => r.url.includes('/medical-services/tree'))
      .flush({ success: true, message: '', data: [] });
  });

  afterEach(() => http.verify());

  // ── División de nombres ────────────────────────────────────
  describe('división de nombre MedSys', () => {
    it('nombre de 4 palabras → 2 primeros nombres + 2 apellidos', () => {
      component['_fillPatientFromMedsys'](mockPatient({ nombre: 'Carlos Andrés Pérez Gómez' }));
      expect(component.patientForm.get('patient_first_name')!.value).toBe('Carlos Andrés');
      expect(component.patientForm.get('patient_last_name')!.value).toBe('Pérez Gómez');
    });

    it('nombre de 3 palabras → primer nombre + 2 apellidos', () => {
      component['_fillPatientFromMedsys'](mockPatient({ nombre: 'Ana García López' }));
      expect(component.patientForm.get('patient_first_name')!.value).toBe('Ana');
      expect(component.patientForm.get('patient_last_name')!.value).toBe('García López');
    });

    it('nombre de 2 palabras → primer nombre + apellido', () => {
      component['_fillPatientFromMedsys'](mockPatient({ nombre: 'Pedro Ruiz' }));
      expect(component.patientForm.get('patient_first_name')!.value).toBe('Pedro');
      expect(component.patientForm.get('patient_last_name')!.value).toBe('Ruiz');
    });

    it('nombre de 1 palabra → primera_nombre = todo el nombre, last_name vacío', () => {
      component['_fillPatientFromMedsys'](mockPatient({ nombre: 'Único' }));
      expect(component.patientForm.get('patient_first_name')!.value).toBe('Único');
      expect(component.patientForm.get('patient_last_name')!.value).toBe('');
    });

    it('nombre de más de 4 palabras → primeras 2 son nombres, resto apellidos', () => {
      component['_fillPatientFromMedsys'](mockPatient({ nombre: 'María De Los Ángeles Rodríguez' }));
      expect(component.patientForm.get('patient_first_name')!.value).toBe('María De');
      expect(component.patientForm.get('patient_last_name')!.value).toBe('Los Ángeles Rodríguez');
    });
  });

  // ── _fillPatientFromMedsys ─────────────────────────────────
  describe('_fillPatientFromMedsys', () => {
    it('pobla document y external_id del paciente MedSys', () => {
      component['_fillPatientFromMedsys'](mockPatient({ documento: '987654321', codigo: 'P099' }));
      expect(component.patientForm.get('patient_document')!.value).toBe('987654321');
      expect(component.patientForm.get('patient_external_id')!.value).toBe('P099');
    });

    it('actualiza medsysSelectedPatient signal', () => {
      const p = mockPatient();
      component['_fillPatientFromMedsys'](p);
      expect(component.medsysSelectedPatient()).toEqual(p);
    });
  });

  // ── selectMedsysPatient ────────────────────────────────────
  describe('selectMedsysPatient()', () => {
    it('llama a GET /medsys/patients/{codigo}/appointments con fecha hoy', () => {
      const p = mockPatient({ codigo: 'P001' });
      component.selectMedsysPatient(p);
      const today = new Date().toISOString().split('T')[0];
      const req = http.expectOne(r =>
        r.url.includes('/medsys/patients/P001/appointments') && r.params.get('date') === today
      );
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, message: '', data: [mockAppointment()] });
      expect(component.medsysAppointments()).toHaveLength(1);
    });

    it('limpia la lista de pacientes al seleccionar uno', () => {
      component.medsysPatientList.set([mockPatient(), mockPatient({ codigo: 'P002' })]);
      component.selectMedsysPatient(mockPatient());
      expect(component.medsysPatientList()).toHaveLength(0);
      // flush pending HTTP
      http.expectOne(r => r.url.includes('/appointments')).flush({ success: true, message: '', data: [] });
    });
  });

  // ── selectMedsysAppointment ────────────────────────────────
  describe('selectMedsysAppointment()', () => {
    it('guarda codcontrol en el appointment code', () => {
      component.selectMedsysAppointment(mockAppointment({ codcontrol: 'C999' }));
      expect(component['_appointmentCode']()).toBe('C999');
    });

    it('establece medsysSelectedAppt signal', () => {
      const appt = mockAppointment();
      component.selectMedsysAppointment(appt);
      expect(component.medsysSelectedAppt()).toEqual(appt);
    });

    it('cuando is_mapped=true actualiza filter_service_id en el formulario', () => {
      component.selectMedsysAppointment(mockAppointment({ is_mapped: true, medical_service_id: 42 }));
      expect(component.patientForm.get('filter_service_id')!.value).toBe(42);
    });

    it('cuando is_mapped=false no modifica filter_service_id', () => {
      component.selectMedsysAppointment(mockAppointment({ is_mapped: false, medical_service_id: null }));
      expect(component.patientForm.get('filter_service_id')!.value).toBeNull();
    });
  });

  // ── getValue() incluye appointment_code ────────────────────
  describe('getValue()', () => {
    beforeEach(() => {
      // Rellena todos los campos obligatorios
      component.patientForm.patchValue({
        patient_document:    '123',
        patient_external_id: 'P001',
        patient_first_name:  'Ana',
        patient_last_name:   'López',
        service_date:        new Date('2026-08-19'),
        seller:              'Juan',
        referrer:            'Dr. Smith',
      });
    });

    it('incluye appointment_code null cuando ninguna cita fue seleccionada', () => {
      const val = component.getValue();
      expect(val.appointment_code).toBeNull();
    });

    it('incluye el codcontrol de la cita seleccionada', () => {
      component.selectMedsysAppointment(mockAppointment({ codcontrol: 'C-2026-001' }));
      const val = component.getValue();
      expect(val.appointment_code).toBe('C-2026-001');
    });

    it('appointment_code se resetea al llamar onMedsysSearchInput', () => {
      component.selectMedsysAppointment(mockAppointment({ codcontrol: 'C001' }));
      expect(component.getValue().appointment_code).toBe('C001');

      component.onMedsysSearchInput('otro paciente');
      // El reset es inmediato; la búsqueda HTTP se debouncea y no hay req pendiente aún
      expect(component['_appointmentCode']()).toBeNull();
      expect(component.getValue().appointment_code).toBeNull();
    });
  });

  // ── onMedsysSearchInput ────────────────────────────────────
  describe('onMedsysSearchInput()', () => {
    it('resetea el paciente seleccionado y las citas al escribir', () => {
      component.medsysSelectedPatient.set(mockPatient());
      component.medsysAppointments.set([mockAppointment()]);
      component.medsysSelectedAppt.set(mockAppointment());

      component.onMedsysSearchInput('nuevo texto');
      // El reset es inmediato; la búsqueda HTTP está sujeta a debounce
      expect(component.medsysSelectedPatient()).toBeNull();
      expect(component.medsysAppointments()).toHaveLength(0);
      expect(component.medsysSelectedAppt()).toBeNull();
    });

    it('no activa medsysSearchLoading si el término tiene menos de 3 caracteres', () => {
      component.onMedsysSearchInput('AB');
      // Debounce no expiró → loading permanece false
      expect(component.medsysSearchLoading()).toBe(false);
    });

    it('actualiza medsysSearchQuery signal', () => {
      component.onMedsysSearchInput('García');
      expect(component.medsysSearchQuery()).toBe('García');
    });
  });
});

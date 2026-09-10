import { Component, Input, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl, FormArray, FormBuilder, FormGroup,
  ReactiveFormsModule, Validators,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs/operators';
import {
  MedicalServicesService, ClinicalTemplate,
  MedsysPatient, MedsysAppointment, ProcedureSearchResult,
} from '../../../features/inventory/medical-services.service';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../adapters/es-date.adapter';
import { RichTextEditorComponent } from '../rich-text-editor/rich-text-editor.component';

export interface PatientSaleFormValue {
  patient_document:    string;
  patient_external_id: string;
  patient_first_name:  string;
  patient_last_name:   string;
  service_date:        Date;
  seller:              string;
  referrer:            string;
  appointment_code:    string | null;
  procedures: {
    procedure_id: number;
    quantity:     number;
    unit_price:   number;
    notes:        string;
  }[];
}

@Component({
  selector: 'app-patient-sale-form',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, MatDatepickerModule,
    MatAutocompleteModule, MatTooltipModule,
    RichTextEditorComponent,
  ],
  templateUrl: './patient-sale-form.component.html',
  styleUrl:    './patient-sale-form.component.scss',
})
export class PatientSaleFormComponent implements OnInit {
  /** 'exit' muestra Evolución Clínica y la marca obligatoria. 'sale' la oculta. */
  @Input() mode: 'sale' | 'exit' = 'exit';

  private fb     = inject(FormBuilder);
  private medSvc = inject(MedicalServicesService);

  // ── Form principal de paciente ─────────────────────────────────
  patientForm = this.fb.group({
    patient_document:    ['', Validators.required],
    patient_external_id: ['', Validators.required],
    patient_first_name:  ['', Validators.required],
    patient_last_name:   ['', Validators.required],
    service_date:        [new Date() as Date | null, Validators.required],
    seller:              ['', Validators.required],
    referrer:            ['', Validators.required],
  });

  procedureRows = this.fb.array<FormGroup>([]);

  // ── Signals ────────────────────────────────────────────────────
  rowTemplates          = signal<(ClinicalTemplate | null)[]>([]);
  rowTemplatesLoading   = signal<boolean[]>([]);
  sellerSuggestions     = signal<string[]>([]);
  referrerSuggestions   = signal<string[]>([]);

  // Per-procedure search state
  procSearch = signal<{ query: string; results: ProcedureSearchResult[]; loading: boolean; selected: ProcedureSearchResult | null }[]>([]);
  private _procSearchTimers = new Map<number, ReturnType<typeof setTimeout>>();

  // ── MedSys patient search ─────────────────────────────────────
  medsysSearchQuery     = signal('');
  medsysSearchLoading   = signal(false);
  medsysSearchError     = signal<string | null>(null);
  medsysPatientList     = signal<MedsysPatient[]>([]);
  medsysSelectedPatient = signal<MedsysPatient | null>(null);
  medsysAppointments    = signal<MedsysAppointment[]>([]);
  medsysSelectedAppt    = signal<MedsysAppointment | null>(null);

  private _appointmentCode = signal<string | null>(null);
  private _medsysSearch$   = new Subject<string>();
  private _sellerSearch$   = new Subject<string>();
  private _referrerSearch$ = new Subject<string>();

  // ── API pública (para uso desde el padre vía @ViewChild) ───────
  get isValid(): boolean {
    const v = this.patientForm.value;
    if (!v.patient_document?.trim() || !v.patient_external_id?.trim()) return false;
    if (!v.patient_first_name?.trim() || !v.patient_last_name?.trim()) return false;
    if (!v.service_date) return false;
    if (!v.seller?.trim() || !v.referrer?.trim()) return false;
    if (this.procedureRows.length === 0) return false;
    return this.procedureRows.controls.every(row => {
      const rv = (row as FormGroup).value;
      if (!rv.procedure_id || rv.quantity < 1 || rv.unit_price === null || rv.unit_price < 0) return false;
      if (this.mode === 'exit' && !this._htmlHasText(rv.notes)) return false;
      return true;
    });
  }

  getValue(): PatientSaleFormValue {
    const v = this.patientForm.value;
    return {
      patient_document:    v.patient_document!,
      patient_external_id: v.patient_external_id!,
      patient_first_name:  v.patient_first_name!,
      patient_last_name:   v.patient_last_name!,
      service_date:        v.service_date!,
      seller:              v.seller!,
      referrer:            v.referrer!,
      appointment_code:    this._appointmentCode(),
      procedures: (this.procedureRows.value as any[]).map(r => ({
        procedure_id: r.procedure_id,
        quantity:     r.quantity,
        unit_price:   r.unit_price,
        notes:        r.notes || '',
      })),
    };
  }

  get proceduresGrandTotal(): number {
    return (this.procedureRows.value as any[])
      .reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
  }

  asGroup(ctrl: AbstractControl): FormGroup { return ctrl as FormGroup; }

  // ── Lifecycle ──────────────────────────────────────────────────
  ngOnInit(): void {
    this._medsysSearch$.pipe(
      debounceTime(300), distinctUntilChanged(),
      switchMap(term => {
        if (term.trim().length < 3) {
          this.medsysPatientList.set([]);
          this.medsysSearchError.set(null);
          return of(null);
        }
        this.medsysSearchLoading.set(true);
        this.medsysSearchError.set(null);
        return this.medSvc.searchMedsysPatients(term).pipe(
          catchError(err => {
            const msg = err.status === 404
              ? (err.error?.message ?? 'Paciente no encontrado en MedSys')
              : err.status === 403
                ? 'Sin permiso para consultar MedSys'
                : 'Error al consultar MedSys';
            this.medsysSearchLoading.set(false);
            this.medsysSearchError.set(msg);
            return of(null);
          }),
        );
      }),
    ).subscribe(res => {
      this.medsysSearchLoading.set(false);
      if (!res) return;
      this.medsysPatientList.set(res.data.patients ?? []);
    });

    this._sellerSearch$.pipe(
      debounceTime(300), distinctUntilChanged(),
      switchMap(text => text.trim().length >= 2
        ? this.medSvc.getPatientProcedureRecords({ seller: text, per_page: 10 })
        : of(null)),
    ).subscribe(res => {
      if (!res) { this.sellerSuggestions.set([]); return; }
      const unique = [...new Set((res.data ?? []).map(m => m.seller).filter(Boolean) as string[])];
      this.sellerSuggestions.set(unique);
    });

    this._referrerSearch$.pipe(
      debounceTime(300), distinctUntilChanged(),
      switchMap(text => text.trim().length >= 2
        ? this.medSvc.getPatientProcedureRecords({ referrer: text, per_page: 10 })
        : of(null)),
    ).subscribe(res => {
      if (!res) { this.referrerSuggestions.set([]); return; }
      const unique = [...new Set((res.data ?? []).map(m => m.referrer).filter(Boolean) as string[])];
      this.referrerSuggestions.set(unique);
    });
  }

  // ── MedSys handlers ───────────────────────────────────────────
  onMedsysSearchInput(value: string): void {
    this.medsysSearchQuery.set(value);
    this.medsysPatientList.set([]);
    this.medsysSelectedPatient.set(null);
    this.medsysAppointments.set([]);
    this.medsysSelectedAppt.set(null);
    this._appointmentCode.set(null);
    this._medsysSearch$.next(value);
  }

  selectMedsysPatient(patient: MedsysPatient): void {
    this._fillPatientFromMedsys(patient);
    this.medsysPatientList.set([]);
    // Las últimas 3 citas vienen en la respuesta; invertimos para mostrar de más antigua a más reciente.
    const recent = (patient.recent_appointments ?? []).slice().reverse();
    this.medsysAppointments.set(recent);
  }

  selectMedsysAppointment(appt: MedsysAppointment): void {
    this.medsysSelectedAppt.set(appt);
    this._appointmentCode.set(appt.codcontrol);
    this.patientForm.get('service_date')!.setValue(new Date(appt.fecha + 'T12:00:00'));
    if (this.procedureRows.length === 0) this.addProcedureRow();
  }

  private readonly _ACTIVE_APPT_STATES = ['Cita Agendada', 'Cita Confirmada', 'En Consultorio'];

  isActiveAppointment(appt: MedsysAppointment): boolean {
    return this._ACTIVE_APPT_STATES.includes(appt.estado);
  }

  clearMedsysPatient(): void {
    this.medsysSelectedPatient.set(null);
    this.medsysSelectedAppt.set(null);
    this._appointmentCode.set(null);
    this.medsysAppointments.set([]);
    this.medsysSearchQuery.set('');
    this.medsysSearchError.set(null);
    this.patientForm.patchValue({
      patient_document:    '',
      patient_external_id: '',
      patient_first_name:  '',
      patient_last_name:   '',
    });
  }

  private _fillPatientFromMedsys(patient: MedsysPatient): void {
    this.medsysSelectedPatient.set(patient);
    const { firstName, lastName } = this._splitMedsysName(patient.nombre);
    this.patientForm.patchValue({
      patient_document:    patient.documento,
      patient_external_id: patient.codigo,
      patient_first_name:  firstName,
      patient_last_name:   lastName,
    });
  }

  private _splitMedsysName(nombre: string): { firstName: string; lastName: string } {
    const parts = nombre.trim().split(/\s+/);
    if (parts.length >= 4) return { firstName: parts.slice(0, 2).join(' '), lastName: parts.slice(2).join(' ') };
    if (parts.length === 3) return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
    return { firstName: nombre, lastName: '' };
  }

  // ── Suggestions handlers ───────────────────────────────────────
  onSellerInput(value: string): void   { this._sellerSearch$.next(value); }
  onReferrerInput(value: string): void { this._referrerSearch$.next(value); }

  // ── Procedure search ────────────────────────────────────────────
  onProcSearchInput(idx: number, value: string): void {
    this.procSearch.update(arr => {
      const copy = [...arr];
      copy[idx] = { query: value, results: [], loading: false, selected: null };
      return copy;
    });
    (this.procedureRows.at(idx) as FormGroup)
      .patchValue({ procedure_id: null, unit_price: null }, { emitEvent: false });

    clearTimeout(this._procSearchTimers.get(idx));
    if (value.trim().length < 2) return;

    this._procSearchTimers.set(idx, setTimeout(() => {
      this.procSearch.update(arr => {
        const copy = [...arr]; copy[idx] = { ...copy[idx], loading: true }; return copy;
      });
      this.medSvc.searchProcedures(value.trim()).subscribe({
        next: r => this.procSearch.update(arr => {
          const copy = [...arr]; copy[idx] = { ...copy[idx], loading: false, results: r.data }; return copy;
        }),
        error: () => this.procSearch.update(arr => {
          const copy = [...arr]; copy[idx] = { ...copy[idx], loading: false, results: [] }; return copy;
        }),
      });
    }, 350));
  }

  selectProcedureResult(idx: number, result: ProcedureSearchResult): void {
    this.procSearch.update(arr => {
      const copy = [...arr];
      copy[idx] = { query: `${result.code} — ${result.name}`, results: [], loading: false, selected: result };
      return copy;
    });
    const row = this.procedureRows.at(idx) as FormGroup;
    row.get('procedure_id')?.setValue(result.id, { emitEvent: false });
    row.get('unit_price')?.setValue(result.current_price?.unit_price ?? null, { emitEvent: false });
    if (this.mode === 'exit') this._loadProcedureTemplate(idx, result.id);
  }

  clearProcedure(idx: number): void {
    this.procSearch.update(arr => {
      const copy = [...arr];
      copy[idx] = { query: '', results: [], loading: false, selected: null };
      return copy;
    });
    (this.procedureRows.at(idx) as FormGroup)
      .patchValue({ procedure_id: null, unit_price: null }, { emitEvent: false });
    this.rowTemplates.update(arr => { const a = [...arr]; a[idx] = null; return a; });
  }

  // ── Procedure rows ─────────────────────────────────────────────
  addProcedureRow(): void {
    const row = this.fb.group({
      procedure_id: [null as number | null, Validators.required],
      quantity:     [1,                     [Validators.required, Validators.min(1)]],
      unit_price:   [null as number | null, [Validators.required, Validators.min(0)]],
      notes:        [''],
    });
    this.procedureRows.push(row);
    this.rowTemplates.update(arr => [...arr, null]);
    this.rowTemplatesLoading.update(arr => [...arr, false]);
    this.procSearch.update(arr => [...arr, { query: '', results: [], loading: false, selected: null }]);
  }

  removeProcedureRow(i: number): void {
    if (this.procedureRows.length <= 1) return;
    this.procedureRows.removeAt(i);
    this.rowTemplates.update(arr => arr.filter((_, idx) => idx !== i));
    this.rowTemplatesLoading.update(arr => arr.filter((_, idx) => idx !== i));
    this.procSearch.update(arr => arr.filter((_, idx) => idx !== i));
  }

  rowProcedureTotal(i: number): number {
    const row = this.procedureRows.at(i) as FormGroup;
    return (Number(row?.get('quantity')?.value) || 0) * (Number(row?.get('unit_price')?.value) || 0);
  }

  // ── Privados ───────────────────────────────────────────────────
  private _loadProcedureTemplate(rowIdx: number, procedureId: number): void {
    this.rowTemplatesLoading.update(arr => { const a = [...arr]; a[rowIdx] = true; return a; });
    this.medSvc.getTemplateForService(procedureId)
      .pipe(finalize(() => this.rowTemplatesLoading.update(arr => { const a = [...arr]; a[rowIdx] = false; return a; })))
      .subscribe({
        next: r => {
          this.rowTemplates.update(arr => { const a = [...arr]; a[rowIdx] = r.data; return a; });
          if (r.data?.content) {
            (this.procedureRows.at(rowIdx) as FormGroup)?.get('notes')?.setValue(r.data.content, { emitEvent: false });
          } else {
            (this.procedureRows.at(rowIdx) as FormGroup)?.get('notes')?.setValue('', { emitEvent: false });
          }
        },
        error: () => this.rowTemplates.update(arr => { const a = [...arr]; a[rowIdx] = null; return a; }),
      });
  }

  _htmlHasText(html: string | null | undefined): boolean {
    if (!html) return false;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent ?? '').trim().length > 0;
  }
}

import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl, FormArray, FormBuilder, FormGroup,
  ReactiveFormsModule, Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatRadioModule } from '@angular/material/radio';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs/operators';
import { ServiceOrdersService, ServiceOrderPayload, ServiceOrder } from '../service-orders.service';
import {
  MedicalServicesService,
  MedsysPatient, MedsysAppointment, ProcedureSearchResult,
} from '../../inventory/medical-services.service';
import { WarehouseService, Warehouse } from '../../warehouse/warehouse.service';
import { InventoryService, BatchDetail } from '../../inventory/inventory.service';
import { Product } from '../../catalog/catalog.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { ProductSearchComponent } from '../../../shared/components/product-search/product-search.component';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

interface SupplyBatchState {
  batches: BatchDetail[];
  loading: boolean;
  error:   string | null;
}

interface ProcSearchState {
  query:    string;
  results:  ProcedureSearchResult[];
  loading:  boolean;
  selected: ProcedureSearchResult | null;
}

@Component({
  selector: 'app-service-order-form-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, MatSlideToggleModule, MatRadioModule,
    MatAutocompleteModule, MatTooltipModule, MatSnackBarModule,
    PageHeaderComponent, FormErrorsComponent, ProductSearchComponent, RichTextEditorComponent,
  ],
  templateUrl: './service-order-form-page.component.html',
  styleUrl: './service-order-form-page.component.scss',
})
export class ServiceOrderFormPageComponent implements OnInit, OnDestroy {
  private fb      = inject(FormBuilder);
  private svc     = inject(ServiceOrdersService);
  private medSvc  = inject(MedicalServicesService);
  private wSvc    = inject(WarehouseService);
  private invSvc  = inject(InventoryService);
  private router  = inject(Router);
  private snack   = inject(MatSnackBar);

  readonly today = new Date().toISOString().split('T')[0];

  // ── Form ────────────────────────────────────────────────────────────
  patientGroup = this.fb.group({
    patient_external_id: ['', Validators.required],
    patient_document:    ['', Validators.required],
    patient_first_name:  ['', Validators.required],
    patient_last_name:   ['', Validators.required],
    patient_email:       [''],
    patient_address:     [''],
    patient_phone:       [''],
    service_date:        [this.today, Validators.required],
    seller:              [''],
    referrer:            [''],
    notes:               [''],
  });

  proceduresArray = this.fb.array<FormGroup>([]);

  // ── State signals ───────────────────────────────────────────────
  saving        = signal(false);
  errors        = signal<string[]>([]);
  orderCreated  = signal<ServiceOrder | null>(null);

  // Warehouse catalogue
  warehouses        = signal<Warehouse[]>([]);
  loadingWarehouses = signal(false);

  // Per-procedure search state
  procSearch       = signal<ProcSearchState[]>([]);
  supplyProducts   = signal<(Product | null)[][]>([]);  // [procIdx][supplyIdx]
  supplyBatchState = signal<(SupplyBatchState | null)[][]>([]);

  private _procSearchTimers = new Map<number, ReturnType<typeof setTimeout>>();

  // Seller / referrer autocomplete
  sellerSuggestions   = signal<string[]>([]);
  referrerSuggestions = signal<string[]>([]);
  private _sellerSearch$   = new Subject<string>();
  private _referrerSearch$ = new Subject<string>();

  // MedSys patient search
  medsysQuery        = signal('');
  medsysLoading      = signal(false);
  medsysError        = signal<string | null>(null);
  medsysPatientList  = signal<MedsysPatient[]>([]);
  medsysSelected     = signal<MedsysPatient | null>(null);
  medsysAppointments = signal<MedsysAppointment[]>([]);
  private _medsysSearch$ = new Subject<string>();
  private _destroy$      = new Subject<void>();

  // ── Helpers ─────────────────────────────────────────────────────
  asGroup(ctrl: AbstractControl): FormGroup { return ctrl as FormGroup; }

  getSupplies(procIdx: number): FormArray {
    return (this.proceduresArray.at(procIdx) as FormGroup).get('supplies') as FormArray;
  }

  procedureTotal(procIdx: number): number {
    const pg = this.proceduresArray.at(procIdx) as FormGroup;
    return (Number(pg.get('unit_price')?.value) || 0) *
           (Number(pg.get('quantity')?.value) || 1);
  }

  discountAmount(procIdx: number): number {
    const pg = this.proceduresArray.at(procIdx) as FormGroup;
    const total = this.procedureTotal(procIdx);
    const type  = pg.get('discount_type')?.value;
    if (type === 'percentage') {
      return total * (Number(pg.get('discount_percent')?.value) || 0) / 100;
    }
    return Number(pg.get('discount_amount')?.value) || 0;
  }

  discountNet(procIdx: number): number {
    return this.procedureTotal(procIdx) - this.discountAmount(procIdx);
  }

  get isFormValid(): boolean {
    const pv = this.patientGroup.value;
    if (!pv.patient_external_id?.trim() || !pv.patient_document?.trim()) return false;
    if (!pv.patient_first_name?.trim() || !pv.patient_last_name?.trim()) return false;
    if (!pv.service_date) return false;
    if (this.proceduresArray.length === 0) return false;

    return this.proceduresArray.controls.every((ctrl, i) => {
      const pg = ctrl as FormGroup;
      const rv = pg.value;
      if (!rv.medical_service_id) return false;
      if (rv.unit_price === null || rv.unit_price === undefined || Number(rv.unit_price) < 0) return false;
      if (!rv.quantity || Number(rv.quantity) <= 0) return false;
      if (!this._htmlHasText(rv.notes)) return false;

      if (rv.has_discount) {
        if (rv.discount_type === 'percentage') {
          const pct = Number(rv.discount_percent);
          if (!pct || pct <= 0 || pct >= 100) return false;
        } else {
          const da = Number(rv.discount_amount);
          const total = this.procedureTotal(i);
          if (da < 0 || da >= total) return false;
        }
      }

      if (rv.has_supplies) {
        const supplies = this.getSupplies(i);
        if (supplies.length === 0) return false;
        return supplies.controls.every((sc, si) => {
          const sv = (sc as FormGroup).value;
          if (!sv.warehouse_id || !sv.generic_product_id || !sv.batch_id) return false;
          if (Number(sv.quantity) <= 0) return false;
          if (this.supplyQtyExceeds(i, si)) return false;
          const bState = this.getSupplyBatchState(i, si);
          if (bState?.error) return false;
          return true;
        });
      }
      return true;
    });
  }

  // ── Lifecycle ───────────────────────────────────────────────────
  ngOnInit(): void {
    this._loadWarehouses();
    this._setupMedsysSearch();
    this._setupAutocompletes();
    this.addProcedure();
  }

  ngOnDestroy(): void {
    this._procSearchTimers.forEach(t => clearTimeout(t));
    this._destroy$.next();
    this._destroy$.complete();
  }

  // ── MedSys ─────────────────────────────────────────────────────
  onMedsysInput(value: string): void {
    this.medsysQuery.set(value);
    this.medsysPatientList.set([]);
    this.medsysSelected.set(null);
    this.medsysError.set(null);
    this._medsysSearch$.next(value);
  }

  selectMedsysPatient(patient: MedsysPatient): void {
    this.medsysSelected.set(patient);
    this.medsysPatientList.set([]);
    this.medsysQuery.set(patient.nombre);
    const { firstName, lastName } = this._splitName(patient.nombre);
    this.patientGroup.patchValue({
      patient_external_id: patient.codigo,
      patient_document:    patient.documento,
      patient_first_name:  firstName,
      patient_last_name:   lastName,
      patient_email:       patient.email     ?? '',
      patient_address:     patient.direccion ?? '',
      patient_phone:       patient.telcelular ?? patient.telefono ?? '',
    });
    // Las últimas 3 citas vienen en la respuesta de búsqueda (más reciente primero).
    // Invertimos para mostrar de más antigua a más reciente.
    const recent = (patient.recent_appointments ?? []).slice().reverse();
    this.medsysAppointments.set(recent);
  }

  clearPatient(): void {
    this.medsysSelected.set(null);
    this.medsysPatientList.set([]);
    this.medsysQuery.set('');
    this.medsysError.set(null);
    this.medsysAppointments.set([]);
    this.patientGroup.patchValue({
      patient_external_id: '',
      patient_document:    '',
      patient_first_name:  '',
      patient_last_name:   '',
      patient_email:       '',
      patient_address:     '',
      patient_phone:       '',
    });
  }

  // ── Procedure search ────────────────────────────────────────────
  onProcSearchInput(idx: number, value: string): void {
    this.procSearch.update(arr => {
      const copy = [...arr];
      copy[idx] = { query: value, results: [], loading: false, selected: null };
      return copy;
    });
    (this.proceduresArray.at(idx) as FormGroup)
      .patchValue({ medical_service_id: null, unit_price: null }, { emitEvent: false });

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
    const pg = this.proceduresArray.at(idx) as FormGroup;
    pg.get('medical_service_id')?.setValue(result.id, { emitEvent: false });
    pg.get('unit_price')?.setValue(result.current_price?.unit_price ?? null, { emitEvent: false });
  }

  clearProcedure(idx: number): void {
    this.procSearch.update(arr => {
      const copy = [...arr];
      copy[idx] = { query: '', results: [], loading: false, selected: null };
      return copy;
    });
    (this.proceduresArray.at(idx) as FormGroup)
      .patchValue({ medical_service_id: null, unit_price: null }, { emitEvent: false });
  }

  // ── Procedures ─────────────────────────────────────────────────
  addProcedure(): void {
    const pg = this.fb.group({
      medical_service_id: [null as number | null, Validators.required],
      unit_price:   [null as number | null, [Validators.required, Validators.min(0)]],
      quantity:     [1, [Validators.required, Validators.min(0.001)]],
      has_discount: [false],
      discount_type:    ['percentage'],
      discount_percent: [null as number | null],
      discount_amount:  [null as number | null],
      discount_net:     [null as number | null],
      has_supplies: [false],
      notes:        [''],
      supplies:     this.fb.array<FormGroup>([]),
    });

    this.proceduresArray.push(pg);
    this.procSearch.update(arr => [...arr, { query: '', results: [], loading: false, selected: null }]);
    this.supplyProducts.update(arr => [...arr, []]);
    this.supplyBatchState.update(arr => [...arr, []]);
  }

  removeProcedure(i: number): void {
    if (this.proceduresArray.length <= 1) return;
    this.proceduresArray.removeAt(i);
    this.procSearch.update(arr => arr.filter((_, idx) => idx !== i));
    this.supplyProducts.update(arr => arr.filter((_, idx) => idx !== i));
    this.supplyBatchState.update(arr => arr.filter((_, idx) => idx !== i));
  }

  // ── Discount helpers ────────────────────────────────────────────
  onDiscountAmountInput(procIdx: number): void {
    const pg    = this.proceduresArray.at(procIdx) as FormGroup;
    const total = this.procedureTotal(procIdx);
    const da    = Math.max(0, Math.min(total - 0.01, Number(pg.get('discount_amount')?.value) || 0));
    pg.get('discount_net')?.setValue(+(total - da).toFixed(2), { emitEvent: false });
  }

  onDiscountNetInput(procIdx: number): void {
    const pg    = this.proceduresArray.at(procIdx) as FormGroup;
    const total = this.procedureTotal(procIdx);
    const net   = Math.max(0.01, Math.min(total, Number(pg.get('discount_net')?.value) || 0));
    pg.get('discount_amount')?.setValue(+(total - net).toFixed(2), { emitEvent: false });
  }

  onDiscountTypeChange(procIdx: number): void {
    const pg = this.proceduresArray.at(procIdx) as FormGroup;
    pg.patchValue({ discount_percent: null, discount_amount: null, discount_net: null }, { emitEvent: false });
  }

  onUnitPriceOrQtyChange(procIdx: number): void {
    const pg = this.proceduresArray.at(procIdx) as FormGroup;
    if (pg.get('has_discount')?.value && pg.get('discount_type')?.value === 'fixed') {
      pg.patchValue({ discount_amount: null, discount_net: null }, { emitEvent: false });
    }
  }

  // ── Supplies ────────────────────────────────────────────────────
  addSupply(procIdx: number): void {
    const supplies = this.getSupplies(procIdx);
    supplies.push(this.fb.group({
      warehouse_id:       [null as number | null, Validators.required],
      generic_product_id: [null as number | null, Validators.required],
      batch_id:           [null as number | null, Validators.required],
      quantity:           [1, [Validators.required, Validators.min(0.001)]],
    }));
    this.supplyProducts.update(arr => {
      const copy = [...arr];
      copy[procIdx] = [...(copy[procIdx] ?? []), null];
      return copy;
    });
    this.supplyBatchState.update(arr => {
      const copy = [...arr];
      copy[procIdx] = [...(copy[procIdx] ?? []), null];
      return copy;
    });
  }

  removeSupply(procIdx: number, supplyIdx: number): void {
    this.getSupplies(procIdx).removeAt(supplyIdx);
    this.supplyProducts.update(arr => {
      const copy = [...arr];
      copy[procIdx] = (copy[procIdx] ?? []).filter((_, i) => i !== supplyIdx);
      return copy;
    });
    this.supplyBatchState.update(arr => {
      const copy = [...arr];
      copy[procIdx] = (copy[procIdx] ?? []).filter((_, i) => i !== supplyIdx);
      return copy;
    });
  }

  onSupplyProductSelected(procIdx: number, supplyIdx: number, product: Product | null): void {
    const supplyGroup = this.getSupplies(procIdx).at(supplyIdx) as FormGroup;
    supplyGroup.get('generic_product_id')?.setValue(product?.id ?? null);
    supplyGroup.get('batch_id')?.setValue(null, { emitEvent: false });
    this.supplyProducts.update(arr => {
      const copy = [...arr];
      copy[procIdx] = [...(copy[procIdx] ?? [])];
      copy[procIdx][supplyIdx] = product;
      return copy;
    });
    this._resetSupplyBatchState(procIdx, supplyIdx);
    if (product && supplyGroup.get('warehouse_id')?.value) {
      this._loadSupplyBatches(procIdx, supplyIdx);
    }
  }

  onSupplyWarehouseChange(procIdx: number, supplyIdx: number): void {
    const supplyGroup = this.getSupplies(procIdx).at(supplyIdx) as FormGroup;
    supplyGroup.get('batch_id')?.setValue(null, { emitEvent: false });
    this._resetSupplyBatchState(procIdx, supplyIdx);
    if (supplyGroup.get('generic_product_id')?.value) {
      this._loadSupplyBatches(procIdx, supplyIdx);
    }
  }

  getSupplyBatchState(procIdx: number, supplyIdx: number): SupplyBatchState | null {
    return this.supplyBatchState()[procIdx]?.[supplyIdx] ?? null;
  }

  getSelectedBatch(procIdx: number, supplyIdx: number): BatchDetail | null {
    const batchId = (this.getSupplies(procIdx).at(supplyIdx) as FormGroup).get('batch_id')?.value;
    const state = this.getSupplyBatchState(procIdx, supplyIdx);
    if (!batchId || !state) return null;
    return state.batches.find(b => b.id === batchId) ?? null;
  }

  supplyQtyExceeds(procIdx: number, supplyIdx: number): boolean {
    const qty = Number((this.getSupplies(procIdx).at(supplyIdx) as FormGroup).get('quantity')?.value) || 0;
    const batch = this.getSelectedBatch(procIdx, supplyIdx);
    return !!batch && qty > batch.quantity_available;
  }

  getSupplyProduct(procIdx: number, supplyIdx: number): Product | null {
    return this.supplyProducts()[procIdx]?.[supplyIdx] ?? null;
  }

  // ── Autocomplete handlers ───────────────────────────────────────
  onSellerInput(val: string): void   { this._sellerSearch$.next(val); }
  onReferrerInput(val: string): void { this._referrerSearch$.next(val); }

  // ── Save ────────────────────────────────────────────────────────
  save(): void {
    if (!this.isFormValid || this.saving()) return;
    this.errors.set([]);
    this.saving.set(true);

    const pv = this.patientGroup.value;
    const payload: ServiceOrderPayload = {
      patient_external_id: pv.patient_external_id!,
      patient_document:    pv.patient_document!,
      patient_first_name:  pv.patient_first_name!,
      patient_last_name:   pv.patient_last_name!,
      service_date:        pv.service_date!,
      ...(pv.patient_email   && { patient_email:   pv.patient_email }),
      ...(pv.patient_address && { patient_address: pv.patient_address }),
      ...(pv.patient_phone   && { patient_phone:   pv.patient_phone }),
      ...(pv.seller          && { seller:           pv.seller }),
      ...(pv.referrer        && { referrer:         pv.referrer }),
      ...(pv.notes           && { notes:            pv.notes }),
      procedures: this.proceduresArray.controls.map((ctrl, i) => {
        const pg = ctrl as FormGroup;
        const rv = pg.value;
        const proc: any = {
          medical_service_id: rv.medical_service_id,
          unit_price:         Number(rv.unit_price),
          quantity:           Number(rv.quantity),
          notes:              rv.notes || undefined,
        };
        if (rv.has_discount) {
          proc['discount_type'] = rv.discount_type;
          proc['discount_value'] = rv.discount_type === 'percentage'
            ? Number(rv.discount_percent)
            : Number(rv.discount_amount);
        }
        if (rv.has_supplies) {
          const supplies = this.getSupplies(i);
          proc['supplies'] = supplies.controls.map((sc) => ({
            warehouse_id:       (sc as FormGroup).value.warehouse_id,
            generic_product_id: (sc as FormGroup).value.generic_product_id,
            batch_id:           (sc as FormGroup).value.batch_id,
            quantity:           Number((sc as FormGroup).value.quantity),
          }));
        }
        return proc;
      }),
    };

    this.svc.createOrder(payload).subscribe({
      next: res => {
        this.saving.set(false);
        this.orderCreated.set(res.data);
      },
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        } else {
          this.errors.set([err.error?.message || 'Error al crear la orden de servicio']);
        }
      },
    });
  }

  newOrder(): void {
    this.orderCreated.set(null);
    this.errors.set([]);
    this.patientGroup.reset({ service_date: this.today });
    this.proceduresArray.clear();
    this.procSearch.set([]);
    this.supplyProducts.set([]);
    this.supplyBatchState.set([]);
    this.medsysSelected.set(null);
    this.medsysAppointments.set([]);
    this.medsysQuery.set('');
    this.medsysPatientList.set([]);
    this.addProcedure();
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  }

  // ── Private helpers ─────────────────────────────────────────────
  private _loadWarehouses(): void {
    this.loadingWarehouses.set(true);
    this.wSvc.getWarehouses({ is_active: 'true' })
      .pipe(finalize(() => this.loadingWarehouses.set(false)))
      .subscribe({ next: r => this.warehouses.set(r.data), error: () => {} });
  }

  private _setupMedsysSearch(): void {
    this._medsysSearch$.pipe(
      debounceTime(300), distinctUntilChanged(),
      switchMap(term => {
        if (term.trim().length < 3) {
          this.medsysPatientList.set([]);
          this.medsysError.set(null);
          return of(null);
        }
        this.medsysLoading.set(true);
        this.medsysError.set(null);
        return this.medSvc.searchMedsysPatients(term).pipe(
          finalize(() => this.medsysLoading.set(false)),
          catchError(err => {
            this.medsysError.set(
              err.status === 404 ? (err.error?.message ?? 'Paciente no encontrado en MedSys') :
              err.status === 403 ? 'Sin permiso para consultar MedSys' :
              'Error al consultar MedSys'
            );
            return of(null);
          }),
        );
      }),
    ).subscribe(res => {
      if (!res) return;
      // El backend siempre devuelve lista; las citas se cargan al seleccionar el paciente
      this.medsysPatientList.set(res.data.patients ?? []);
    });
  }

  private _setupAutocompletes(): void {
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

  private _resetSupplyBatchState(procIdx: number, supplyIdx: number): void {
    this.supplyBatchState.update(arr => {
      const copy = arr.map(row => [...row]);
      copy[procIdx] = [...(copy[procIdx] ?? [])];
      copy[procIdx][supplyIdx] = null;
      return copy;
    });
  }

  private _loadSupplyBatches(procIdx: number, supplyIdx: number): void {
    const supplyGroup = this.getSupplies(procIdx).at(supplyIdx) as FormGroup;
    const productId   = supplyGroup.get('generic_product_id')?.value;
    const warehouseId = supplyGroup.get('warehouse_id')?.value;
    if (!productId || !warehouseId) return;

    this.supplyBatchState.update(arr => {
      const copy = arr.map(row => [...row]);
      copy[procIdx] = [...(copy[procIdx] ?? [])];
      copy[procIdx][supplyIdx] = { batches: [], loading: true, error: null };
      return copy;
    });

    this.invSvc.getProductBatches(productId, true, Number(warehouseId))
      .pipe(finalize(() => {}))
      .subscribe({
        next: r => {
          const available = r.data
            .filter(b => b.status === 'active' && b.quantity_available > 0)
            .sort((a, b) => {
              if (!a.expiration_date && !b.expiration_date) return 0;
              if (!a.expiration_date) return 1;  // sin vencimiento va al final
              if (!b.expiration_date) return -1;
              return a.expiration_date.localeCompare(b.expiration_date);
            });
          this.supplyBatchState.update(arr => {
            const copy = arr.map(row => [...row]);
            copy[procIdx] = [...(copy[procIdx] ?? [])];
            copy[procIdx][supplyIdx] = {
              batches: available,
              loading: false,
              error: available.length === 0 ? 'Sin stock disponible en este almacén' : null,
            };
            return copy;
          });
          // Auto-seleccionar si solo hay un lote
          if (available.length === 1) {
            supplyGroup.get('batch_id')?.setValue(available[0].id, { emitEvent: false });
          }
        },
        error: () => {
          this.supplyBatchState.update(arr => {
            const copy = arr.map(row => [...row]);
            copy[procIdx] = [...(copy[procIdx] ?? [])];
            copy[procIdx][supplyIdx] = { batches: [], loading: false, error: 'Error al cargar lotes' };
            return copy;
          });
        },
      });
  }

  private _splitName(nombre: string): { firstName: string; lastName: string } {
    const parts = nombre.trim().split(/\s+/);
    if (parts.length >= 4) return { firstName: parts.slice(0, 2).join(' '), lastName: parts.slice(2).join(' ') };
    if (parts.length === 3) return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
    return { firstName: nombre, lastName: '' };
  }

  _htmlHasText(html: string | null | undefined): boolean {
    if (!html) return false;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent ?? '').trim().length > 0;
  }
}

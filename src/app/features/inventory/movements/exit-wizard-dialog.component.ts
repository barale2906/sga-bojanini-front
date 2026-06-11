import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl, FormArray, FormBuilder, FormGroup,
  ReactiveFormsModule, Validators,
} from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { forkJoin, finalize, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { InventoryService, StockSummary, BatchDetail, CostCenter } from '../inventory.service';
import { WarehouseService, Warehouse, Location } from '../../warehouse/warehouse.service';
import { Product } from '../../catalog/catalog.service';
import { MedicalServicesService, MedicalServiceNode, ProcedurePrice } from '../medical-services.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';
import { MovementPdfService } from '../../../shared/services/movement-pdf.service';

export interface ExitWizardDialogData {
  warehouses: Warehouse[];
  products: Product[];
  inventorySvc: InventoryService;
}

interface RowStock {
  summary: StockSummary | null;
  fefo: BatchDetail[];
  loadingStock: boolean;
  loadingFefo: boolean;
}

@Component({
  selector: 'app-exit-wizard-dialog',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule, MatDividerModule,
    MatDatepickerModule, FormErrorsComponent,
  ],
  templateUrl: './exit-wizard-dialog.component.html',
  styleUrl: './exit-wizard-dialog.component.scss',
})
export class ExitWizardDialogComponent implements OnInit {
  data: ExitWizardDialogData = inject(MAT_DIALOG_DATA);
  private ref    = inject(MatDialogRef<ExitWizardDialogComponent>);
  private fb     = inject(FormBuilder);
  private wSvc   = inject(WarehouseService);
  private medSvc = inject(MedicalServicesService);
  private pdfSvc = inject(MovementPdfService);

  // ── Wizard state ─────────────────────────────────────────────
  step    = signal<1 | 2>(1);
  saving  = signal(false);
  errors  = signal<string[]>([]);

  // ── Step 1: Productos ────────────────────────────────────────
  warehouseControl = this.fb.control<number | null>(null, Validators.required);
  productRows      = this.fb.array<FormGroup>([]);
  locations        = signal<Location[]>([]);
  rowStocks        = signal<RowStock[]>([]);

  // ── Step 2: Centro de costos y paciente ──────────────────────
  centerForm = this.fb.group({
    cost_center_id:      [null as number | null, Validators.required],
    reason:              [''],
    patient_document:    [null as string | null],
    patient_external_id: [null as string | null],
    patient_first_name:  [null as string | null],
    patient_last_name:   [null as string | null],
    service_date:        [new Date() as Date | null],
    filter_service_id:   [null as number | null],
  });
  procedureRows = this.fb.array<FormGroup>([]);

  costCenters          = signal<CostCenter[]>([]);
  loadingCostCenters   = signal(false);
  servicesTree         = signal<MedicalServiceNode[]>([]);
  loadingTree          = signal(false);
  rowPrices            = signal<(ProcedurePrice | null)[]>([]);
  rowPricesLoading     = signal<boolean[]>([]);

  // ── Computed ─────────────────────────────────────────────────

  get selectedCostCenter(): CostCenter | null {
    const id = this.centerForm.get('cost_center_id')?.value;
    return this.costCenters().find(c => c.id === id) ?? null;
  }

  get isExternalCenter(): boolean {
    return this.selectedCostCenter?.is_external === true;
  }

  selectedProcedures = computed((): MedicalServiceNode[] => {
    const serviceId = this.centerForm.get('filter_service_id')?.value;
    if (!serviceId) return [];
    return this.servicesTree().find(s => s.id === serviceId)?.children ?? [];
  });

  get selectedWarehouseName(): string {
    const id = this.warehouseControl.value;
    return this.data.warehouses.find(w => w.id === id)?.name ?? '';
  }

  get isStep1Valid(): boolean {
    if (!this.warehouseControl.valid) return false;
    if (this.productRows.length === 0) return false;
    return this.productRows.controls.every((row, i) => {
      const v = (row as FormGroup).value;
      if (!v.product_id || !v.quantity || v.quantity < 1) return false;
      const stock = this.rowStocks()[i]?.summary;
      if (stock !== null && stock !== undefined && stock.available_quantity === 0) return false;
      if (stock && v.quantity > stock.available_quantity) return false;
      return true;
    });
  }

  get isStep2Valid(): boolean {
    if (!this.centerForm.get('cost_center_id')?.value) return false;
    if (this.isExternalCenter) {
      const v = this.centerForm.value;
      if (!v.patient_document?.trim() || !v.patient_external_id?.trim()) return false;
      if (!v.patient_first_name?.trim() || !v.patient_last_name?.trim()) return false;
      if (!v.service_date) return false;
      if (this.procedureRows.length === 0) return false;
      return this.procedureRows.controls.every(row => {
        const rv = (row as FormGroup).value;
        return rv.procedure_id && rv.quantity >= 1 && rv.unit_price !== null && rv.unit_price >= 0 && rv.notes?.trim();
      });
    }
    return true;
  }

  ngOnInit(): void {
    this._addProductRow();

    // Almacén → ubicaciones + recargar stock de todas las filas
    this.warehouseControl.valueChanges.subscribe(wId => {
      this.locations.set([]);
      if (wId) {
        this.wSvc.getWarehouseLocations(Number(wId))
          .subscribe({ next: r => this.locations.set(r.data), error: () => {} });
        this.productRows.controls.forEach((_, i) => this._loadRowStock(i));
      } else {
        this.rowStocks.update(arr => arr.map(r => ({ ...r, summary: null, fefo: [] })));
      }
    });

    // Centros de costo
    this.loadingCostCenters.set(true);
    this.data.inventorySvc.getCostCenters({ is_active: true })
      .pipe(finalize(() => this.loadingCostCenters.set(false)))
      .subscribe({ next: r => this.costCenters.set(r.data), error: () => {} });

    // Centro de costo → árbol si es externo
    this.centerForm.get('cost_center_id')!.valueChanges.subscribe(() => {
      this.procedureRows.clear();
      this.rowPrices.set([]);
      this.rowPricesLoading.set([]);
      this.centerForm.patchValue(
        { patient_document: null, patient_external_id: null, patient_first_name: null, patient_last_name: null, filter_service_id: null },
        { emitEvent: false },
      );
      if (this.isExternalCenter && !this.servicesTree().length) {
        this._loadServicesTree();
      }
    });

    // Servicio padre → limpiar filas de procedimientos
    this.centerForm.get('filter_service_id')!.valueChanges.subscribe(() => {
      this.procedureRows.clear();
      this.rowPrices.set([]);
      this.rowPricesLoading.set([]);
    });
  }

  // ── Filas de productos ────────────────────────────────────────

  addProductRow(): void { this._addProductRow(); }

  private _addProductRow(): void {
    const row = this.fb.group({
      product_id:  [null as number | null, Validators.required],
      quantity:    [null as number | null, [Validators.required, Validators.min(1)]],
      location_id: [null as number | null],
    });

    // Cuando cambia el producto en esta fila → recargar stock
    const idx = this.productRows.length;
    row.get('product_id')!.valueChanges.subscribe(() => this._loadRowStock(idx));

    this.productRows.push(row);
    this.rowStocks.update(arr => [...arr, { summary: null, fefo: [], loadingStock: false, loadingFefo: false }]);
  }

  removeProductRow(i: number): void {
    if (this.productRows.length <= 1) return;
    this.productRows.removeAt(i);
    this.rowStocks.update(arr => arr.filter((_, idx) => idx !== i));
  }

  private _loadRowStock(rowIdx: number): void {
    const pId = (this.productRows.at(rowIdx) as FormGroup)?.get('product_id')?.value;
    const wId = this.warehouseControl.value;
    if (!pId || !wId) return;

    this.rowStocks.update(arr => {
      const a = [...arr];
      if (a[rowIdx]) a[rowIdx] = { ...a[rowIdx], loadingStock: true, loadingFefo: true, summary: null, fefo: [] };
      return a;
    });

    this.data.inventorySvc.getStockSummary(Number(wId), Number(pId))
      .pipe(finalize(() => this.rowStocks.update(arr => {
        const a = [...arr]; if (a[rowIdx]) a[rowIdx] = { ...a[rowIdx], loadingStock: false }; return a;
      })))
      .subscribe({
        next: r => this.rowStocks.update(arr => {
          const a = [...arr]; if (a[rowIdx]) a[rowIdx] = { ...a[rowIdx], summary: r.data }; return a;
        }),
        error: () => this.rowStocks.update(arr => {
          const a = [...arr]; if (a[rowIdx]) a[rowIdx] = { ...a[rowIdx], summary: null }; return a;
        }),
      });

    this.data.inventorySvc.getProductBatches(Number(pId))
      .pipe(finalize(() => this.rowStocks.update(arr => {
        const a = [...arr]; if (a[rowIdx]) a[rowIdx] = { ...a[rowIdx], loadingFefo: false }; return a;
      })))
      .subscribe({
        next: r => this.rowStocks.update(arr => {
          const a = [...arr];
          if (a[rowIdx]) a[rowIdx] = { ...a[rowIdx], fefo: r.data.filter(b => b.status === 'active' && b.quantity_available > 0) };
          return a;
        }),
        error: () => {},
      });
  }

  rowStockStatus(i: number): 'ok' | 'warn' | 'danger' | 'loading' | 'none' {
    const s = this.rowStocks()[i];
    if (!s) return 'none';
    if (s.loadingStock) return 'loading';
    if (!s.summary) return 'none';
    const qty = Number((this.productRows.at(i) as FormGroup)?.get('quantity')?.value) || 0;
    if (s.summary.available_quantity === 0) return 'danger';
    if (qty > 0 && qty > s.summary.available_quantity) return 'danger';
    if (qty > 0 && qty > s.summary.available_quantity * 0.8) return 'warn';
    return 'ok';
  }

  fefoFirstLocation(i: number): string {
    const first = this.rowStocks()[i]?.fefo?.[0];
    if (!first?.locations?.length) return '';
    const loc = first.locations[0];
    return loc.zone ? `${loc.location_name} · ${loc.zone.zone_name}` : loc.location_name;
  }

  getProduct(productId: number | null): Product | null {
    if (!productId) return null;
    return this.data.products.find(p => p.id === productId) ?? null;
  }

  asGroup(ctrl: AbstractControl): FormGroup { return ctrl as FormGroup; }

  // ── Filas de procedimientos ───────────────────────────────────

  addProcedureRow(): void {
    const row = this.fb.group({
      procedure_id: [null as number | null, Validators.required],
      quantity:     [1,                     [Validators.required, Validators.min(1)]],
      unit_price:   [null as number | null, [Validators.required, Validators.min(0)]],
      notes:        ['', Validators.required],
    });

    const idx = this.procedureRows.length;
    row.get('procedure_id')!.valueChanges.subscribe(procId => {
      if (procId) this._loadProcedurePrice(idx, Number(procId));
    });

    this.procedureRows.push(row);
    this.rowPrices.update(arr => [...arr, null]);
    this.rowPricesLoading.update(arr => [...arr, false]);
  }

  removeProcedureRow(i: number): void {
    if (this.procedureRows.length <= 1) return;
    this.procedureRows.removeAt(i);
    this.rowPrices.update(arr => arr.filter((_, idx) => idx !== i));
    this.rowPricesLoading.update(arr => arr.filter((_, idx) => idx !== i));
  }

  private _loadProcedurePrice(rowIdx: number, procedureId: number): void {
    this.rowPricesLoading.update(arr => { const a = [...arr]; a[rowIdx] = true; return a; });

    this.medSvc.getProcedurePrices(procedureId, { is_active: true })
      .pipe(finalize(() => this.rowPricesLoading.update(arr => { const a = [...arr]; a[rowIdx] = false; return a; })))
      .subscribe({
        next: r => {
          const valid = r.data.find(p => p.is_currently_valid) ?? r.data[0] ?? null;
          this.rowPrices.update(arr => { const a = [...arr]; a[rowIdx] = valid; return a; });
          if (valid) {
            (this.procedureRows.at(rowIdx) as FormGroup)
              ?.get('unit_price')
              ?.setValue(valid.unit_price, { emitEvent: false });
          }
        },
        error: () => this.rowPrices.update(arr => { const a = [...arr]; a[rowIdx] = null; return a; }),
      });
  }

  rowProcedureTotal(i: number): number {
    const row = this.procedureRows.at(i) as FormGroup;
    const q = Number(row?.get('quantity')?.value) || 0;
    const p = Number(row?.get('unit_price')?.value) || 0;
    return q * p;
  }

  get proceduresGrandTotal(): number {
    return (this.procedureRows.value as any[]).reduce((sum, r) => {
      return sum + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0);
    }, 0);
  }

  // ── Servicios médicos ─────────────────────────────────────────

  private _loadServicesTree(): void {
    this.loadingTree.set(true);
    this.medSvc.getTree(true)
      .pipe(finalize(() => this.loadingTree.set(false)))
      .subscribe({ next: r => this.servicesTree.set(r.data), error: () => {} });
  }

  // ── Navegación entre pasos ────────────────────────────────────

  nextStep(): void {
    if (!this.isStep1Valid) return;
    this.errors.set([]);
    this.step.set(2);
    if (this.isExternalCenter && !this.servicesTree().length) this._loadServicesTree();
  }

  prevStep(): void { this.step.set(1); this.errors.set([]); }

  // ── Guardar ──────────────────────────────────────────────────

  save(): void {
    if (!this.isStep2Valid || this.saving()) return;
    this.errors.set([]);
    this.saving.set(true);

    const wId = this.warehouseControl.value!;
    const cv  = this.centerForm.value;

    // Construir payloads de salida (uno por fila de producto)
    const exitCalls = this.productRows.controls.map(ctrl => {
      const rv = (ctrl as FormGroup).value;
      const payload: Record<string, unknown> = {
        product_id:     rv.product_id,
        warehouse_id:   wId,
        quantity:       rv.quantity,
        cost_center_id: cv.cost_center_id,
        reason:         cv.reason || undefined,
      };
      if (rv.location_id) payload['location_id'] = rv.location_id;
      if (this.isExternalCenter) {
        payload['patient_document']    = cv.patient_document;
        payload['patient_external_id'] = cv.patient_external_id;
        const firstProc = (this.procedureRows.at(0) as FormGroup)?.value;
        if (firstProc?.procedure_id) payload['service_id'] = firstProc.procedure_id;
      }
      return this.data.inventorySvc.exit(payload);
    });

    forkJoin(exitCalls).subscribe({
      next: (results) => {
        if (!this.isExternalCenter || this.procedureRows.length === 0) {
          if (!this.isExternalCenter && results.length > 0) {
            const wh = this.data.warehouses.find(w => w.id === wId);
            const cc = this.costCenters().find(c => c.id === cv.cost_center_id);
            const expiry$ = forkJoin(results.map(r => r.data.batch_id
              ? this.data.inventorySvc.getBatchById(r.data.batch_id).pipe(map(b => b.data.expiration_date), catchError(() => of(null)))
              : of(null)));
            expiry$.subscribe(expirations => {
              this.pdfSvc.generateAndPrint({
                movement_type:    'exit',
                doc_id:           results[0].data.id,
                date:             results[0].data.created_at,
                user_name:        results[0].data.user_name,
                warehouse_name:   wh?.name ?? `Almacén ${wId}`,
                cost_center_name: cc?.name ?? null,
                reason:           cv.reason || null,
                lines: results.map((r, i) => ({
                  product_name:    r.data.product_name,
                  lot_number:      r.data.batch_lot_number,
                  expiration_date: expirations[i],
                  quantity:        r.data.quantity,
                })),
              });
              this.saving.set(false);
              this.ref.close({ ok: true });
            });
            return;
          }
          this.saving.set(false);
          this.ref.close({ ok: true });
          return;
        }

        // Crear registros de procedimientos del paciente
        const serviceDate = this._toApiDate(cv.service_date!);
        const recordCalls = this.procedureRows.controls.map(ctrl => {
          const rv = (ctrl as FormGroup).value;
          return this.medSvc.createPatientProcedureRecord({
            medical_service_id:  rv.procedure_id,
            patient_external_id: cv.patient_external_id!,
            patient_document:    cv.patient_document!,
            patient_first_name:  cv.patient_first_name!,
            patient_last_name:   cv.patient_last_name!,
            quantity:            rv.quantity,
            unit_price:          rv.unit_price,
            service_date:        serviceDate,
            notes:               rv.notes || undefined,
          });
        });

        forkJoin(recordCalls).subscribe({
          next: () => { this.saving.set(false); this.ref.close({ ok: true, withRecords: true }); },
          error: err => {
            this.saving.set(false);
            this.errors.set([
              'Las salidas de inventario se registraron correctamente, pero ocurrió un error al guardar los registros de procedimientos del paciente: ' +
              (err.error?.message || 'Error desconocido'),
            ]);
          },
        });
      },
      error: err => {
        this.saving.set(false);
        if (err.status === 422)
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        else if (err.status === 409)
          this.errors.set([err.error?.message || 'Error de stock o negocio']);
        else
          this.errors.set([err.error?.message || 'Error al registrar la salida']);
      },
    });
  }

  private _toApiDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

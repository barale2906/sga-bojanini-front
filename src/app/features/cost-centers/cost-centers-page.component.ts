import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CostCenterService, CostCenter } from './cost-center.service';
import {
  MedicalServicesService,
  MedicalService,
  MedicalServiceNode,
  PatientProcedureRecord,
} from '../inventory/medical-services.service';
import { PaginationMeta } from '../../core/models/api-response.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { CostCenterFormDialogComponent } from './cost-center-form-dialog.component';
import { ProcedurePricesDialogComponent } from './procedures/procedure-prices-dialog.component';
import { PatientProcedureRecordFormDialogComponent } from './patient-procedure-records/patient-procedure-record-form-dialog.component';
import { MedicalServiceFormDialogComponent } from './medical-services/medical-service-form-dialog.component';
import { MedicalServiceImportDialogComponent } from './medical-services/medical-service-import-dialog.component';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../shared/adapters/es-date.adapter';

@Component({
  selector: 'app-cost-centers-page',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    CommonModule, ReactiveFormsModule, MatTabsModule, MatTableModule, MatPaginatorModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatTooltipModule, MatDatepickerModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective,
  ],
  templateUrl: './cost-centers-page.component.html',
  styleUrl: './cost-centers-page.component.scss',
})
export class CostCentersPageComponent implements OnInit {
  private svc = inject(CostCenterService);
  private medSvc = inject(MedicalServicesService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  // ── Tab 1: Centros de costo ──────────────────────────────────
  costCenters = signal<CostCenter[]>([]);
  loading = signal(false);

  cols = ['actions', 'code', 'name', 'type', 'description', 'is_active'];

  filters = this.fb.group({ search: [''], type: [''], is_active: [''] });

  // ── Tab 2: Servicios y procedimientos médicos ────────────────
  services = signal<MedicalService[]>([]);
  medicalServices = signal<MedicalService[]>([]);
  loadingMedicalServices = signal(false);

  msCols = ['actions', 'type', 'code', 'name', 'parent', 'description', 'is_active'];

  msFilters = this.fb.group({ type: [''], parent_id: [null as number | null], search: [''], is_active: [''] });

  // ── Tab 3: Registros de procedimientos ───────────────────────
  records = signal<PatientProcedureRecord[]>([]);
  recordsMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 10, total: 0 });
  loadingRecords = signal(false);
  procedureOptions = signal<MedicalServiceNode[]>([]);

  recordCols = ['actions', 'procedure', 'patient', 'quantity', 'unit_price', 'total', 'service_date', 'is_active'];

  recordFilters = this.fb.group({
    patient_document: [''],
    medical_service_id: [null as number | null],
    service_date_from: [null as Date | null],
    service_date_to: [null as Date | null],
    is_active: [''],
  });

  ngOnInit(): void {
    this.load();
    this.filters.get('search')!.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.load());
    this.filters.get('type')!.valueChanges.subscribe(() => this.load());
    this.filters.get('is_active')!.valueChanges.subscribe(() => this.load());

    this.loadServices();
    this.loadMedicalServices();
    this.msFilters.get('search')!.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.loadMedicalServices());
    this.msFilters.get('type')!.valueChanges.subscribe(() => this.loadMedicalServices());
    this.msFilters.get('parent_id')!.valueChanges.subscribe(() => this.loadMedicalServices());
    this.msFilters.get('is_active')!.valueChanges.subscribe(() => this.loadMedicalServices());

    this.loadProcedureOptions();
    this.loadRecords();
    this.recordFilters.valueChanges.pipe(debounceTime(300)).subscribe(() => this.loadRecords(1));
  }

  // ── Centros de costo ──────────────────────────────────────────
  load(): void {
    this.loading.set(true);
    const { search, type, is_active } = this.filters.value;
    this.svc.getCostCenters({
      search: search || undefined,
      type: (type || undefined) as 'internal' | 'external' | undefined,
      is_active: is_active === '' ? undefined : is_active === 'true',
    }).subscribe({
      next: r => { this.costCenters.set(r.data ?? []); this.loading.set(false); },
      error: err => {
        this.loading.set(false);
        this.snack.open(err.error?.message || 'Error al cargar los centros de costo', 'OK', { duration: 4000 });
      },
    });
  }

  openForm(cc?: CostCenter): void {
    this.dialog.open(CostCenterFormDialogComponent, { data: cc ?? null, width: '480px' })
      .afterClosed().subscribe(saved => {
        if (saved) {
          this.snack.open(cc ? 'Centro de costo actualizado' : 'Centro de costo creado', 'OK', { duration: 3000 });
          this.load();
        }
      });
  }

  delete(cc: CostCenter): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar centro de costo',
        message: `¿Eliminar "${cc.name}"? Esta acción no se puede deshacer.`,
        confirmColor: 'warn',
        confirmText: 'Eliminar',
      },
      width: '460px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.deleteCostCenter(cc.id).subscribe({
        next: () => { this.snack.open('Centro de costo eliminado', 'OK', { duration: 3000 }); this.load(); },
        error: err => {
          if (err.status === 409 && cc.is_active) {
            const ref = this.snack.open(
              err.error?.message || 'No se puede eliminar: tiene movimientos asociados.',
              'Desactivar',
              { duration: 8000 },
            );
            ref.onAction().subscribe(() => this.toggleActive(cc, false));
          } else {
            this.snack.open(err.error?.message || 'Error al eliminar', 'OK', { duration: 4000 });
          }
        },
      });
    });
  }

  toggleActive(cc: CostCenter, active: boolean): void {
    this.svc.updateCostCenter(cc.id, {
      code: cc.code,
      name: cc.name,
      type: cc.type,
      description: cc.description,
      is_active: active,
    }).subscribe({
      next: () => {
        this.snack.open(active ? 'Centro de costo activado' : 'Centro de costo desactivado', 'OK', { duration: 3000 });
        this.load();
      },
      error: err => this.snack.open(err.error?.message || 'Error al actualizar', 'OK', { duration: 4000 }),
    });
  }

  // ── Tarifas de procedimientos ───────────────────────────────────
  loadServices(): void {
    this.medSvc.getMedicalServices({ type: 'service' }).subscribe({
      next: r => this.services.set(r.data ?? []),
      error: () => {},
    });
  }

  serviceName(parentId: number | null): string {
    if (!parentId) return '—';
    return this.services().find(s => s.id === parentId)?.name ?? '—';
  }

  openPrices(proc: MedicalService): void {
    this.dialog.open(ProcedurePricesDialogComponent, {
      data: { procedureId: proc.id, procedureName: proc.name, procedureCode: proc.code },
      width: '700px',
    });
  }

  // ── Registros de procedimientos ─────────────────────────────────
  loadProcedureOptions(): void {
    this.medSvc.getTree(true).subscribe({
      next: r => {
        const procs: MedicalServiceNode[] = [];
        (r.data ?? []).forEach(svc => (svc.children ?? []).forEach(p => procs.push(p)));
        this.procedureOptions.set(procs);
      },
      error: () => {},
    });
  }

  loadRecords(page = 1): void {
    this.loadingRecords.set(true);
    const { patient_document, medical_service_id, service_date_from, service_date_to, is_active } = this.recordFilters.value;
    this.medSvc.getPatientProcedureRecords({
      patient_document: patient_document || undefined,
      medical_service_id: medical_service_id ?? undefined,
      service_date_from: service_date_from ? this._toApiDate(service_date_from) : undefined,
      service_date_to: service_date_to ? this._toApiDate(service_date_to) : undefined,
      is_active: is_active === '' ? undefined : is_active === 'true',
      page,
      per_page: this.recordsMeta().per_page,
    }).subscribe({
      next: (r: any) => {
        this.records.set(r.data ?? []);
        this.recordsMeta.set(r.meta ?? {
          current_page: r.current_page ?? 1,
          last_page: r.last_page ?? 1,
          per_page: r.per_page ?? this.recordsMeta().per_page,
          total: r.total ?? 0,
        });
        this.loadingRecords.set(false);
      },
      error: err => {
        this.loadingRecords.set(false);
        this.snack.open(err.error?.message || 'Error al cargar los registros', 'OK', { duration: 4000 });
      },
    });
  }

  onRecordsPage(e: PageEvent): void {
    this.recordsMeta.update(m => ({ ...m, per_page: e.pageSize }));
    this.loadRecords(e.pageIndex + 1);
  }

  openRecordForm(record?: PatientProcedureRecord): void {
    this.dialog.open(PatientProcedureRecordFormDialogComponent, {
      data: { record: record ?? null },
      width: '640px',
    }).afterClosed().subscribe(saved => {
      if (saved) {
        this.snack.open(record ? 'Registro actualizado' : 'Registro creado', 'OK', { duration: 3000 });
        this.loadRecords(record ? this.recordsMeta().current_page : 1);
      }
    });
  }

  deleteRecord(record: PatientProcedureRecord): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar registro',
        message: `¿Eliminar el registro del paciente ${record.patient_document}? Esta acción no se puede deshacer.`,
        confirmColor: 'warn',
        confirmText: 'Eliminar',
      },
      width: '460px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.medSvc.deletePatientProcedureRecord(record.id).subscribe({
        next: () => {
          this.snack.open('Registro eliminado', 'OK', { duration: 3000 });
          this.loadRecords(this.recordsMeta().current_page);
        },
        error: err => this.snack.open(err.error?.message || 'Error al eliminar el registro', 'OK', { duration: 4000 }),
      });
    });
  }

  // ── Servicios médicos ───────────────────────────────────────────
  loadMedicalServices(): void {
    this.loadingMedicalServices.set(true);
    const { type, parent_id, search, is_active } = this.msFilters.value;
    this.medSvc.getMedicalServices({
      type: (type || undefined) as 'service' | 'procedure' | undefined,
      parent_id: parent_id ?? undefined,
      search: search || undefined,
      is_active: is_active === '' ? undefined : is_active === 'true',
    }).subscribe({
      next: r => { this.medicalServices.set(r.data ?? []); this.loadingMedicalServices.set(false); },
      error: err => {
        this.loadingMedicalServices.set(false);
        this.snack.open(err.error?.message || 'Error al cargar los servicios médicos', 'OK', { duration: 4000 });
      },
    });
  }

  openMedicalServiceForm(ms?: MedicalService, defaultType: 'service' | 'procedure' = 'service'): void {
    this.dialog.open(MedicalServiceFormDialogComponent, {
      data: { service: ms ?? null, services: this.services(), defaultType },
      width: '520px',
    }).afterClosed().subscribe(saved => {
      if (saved) {
        this.snack.open(ms ? 'Registro actualizado' : 'Registro creado', 'OK', { duration: 3000 });
        this._reloadMedicalServiceData();
      }
    });
  }

  deleteMedicalService(ms: MedicalService): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: `Eliminar ${ms.type_label.toLowerCase()}`,
        message: `¿Eliminar "${ms.name}"? Esta acción no se puede deshacer.`,
        confirmColor: 'warn',
        confirmText: 'Eliminar',
      },
      width: '460px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.medSvc.deleteMedicalService(ms.id).subscribe({
        next: () => {
          this.snack.open(`${ms.type_label} eliminado`, 'OK', { duration: 3000 });
          this._reloadMedicalServiceData();
        },
        error: err => this.snack.open(err.error?.message || 'Error al eliminar', 'OK', { duration: 4000 }),
      });
    });
  }

  openMedicalServiceImport(): void {
    this.dialog.open(MedicalServiceImportDialogComponent, { width: '560px' })
      .afterClosed().subscribe(imported => {
        if (imported) this._reloadMedicalServiceData();
      });
  }

  private _reloadMedicalServiceData(): void {
    this.loadMedicalServices();
    this.loadServices();
    this.loadProcedureOptions();
  }

  private _toApiDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

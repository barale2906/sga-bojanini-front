import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime } from 'rxjs';
import { Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import {
  MedicalServicesService,
  PatientProcedureRecord,
  MedicalServiceNode,
} from '../medical-services.service';
import { AuthService } from '../../../core/services/auth.service';
import { PaginationMeta } from '../../../core/models/api-response.model';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';

@Component({
  selector: 'app-patient-records-page',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatChipsModule, MatTooltipModule, MatDatepickerModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective,
  ],
  templateUrl: './patient-records-page.component.html',
  styleUrl: './patient-records-page.component.scss',
})
export class PatientRecordsPageComponent implements OnInit {
  private svc    = inject(MedicalServicesService);
  private auth   = inject(AuthService);
  private dialog = inject(MatDialog);
  private snack  = inject(MatSnackBar);
  private router = inject(Router);
  private fb     = inject(FormBuilder);

  records     = signal<PatientProcedureRecord[]>([]);
  meta        = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  loading     = signal(false);
  procedures  = signal<MedicalServiceNode[]>([]);

  cols = ['procedure', 'patient', 'quantity', 'unit_price', 'total', 'service_date', 'actions'];

  filters = this.fb.group({
    patient_document:    [''],
    patient_external_id: [''],
    medical_service_id:  [null as number | null],
    service_date_from:   [null as Date | null],
    service_date_to:     [null as Date | null],
  });

  get canEdit(): boolean {
    return this.auth.hasAnyPermission(['registros_procedimientos.editar', 'registros_procedimientos.eliminar']);
  }

  ngOnInit(): void {
    this.loadRecords();
    this._loadProcedures();
    this.filters.valueChanges.pipe(debounceTime(300)).subscribe(() => this.loadRecords(1));
  }

  loadRecords(page = 1): void {
    const { patient_document, patient_external_id, medical_service_id, service_date_from, service_date_to } = this.filters.value;
    this.loading.set(true);
    this.svc.getPatientProcedureRecords({
      patient_document:    patient_document    || undefined,
      patient_external_id: patient_external_id || undefined,
      medical_service_id:  medical_service_id  ?? undefined,
      service_date_from:   service_date_from   ? this._toApiDate(service_date_from) : undefined,
      service_date_to:     service_date_to     ? this._toApiDate(service_date_to)   : undefined,
      page,
      per_page: this.meta().per_page,
    }).subscribe({
      next: (r: any) => {
        this.records.set(r.data ?? []);
        // El API puede devolver paginación en r.meta (formato envuelto) o en raíz (Laravel estándar)
        this.meta.set(r.meta ?? {
          current_page: r.current_page ?? 1,
          last_page:    r.last_page    ?? 1,
          per_page:     r.per_page     ?? this.meta().per_page,
          total:        r.total        ?? 0,
        });
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.snack.open(err?.error?.message || 'Error al cargar los registros', 'OK', { duration: 4000 });
      },
    });
  }

  private _loadProcedures(): void {
    this.svc.getTree(true).subscribe({
      next: r => {
        const procs: MedicalServiceNode[] = [];
        (r.data ?? []).forEach((svc: MedicalServiceNode) => (svc.children ?? []).forEach(p => procs.push(p)));
        this.procedures.set(procs);
      },
      error: () => {
        this.snack.open('No se pudo cargar el catálogo de procedimientos', 'OK', { duration: 4000 });
      },
    });
  }

  delete(record: PatientProcedureRecord): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar registro',
        message: `¿Eliminar el registro del procedimiento "${record.procedure_name}" del paciente ${record.patient_document}? Esta acción no se puede deshacer.`,
        confirmColor: 'warn',
        confirmText: 'Eliminar',
      },
      width: '460px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.deletePatientProcedureRecord(record.id).subscribe({
        next: () => {
          this.snack.open('Registro eliminado', 'OK', { duration: 3000 });
          this.loadRecords();
        },
        error: err => {
          this.snack.open(err.error?.message || 'No se pudo eliminar el registro', 'OK', { duration: 4000 });
        },
      });
    });
  }

  clearFilters(): void {
    this.filters.reset({ patient_document: '', patient_external_id: '', medical_service_id: null, service_date_from: null, service_date_to: null });
  }

  onPage(e: PageEvent): void {
    this.meta.update(m => ({ ...m, per_page: e.pageSize }));
    this.loadRecords(e.pageIndex + 1);
  }

  get pageTotal(): number {
    return this.records().reduce((sum, r) => sum + r.total, 0);
  }

  goBack(): void { this.router.navigate(['/inventory']); }

  private _toApiDate(date: Date): string {
    return date.toISOString().substring(0, 10);
  }
}

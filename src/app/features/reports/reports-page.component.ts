import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { PaginationMeta } from '../../core/models/api-response.model';
import { ReportExport, ReportFilters, ReportFormat, ReportsService, ReportType } from './reports.service';
import { WarehouseService, Warehouse } from '../warehouse/warehouse.service';
import { CatalogService, Category } from '../catalog/catalog.service';
import { MonitoringService, Sensor } from '../monitoring/monitoring.service';
import { UserService } from '../auth/users/user.service';
import { User } from '../../core/models/user.model';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../shared/adapters/es-date.adapter';

type FilterFieldType = 'date' | 'number' | 'text' | 'select-warehouse' | 'select-category' | 'select-sensor' | 'select-user' | 'select-action' | 'select-status';

interface ReportFilterField {
  field: string;
  type: FilterFieldType;
  label: string;
}

interface ReportTypeDef {
  id: ReportType;
  name: string;
  icon: string;
  description: string;
  filters: ReportFilterField[];
}

const REPORT_TYPES: ReportTypeDef[] = [
  { id: 'inventory', name: 'Inventario', icon: 'inventory_2', description: 'Estado actual del inventario por almacén y categoría', filters: [
    { field: 'warehouse_id', type: 'select-warehouse', label: 'Almacén' },
    { field: 'category_id', type: 'select-category', label: 'Categoría' },
  ] },
  { id: 'movements', name: 'Movimientos', icon: 'swap_vert', description: 'Historial de movimientos en un rango de fechas', filters: [
    { field: 'warehouse_id', type: 'select-warehouse', label: 'Almacén' },
    { field: 'date_from', type: 'date', label: 'Desde' },
    { field: 'date_to', type: 'date', label: 'Hasta' },
  ] },
  { id: 'expiring', name: 'Lotes por Vencer', icon: 'schedule', description: 'Lotes que vencen en los próximos N días', filters: [
    { field: 'warehouse_id', type: 'select-warehouse', label: 'Almacén' },
    { field: 'days', type: 'number', label: 'Días' },
  ] },
  { id: 'purchases', name: 'Compras', icon: 'shopping_cart', description: 'Órdenes de compra en un período', filters: [
    { field: 'warehouse_id', type: 'select-warehouse', label: 'Almacén' },
    { field: 'status', type: 'select-status', label: 'Estado' },
    { field: 'date_from', type: 'date', label: 'Desde' },
    { field: 'date_to', type: 'date', label: 'Hasta' },
  ] },
  { id: 'consumption', name: 'Consumos', icon: 'medication', description: 'Uso de materiales en procedimientos médicos', filters: [
    { field: 'warehouse_id', type: 'select-warehouse', label: 'Almacén' },
    { field: 'category_id', type: 'select-category', label: 'Categoría' },
    { field: 'date_from', type: 'date', label: 'Desde' },
    { field: 'date_to', type: 'date', label: 'Hasta' },
  ] },
  { id: 'conditions', name: 'Condiciones Ambientales', icon: 'thermostat', description: 'Historial de lecturas de sensores y alertas', filters: [
    { field: 'sensor_id', type: 'select-sensor', label: 'Sensor' },
    { field: 'date_from', type: 'date', label: 'Desde' },
    { field: 'date_to', type: 'date', label: 'Hasta' },
  ] },
  { id: 'audit', name: 'Auditoría', icon: 'history', description: 'Registro de acciones del sistema', filters: [
    { field: 'user_id', type: 'select-user', label: 'Usuario' },
    { field: 'action', type: 'select-action', label: 'Acción' },
    { field: 'date_from', type: 'date', label: 'Desde' },
    { field: 'date_to', type: 'date', label: 'Hasta' },
  ] },
];

const PURCHASE_STATUSES = [
  { value: 'draft', label: 'Borrador' },
  { value: 'pending_approval', label: 'Pendiente aprobación' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'sent', label: 'Enviada' },
  { value: 'partially_received', label: 'Recibida parcial' },
  { value: 'received', label: 'Recibida' },
  { value: 'rejected', label: 'Rechazada' },
  { value: 'cancelled', label: 'Cancelada' },
];

const AUDIT_ACTIONS = [
  { value: 'create', label: 'Crear' },
  { value: 'update', label: 'Actualizar' },
  { value: 'delete', label: 'Eliminar' },
  { value: 'access', label: 'Acceso' },
];

const PENDING_STATUSES = ['queued', 'processing'];
const EXPORTS_POLL_MS = 5000;

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatCardModule, MatProgressSpinnerModule, MatTabsModule, MatTableModule,
    MatPaginatorModule, MatTooltipModule, MatDatepickerModule, PageHeaderComponent, PermissionDirective,
    LoadingSpinnerComponent, DateFormatPipe,
  ],
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss',
})
export class ReportsPageComponent implements OnInit, OnDestroy {
  private reportsSvc = inject(ReportsService);
  private warehouseSvc = inject(WarehouseService);
  private catalogSvc = inject(CatalogService);
  private monitoringSvc = inject(MonitoringService);
  private userSvc = inject(UserService);
  private snack = inject(MatSnackBar);

  reportTypes = REPORT_TYPES;
  purchaseStatuses = PURCHASE_STATUSES;
  auditActions = AUDIT_ACTIONS;

  selectedReport = signal<ReportTypeDef | null>(null);
  generating = signal(false);
  filterValues: Record<string, string | Date | null> = {};

  warehouses = signal<Warehouse[]>([]);
  categories = signal<Category[]>([]);
  sensors = signal<Sensor[]>([]);
  users = signal<User[]>([]);

  exports = signal<ReportExport[]>([]);
  exportsMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  exportsLoading = signal(false);
  exportCols = ['type', 'format', 'status', 'file_size', 'expires_at', 'actions'];

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.warehouseSvc.getWarehouses({ is_active: 'true' }).subscribe({ next: (res) => this.warehouses.set(res.data) });
    this.catalogSvc.getCategories({ is_active: 'true' }).subscribe({ next: (res) => this.categories.set(res.data) });
    this.monitoringSvc.getSensors({ is_active: 'true' }).subscribe({ next: (res) => this.sensors.set(res.data) });
    this.userSvc.getAll({ is_active: true, per_page: 100 }).subscribe({ next: (res) => this.users.set(res.data) });
    this.loadExports();
    this.pollHandle = setInterval(() => this.pollPendingExports(), EXPORTS_POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
  }

  selectReport(rt: ReportTypeDef): void {
    this.selectedReport.set(rt);
    this.filterValues = {};
    rt.filters.forEach((f) => (this.filterValues[f.field] = f.type === 'date' ? null : ''));
  }

  generate(format: ReportFormat): void {
    const rt = this.selectedReport();
    if (!rt || this.generating()) return;
    this.generating.set(true);

    const filters: ReportFilters = { format };
    Object.entries(this.filterValues).forEach(([k, v]) => {
      if (v instanceof Date) filters[k] = this.toApiDate(v);
      else if (v) filters[k] = v;
    });

    this.reportsSvc.generate(rt.id, filters).subscribe({
      next: (result) => {
        this.generating.set(false);
        if (result.mode === 'sync') {
          this.snack.open('Reporte descargado correctamente', 'OK', { duration: 4000 });
        } else {
          this.snack.open(
            result.message || 'El reporte es muy extenso, se está generando en segundo plano. Te notificaremos cuando esté listo.',
            'Cerrar',
            { duration: 8000 },
          );
          this.loadExports(1);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.generating.set(false);
        this.snack.open(this.extractErrorMessage(err, 'No se pudo generar el reporte'), 'Cerrar', { duration: 6000 });
      },
    });
  }

  loadExports(page = 1): void {
    this.exportsLoading.set(true);
    this.reportsSvc.listExports(page, this.exportsMeta().per_page).subscribe({
      next: (res) => {
        this.exports.set(res.data);
        this.exportsMeta.set(res.meta);
        this.exportsLoading.set(false);
      },
      error: () => this.exportsLoading.set(false),
    });
  }

  onExportsPage(e: PageEvent): void {
    this.exportsMeta.update((m) => ({ ...m, per_page: e.pageSize }));
    this.loadExports(e.pageIndex + 1);
  }

  download(item: ReportExport): void {
    this.reportsSvc.downloadExport(item.id).subscribe({
      error: (err: HttpErrorResponse) => {
        const msg =
          err.status === 409 ? 'El reporte aún no está listo, intenta en unos segundos.' :
          err.status === 410 ? 'El reporte expiró, debes generarlo de nuevo.' :
          err.status === 404 ? 'El reporte no existe o no te pertenece.' :
          this.extractErrorMessage(err, 'No se pudo descargar el reporte');
        this.snack.open(msg, 'Cerrar', { duration: 6000 });
        if (err.status === 410) this.loadExports(this.exportsMeta().current_page);
      },
    });
  }

  getStatusLabel(status: string): string {
    const m: Record<string, string> = { queued: 'En cola', processing: 'Procesando', ready: 'Listo', failed: 'Falló', expired: 'Expirado' };
    return m[status] || status;
  }

  getStatusClass(status: string): string {
    return `st-${status}`;
  }

  private pollPendingExports(): void {
    const pending = this.exports().filter((e) => PENDING_STATUSES.includes(e.status));
    pending.forEach((item) => {
      this.reportsSvc.getExport(item.id).subscribe({
        next: (res) => {
          this.exports.update((list) => list.map((e) => (e.id === item.id ? res.data : e)));
        },
        error: () => {},
      });
    });
  }

  private toApiDate(date: Date): string {
    return date.toISOString().substring(0, 10);
  }

  private extractErrorMessage(err: HttpErrorResponse, fallback: string): string {
    const body = err.error as { message?: string; errors?: Record<string, string[]> } | undefined;
    if (body?.errors) {
      const firstError = Object.values(body.errors)[0]?.[0];
      if (firstError) return firstError;
    }
    return body?.message || fallback;
  }
}

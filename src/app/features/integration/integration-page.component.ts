import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { PaginationMeta } from '../../core/models/api-response.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { WarehouseService } from '../warehouse/warehouse.service';
import { CatalogService, Product } from '../catalog/catalog.service';
import { ProductSearchComponent } from '../../shared/components/product-search/product-search.component';

@Component({
  selector: 'app-integration-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTabsModule, MatTableModule, MatPaginatorModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatSlideToggleModule, MatTooltipModule, PageHeaderComponent, LoadingSpinnerComponent,
    PermissionDirective, DateFormatPipe, ProductSearchComponent,
  ],
  templateUrl: './integration-page.component.html',
  styleUrl: './integration-page.component.scss',
})
export class IntegrationPageComponent implements OnInit {
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private wSvc = inject(WarehouseService);
  private cSvc = inject(CatalogService);
  private api = environment.apiUrl;

  integrations = signal<any[]>([]);
  appointments = signal<any[]>([]);
  demandData = signal<any>(null);
  consumptions = signal<any[]>([]);
  consumptionMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  warehouses = signal<any[]>([]);
  products = signal<any[]>([]);
  loading = signal(false);
  testResult = signal<string | null>(null);

  intCols = ['actions', 'name', 'type', 'base_url', 'is_active'];
  apptCols = ['appointment_id', 'patient_name', 'service_type', 'scheduled_at', 'status'];
  consCols = ['actions', 'appointment_id', 'service_type', 'warehouse', 'sync_status', 'created_at'];

  intForm = this.fb.group({
    name: ['', Validators.required], type: ['scheduling', Validators.required],
    base_url: ['', Validators.required], auth_type: ['bearer', Validators.required],
    token: [''], is_active: [true],
  });

  consumptionForm = this.fb.group({
    appointment_id: [''], patient_identifier: [''], service_type: [''],
    warehouse_id: [null as number | null, Validators.required],
    items: this.fb.array([]),
  });

  get consItems() { return this.consumptionForm.get('items') as any; }

  daysAhead = signal(7);
  dateFrom = signal(this.localDate());
  dateTo = signal(this.localDate(new Date(Date.now() + 7 * 86400000)));

  ngOnInit(): void {
    this.loadIntegrations(); this.loadAppointments(); this.loadDemand(); this.loadConsumptions();
    this.wSvc.getWarehouses().subscribe({ next: r => this.warehouses.set(r.data ?? []), error: () => {} });
    this.cSvc.getProducts({ per_page: 200 }).subscribe({ next: r => this.products.set(r.data ?? []), error: () => {} });
  }

  loadIntegrations(): void {
    this.http.get<any>(`${this.api}/integrations`).subscribe({ next: r => this.integrations.set(Array.isArray(r.data) ? r.data : []), error: () => {} });
  }

  saveIntegration(): void {
    if (this.intForm.invalid) return;
    const v = this.intForm.value;
    const payload: any = { name: v.name, type: v.type, base_url: v.base_url, auth_type: v.auth_type, is_active: v.is_active, credentials: { token: v.token } };
    this.http.post<any>(`${this.api}/integrations`, payload).subscribe({
      next: () => { this.snack.open('Integración guardada', 'OK', { duration: 3000 }); this.intForm.reset({ type: 'scheduling', auth_type: 'bearer', is_active: true }); this.loadIntegrations(); },
      error: () => {},
    });
  }

  testIntegration(id: number): void {
    this.testResult.set(null);
    this.http.post<any>(`${this.api}/integrations/${id}/test`, {}).subscribe({
      next: r => this.testResult.set('✅ ' + r.data?.message),
      error: err => this.testResult.set('❌ ' + (err.error?.message || 'Error de conexión')),
    });
  }

  loadAppointments(): void {
    const p = new HttpParams().set('date_from', this.dateFrom()).set('date_to', this.dateTo());
    this.http.get<any>(`${this.api}/scheduling/appointments`, { params: p }).subscribe({ next: r => this.appointments.set(Array.isArray(r.data) ? r.data : []), error: () => {} });
  }

  loadDemand(): void {
    const p = new HttpParams().set('days_ahead', String(this.daysAhead()));
    this.http.get<any>(`${this.api}/scheduling/demand-analysis`, { params: p }).subscribe({ next: r => this.demandData.set(r.data), error: () => {} });
  }

  loadConsumptions(page = 1): void {
    const p = new HttpParams().set('per_page', '25').set('page', String(page));
    this.http.get<any>(`${this.api}/consumptions`, { params: p }).subscribe({
      next: r => { this.consumptions.set(Array.isArray(r.data) ? r.data : []); this.consumptionMeta.set(r.meta || this.consumptionMeta()); },
      error: () => {},
    });
  }

  consItemSelectedProducts = signal<(Product | null)[]>([]);

  onConsItemProductSelected(i: number, product: Product | null): void {
    this.consItemSelectedProducts.update(arr => { const a = [...arr]; a[i] = product; return a; });
    this.consItems.at(i).patchValue({ generic_product_id: product?.id ?? null });
  }

  addConsItem(): void {
    this.consItems.push(this.fb.group({ generic_product_id: [null, Validators.required], quantity: [1, [Validators.required, Validators.min(1)]] }));
    this.consItemSelectedProducts.update(arr => [...arr, null]);
  }

  removeConsItem(i: number): void {
    if (this.consItems.length > 0) {
      this.consItems.removeAt(i);
      this.consItemSelectedProducts.update(arr => arr.filter((_, idx) => idx !== i));
    }
  }

  saveConsumption(): void {
    if (this.consumptionForm.invalid) return;
    const v = this.consumptionForm.value;
    this.http.post<any>(`${this.api}/consumptions`, { ...v }).subscribe({
      next: () => { this.snack.open('Consumo registrado', 'OK', { duration: 3000 }); this.consumptionForm.reset(); this.loadConsumptions(); },
      error: () => {},
    });
  }

  retrySync(id: number): void {
    this.http.post<any>(`${this.api}/consumptions/${id}/retry-sync`, {}).subscribe({
      next: () => { this.snack.open('Reintento programado', 'OK', { duration: 3000 }); this.loadConsumptions(); },
      error: err => this.snack.open(err.error?.message || 'Error', 'Cerrar', { duration: 4000 }),
    });
  }

  onConsPage(e: PageEvent): void { this.loadConsumptions(e.pageIndex + 1); }

  /** Fecha LOCAL en YYYY-MM-DD (no UTC) para evitar desfase de timezone */
  private localDate(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}

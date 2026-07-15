import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { AuthService } from '../../core/services/auth.service';
import { InventoryService } from '../inventory/inventory.service';
import { WarehouseService, Warehouse } from '../warehouse/warehouse.service';
import { CatalogService, Product } from '../catalog/catalog.service';
import { ExitWizardDialogComponent } from '../inventory/movements/exit-wizard-dialog.component';
import { SaleDialogComponent } from '../sales/sale-dialog.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';

interface DashboardInventory {
  total_products: number;
  total_units: number;
  stock_ok_count: number;
  stock_low_count: number;
  stock_critical_count: number;
  expiring_7_days: number;
  expiring_30_days: number;
  movements_today: number;
  top_consumed_products: { id: number; name: string; code: string; total_consumed: number }[];
}

interface DashboardPurchasing {
  pending_orders: number;
  approved_orders: number;
  total_month: number;
}

interface DashboardConditions {
  active_sensors: number;
  alerts_today: number;
  readings_today: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    PermissionDirective,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private wSvc = inject(WarehouseService);
  private cSvc = inject(CatalogService);
  private invSvc = inject(InventoryService);
  auth = inject(AuthService);

  loading = signal(true);
  inventory = signal<DashboardInventory | null>(null);
  purchasing = signal<DashboardPurchasing | null>(null);
  conditions = signal<DashboardConditions | null>(null);

  private warehouses = signal<Warehouse[]>([]);
  private products = signal<Product[]>([]);

  private api = environment.apiUrl;

  ngOnInit(): void {
    this.loadDashboard();
    if (this.auth.hasPermission('movimientos.salida')) {
      forkJoin([
        this.wSvc.getWarehouses(),
        this.cSvc.getProducts({ per_page: 200 }),
      ]).subscribe({
        next: ([wRes, pRes]) => {
          this.warehouses.set(wRes.data);
          this.products.set(pRes.data);
        },
        error: () => {},
      });
    }
  }

  loadDashboard(): void {
    this.loading.set(true);
    let pending = 0;

    if (this.auth.hasPermission('tablero.ver')) {
      pending = 3;

      this.http.get<ApiResponse<DashboardInventory>>(`${this.api}/dashboard/inventory`).subscribe({
        next: (res) => { this.inventory.set(res.data); this.checkDone(--pending); },
        error: () => this.checkDone(--pending),
      });

      this.http.get<ApiResponse<DashboardPurchasing>>(`${this.api}/dashboard/purchasing`).subscribe({
        next: (res) => { this.purchasing.set(res.data); this.checkDone(--pending); },
        error: () => this.checkDone(--pending),
      });

      this.http.get<ApiResponse<DashboardConditions>>(`${this.api}/dashboard/monitoring`).subscribe({
        next: (res) => { this.conditions.set(res.data); this.checkDone(--pending); },
        error: () => this.checkDone(--pending),
      });
    } else {
      this.loading.set(false);
    }
  }

  private checkDone(remaining: number): void {
    if (remaining === 0) this.loading.set(false);
  }

  getTodayDate(): string {
    return new Date().toLocaleDateString('es-CO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }

  openSaleDialog(): void {
    this.dialog.open(SaleDialogComponent, {
      width: '95vw', maxWidth: '800px', maxHeight: '93vh',
    }).afterClosed().subscribe(result => {
      if (result?.ok) {
        this.snack.open('Venta registrada exitosamente', 'OK', { duration: 4000 });
      }
    });
  }

  openExitWizard(): void {
    this.dialog.open(ExitWizardDialogComponent, {
      data: { warehouses: this.warehouses(), products: this.products(), inventorySvc: this.invSvc },
      width: '95vw', maxWidth: '1020px', height: '93vh', maxHeight: '93vh',
    }).afterClosed().subscribe(result => {
      if (!result?.ok) return;
      this.loadDashboard();
      const msg = result.withRecords
        ? 'Salida registrada con procedimientos del paciente'
        : 'Salida de stock registrada';
      this.snack.open(msg, 'OK', { duration: 4000 });
    });
  }
}

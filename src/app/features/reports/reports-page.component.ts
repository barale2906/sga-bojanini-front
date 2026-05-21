import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { saveAs } from 'file-saver';

interface ReportType {
  id: string; name: string; icon: string; description: string;
  filters: { field: string; type: string; label: string; options?: { value: string; label: string }[] }[];
}

const REPORT_TYPES: ReportType[] = [
  { id: 'inventory', name: 'Inventario', icon: 'inventory_2', description: 'Estado actual del inventario por almacén y categoría', filters: [{ field: 'warehouse_id', type: 'text', label: 'ID Almacén' }] },
  { id: 'movements', name: 'Movimientos', icon: 'swap_vert', description: 'Historial de movimientos en un rango de fechas', filters: [{ field: 'date_from', type: 'date', label: 'Desde' }, { field: 'date_to', type: 'date', label: 'Hasta' }] },
  { id: 'expiring', name: 'Lotes por Vencer', icon: 'schedule', description: 'Lotes que vencen en los próximos N días', filters: [{ field: 'days', type: 'number', label: 'Días' }] },
  { id: 'purchases', name: 'Compras', icon: 'shopping_cart', description: 'Órdenes de compra en un período', filters: [{ field: 'date_from', type: 'date', label: 'Desde' }, { field: 'date_to', type: 'date', label: 'Hasta' }] },
  { id: 'consumption', name: 'Consumos', icon: 'medication', description: 'Uso de materiales en procedimientos médicos', filters: [{ field: 'date_from', type: 'date', label: 'Desde' }, { field: 'date_to', type: 'date', label: 'Hasta' }] },
  { id: 'conditions', name: 'Condiciones Ambientales', icon: 'thermostat', description: 'Historial de lecturas de sensores y alertas', filters: [{ field: 'sensor_id', type: 'text', label: 'ID Sensor' }, { field: 'date_from', type: 'date', label: 'Desde' }, { field: 'date_to', type: 'date', label: 'Hasta' }] },
  { id: 'audit', name: 'Auditoría', icon: 'history', description: 'Registro de acciones del sistema', filters: [{ field: 'date_from', type: 'date', label: 'Desde' }, { field: 'date_to', type: 'date', label: 'Hasta' }] },
];

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCardModule, MatProgressSpinnerModule, PageHeaderComponent, PermissionDirective],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss',
})
export class ReportsPageComponent {
  private http = inject(HttpClient);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private api = environment.apiUrl;

  reportTypes = REPORT_TYPES;
  selectedReport = signal<ReportType | null>(null);
  generating = signal(false);
  filterValues: Record<string, string> = {};

  selectReport(rt: ReportType): void {
    this.selectedReport.set(rt);
    this.filterValues = {};
    rt.filters.forEach(f => this.filterValues[f.field] = '');
  }

  generate(format: 'pdf' | 'excel' | 'csv'): void {
    const rt = this.selectedReport();
    if (!rt || this.generating()) return;
    this.generating.set(true);

    let p = new HttpParams().set('format', format);
    Object.entries(this.filterValues).forEach(([k, v]) => { if (v) p = p.set(k, v); });

    this.http.get<any>(`${this.api}/reports/${rt.id}`, { params: p }).subscribe({
      next: res => {
        this.generating.set(false);
        const filename = res.data?.filename || `${rt.id}_report.${format}`;
        if (res.data?.path) {
          this.http.get(`${this.api}/reports/download/${filename}`, { responseType: 'blob' }).subscribe({
            next: blob => saveAs(blob, filename),
            error: () => this.snack.open('Reporte generado. Descarga manual desde el servidor.', 'OK', { duration: 5000 }),
          });
        }
        this.snack.open('Reporte generado: ' + filename, 'OK', { duration: 4000 });
      },
      error: () => this.generating.set(false),
    });
  }
}

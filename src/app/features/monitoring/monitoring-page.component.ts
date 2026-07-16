import { Component, inject, signal, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MonitoringService, Sensor, SensorStats } from './monitoring.service';
import { WarehouseService, Warehouse, Zone } from '../warehouse/warehouse.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { SensorFormDialogComponent } from './dialogs/sensor-form-dialog.component';
import { ReadingFormDialogComponent } from './dialogs/reading-form-dialog.component';
import { SpcChartComponent } from './spc-chart/spc-chart.component';

@Component({
  selector: 'app-monitoring-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTabsModule, MatTableModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatTooltipModule, PageHeaderComponent, LoadingSpinnerComponent,
    PermissionDirective, DateFormatPipe, SpcChartComponent,
  ],
  templateUrl: './monitoring-page.component.html',
  styleUrl: './monitoring-page.component.scss',
})
export class MonitoringPageComponent implements OnInit {
  private svc = inject(MonitoringService);
  private wSvc = inject(WarehouseService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  sensors = signal<Sensor[]>([]);
  private allSensors = signal<Sensor[]>([]);
  zones = signal<Zone[]>([]);
  warehouses = signal<Warehouse[]>([]);
  selectedSensor = signal<Sensor | null>(null);
  stats = signal<SensorStats | null>(null);
  loading = signal(false);
  loadingStats = signal(false);
  activeTab = signal(0);

  sensorCols = ['actions', 'code', 'name', 'zone', 'type', 'is_active'];
  sensorFilters = this.fb.group({ zone_id: [''], type: [''] });

  chartDateForm = this.fb.group({
    date_from: [this.getDefaultDateFrom(), Validators.required],
    date_to: [this.getTodayDate(), Validators.required],
  });

  ngOnInit(): void {
    this.wSvc.getZones().subscribe({ next: r => this.zones.set(r.data ?? []), error: () => {} });
    this.wSvc.getWarehouses().subscribe({ next: r => this.warehouses.set(r.data ?? []), error: () => {} });
    this.loadSensors();
    this.sensorFilters.valueChanges.subscribe(() => this.applyFilters());
  }

  loadSensors(): void {
    this.svc.getSensors().subscribe({
      next: r => { this.allSensors.set(r.data ?? []); this.applyFilters(); },
      error: () => {},
    });
  }

  applyFilters(): void {
    const { zone_id, type } = this.sensorFilters.value;
    let filtered = this.allSensors();
    if (zone_id) filtered = filtered.filter(s => s.zone_id === Number(zone_id));
    if (type) filtered = filtered.filter(s => s.type === type);
    this.sensors.set(filtered);
  }

  getZone(zoneId: number): Zone | undefined {
    return this.zones().find(z => z.id === zoneId);
  }

  zoneRangeLabel(sensor: Sensor): string {
    const z = this.getZone(sensor.zone_id);
    if (!z) return '';
    if (sensor.type === 'temperature' && z.temp_min != null && z.temp_max != null) {
      return `${z.temp_min}°C – ${z.temp_max}°C`;
    }
    if (sensor.type === 'humidity' && z.humidity_min != null && z.humidity_max != null) {
      return `${z.humidity_min}% – ${z.humidity_max}%`;
    }
    if (z.temp_min != null && z.temp_max != null) {
      return `${z.temp_min}°C – ${z.temp_max}°C`;
    }
    return '';
  }

  openSensorForm(sensor?: Sensor): void {
    this.dialog.open(SensorFormDialogComponent, { data: { sensor: sensor || null, zones: this.zones(), warehouses: this.warehouses() }, width: '500px' })
      .afterClosed().subscribe(ok => { if (ok) { this.snack.open(sensor ? 'Sensor actualizado' : 'Sensor creado', 'OK', { duration: 3000 }); this.loadSensors(); } });
  }

  deleteSensor(s: Sensor): void {
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Eliminar sensor', message: `¿Eliminar "${s.name}"?`, confirmColor: 'warn' }, width: '420px' })
      .afterClosed().subscribe(ok => { if (ok) this.svc.deleteSensor(s.id).subscribe(() => { this.snack.open('Sensor eliminado', 'OK', { duration: 3000 }); this.loadSensors(); }); });
  }

  openReading(sensor: Sensor): void {
    this.dialog.open(ReadingFormDialogComponent, { data: { sensor, monitoringSvc: this.svc }, width: '460px' })
      .afterClosed().subscribe(ok => { if (ok) this.snack.open('Lectura registrada', 'OK', { duration: 3000 }); });
  }

  selectSensorForChart(sensor: Sensor): void {
    this.selectedSensor.set(sensor);
    this.activeTab.set(1);
    this.loadStats();
  }

  onSensorSelectChange(sensorId: number): void {
    const sensor = this.sensors().find(s => s.id === sensorId);
    if (sensor) {
      this.selectedSensor.set(sensor);
      this.loadStats();
    }
  }

  loadStats(): void {
    const s = this.selectedSensor();
    if (!s) return;
    const { date_from, date_to } = this.chartDateForm.value;
    if (!date_from || !date_to) return;
    this.loadingStats.set(true);
    this.svc.getStatistics(s.id, date_from, date_to).subscribe({
      next: r => { this.stats.set(r.data); this.loadingStats.set(false); },
      error: () => this.loadingStats.set(false),
    });
  }

  /** Fecha LOCAL en formato YYYY-MM-DD (no UTC) */
  private localDateStr(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  getDefaultDateFrom(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return this.localDateStr(d);
  }

  getTodayDate(): string { return this.localDateStr(); }
}

import { Component, computed, inject, signal, OnInit } from '@angular/core';
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
import { CalibrationDialogComponent } from './dialogs/calibration-dialog.component';
import { CALIBRATION_STATUS_META, SENSOR_TYPE_LABELS, daysLeftLabel, httpErrors, localDateStr, rangeForType } from './monitoring.utils';
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
  exporting = signal(false);
  activeTab = signal(0);

  readonly calMeta: Record<string, { label: string; icon: string; css: string }> = CALIBRATION_STATUS_META;
  readonly typeLabels = SENSOR_TYPE_LABELS;
  readonly daysLeftLabel = daysLeftLabel;

  sensorCols = ['actions', 'name', 'zone', 'type', 'calibration', 'last_reading', 'is_active'];
  sensorFilters = this.fb.group({ warehouse_id: [''], zone_id: [''], type: [''], calibration: [''] });
  private filterWarehouse = signal<number | null>(null);

  /** Zonas del filtro, limitadas al almacén elegido. */
  filterZones = computed(() => {
    const wid = this.filterWarehouse();
    return wid ? this.zones().filter(z => z.warehouse_id === wid) : this.zones();
  });

  /** Equipos con certificado vencido, por vencer o sin certificado (para el aviso superior). */
  calibrationIssues = computed(() => {
    const all = this.allSensors().filter(s => s.is_active);
    return {
      expired: all.filter(s => s.calibration?.status === 'expired').length,
      expiring: all.filter(s => s.calibration?.status === 'expiring').length,
      missing: all.filter(s => s.calibration?.status === 'missing').length,
    };
  });

  chartDateForm = this.fb.group({
    date_from: [this.getDefaultDateFrom(), Validators.required],
    date_to: [this.getTodayDate(), Validators.required],
  });

  ngOnInit(): void {
    this.wSvc.getZones().subscribe({ next: r => this.zones.set(r.data ?? []), error: () => {} });
    this.wSvc.getWarehouses().subscribe({ next: r => this.warehouses.set(r.data ?? []), error: () => {} });
    this.loadSensors();
    this.sensorFilters.controls.warehouse_id.valueChanges.subscribe(wid => {
      this.filterWarehouse.set(wid ? Number(wid) : null);
      const zid = Number(this.sensorFilters.controls.zone_id.value);
      if (zid && !this.filterZones().some(z => z.id === zid)) this.sensorFilters.controls.zone_id.setValue('', { emitEvent: false });
    });
    this.sensorFilters.valueChanges.subscribe(() => this.applyFilters());
  }

  loadSensors(): void {
    this.svc.getSensors().subscribe({
      next: r => { this.allSensors.set(r.data ?? []); this.applyFilters(); },
      error: () => {},
    });
  }

  applyFilters(): void {
    const { warehouse_id, zone_id, type, calibration } = this.sensorFilters.value;
    let filtered = this.allSensors();
    if (warehouse_id) filtered = filtered.filter(s => this.warehouseIdOf(s) === Number(warehouse_id));
    if (zone_id) filtered = filtered.filter(s => s.zone_id === Number(zone_id));
    if (type) filtered = filtered.filter(s => s.type === type);
    if (calibration) filtered = filtered.filter(s => s.calibration?.status === calibration);
    this.sensors.set(filtered);
  }

  filterByCalibration(status: string): void {
    this.sensorFilters.patchValue({ calibration: status });
  }

  private warehouseIdOf(s: Sensor): number | undefined {
    return s.zone?.warehouse_id ?? this.getZone(s.zone_id)?.warehouse_id;
  }

  getZone(zoneId: number): Zone | undefined {
    return this.zones().find(z => z.id === zoneId);
  }

  zoneRangeLabel(sensor: Sensor): string {
    return rangeForType(sensor.zone ?? this.getZone(sensor.zone_id), sensor.type) ?? '';
  }

  warehouseName(sensor: Sensor): string {
    return sensor.zone?.warehouse_name ?? this.warehouses().find(w => w.id === this.warehouseIdOf(sensor))?.name ?? '';
  }

  openSensorForm(sensor?: Sensor): void {
    this.dialog.open(SensorFormDialogComponent, {
      data: { sensor: sensor || null, zones: this.zones(), warehouses: this.warehouses() },
      width: '980px', maxWidth: '95vw', autoFocus: false,
    })
      .afterClosed().subscribe(ok => { if (ok) { this.snack.open(sensor ? 'Sensor actualizado' : 'Sensor creado', 'OK', { duration: 3000 }); this.loadSensors(); } });
  }

  deleteSensor(s: Sensor): void {
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Eliminar sensor', message: `¿Eliminar "${s.name}"?`, confirmColor: 'warn' }, width: '420px' })
      .afterClosed().subscribe(ok => { if (ok) this.svc.deleteSensor(s.id).subscribe(() => { this.snack.open('Sensor eliminado', 'OK', { duration: 3000 }); this.loadSensors(); }); });
  }

  openReading(sensor: Sensor): void {
    this.dialog.open(ReadingFormDialogComponent, { data: { sensor, monitoringSvc: this.svc }, width: '480px', maxWidth: '95vw' })
      .afterClosed().subscribe(ok => { if (ok) { this.snack.open('Lectura registrada', 'OK', { duration: 3000 }); this.loadSensors(); } });
  }

  openCalibrations(sensor: Sensor): void {
    this.dialog.open(CalibrationDialogComponent, { data: { sensor }, width: '720px', maxWidth: '95vw', autoFocus: false })
      .afterClosed().subscribe(changed => { if (changed) this.loadSensors(); });
  }

  exportExcel(): void {
    const s = this.selectedSensor();
    const { date_from, date_to } = this.chartDateForm.value;
    if (!s || !date_from || !date_to || this.exporting()) return;
    this.exporting.set(true);
    this.svc.exportReadings(s.id, date_from, date_to).subscribe({
      next: () => this.exporting.set(false),
      error: err => {
        this.exporting.set(false);
        this.snack.open(httpErrors(err)[0], 'OK', { duration: 5000 });
      },
    });
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

  getDefaultDateFrom(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return localDateStr(d);
  }

  getTodayDate(): string { return localDateStr(); }
}

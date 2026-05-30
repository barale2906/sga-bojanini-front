import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { WarehouseService, Warehouse, Zone, Location, WarehouseCapacity, CapacityVolume, CapacityWeight } from '../warehouse.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { WarehouseFormDialogComponent } from './warehouse-form-dialog.component';
import { ZoneFormDialogComponent } from './zone-form-dialog.component';
import { LocationFormDialogComponent } from './location-form-dialog.component';

@Component({
  selector: 'app-warehouse-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTabsModule, MatTableModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatTooltipModule, MatExpansionModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective,
  ],
  templateUrl: './warehouse-page.component.html',
  styleUrl: './warehouse-page.component.scss',
})
export class WarehousePageComponent implements OnInit {
  private svc = inject(WarehouseService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  warehouses = signal<Warehouse[]>([]);
  zones = signal<Zone[]>([]);
  locations = signal<Location[]>([]);
  loading = signal(false);

  // ── Capacidad ────────────────────────────────────────────────
  warehouseCapacity = signal<WarehouseCapacity | null>(null);
  loadingCapacity = signal(false);
  capFilters = this.fb.group({ warehouse_id: ['' as string | number] });

  whCols = ['actions', 'code', 'name', 'address', 'is_active'];
  zoneCols = ['actions', 'code', 'name', 'type', 'temp_range', 'is_active'];
  locCols = ['actions', 'code', 'name', 'volume_cm3', 'max_weight_kg', 'is_active'];

  whFilters = this.fb.group({ search: [''], is_active: [''] });
  zoneFilters = this.fb.group({ warehouse_id: [''], type: [''], search: [''] });
  locFilters = this.fb.group({ zone_id: [''] });

  zoneTypes = [
    { value: 'ambient', label: 'Ambiente' },
    { value: 'cold', label: 'Refrigerado' },
    { value: 'frozen', label: 'Congelado' },
    { value: 'controlled', label: 'Controlado' },
  ];

  ngOnInit(): void {
    this.loadWarehouses();
    this.loadZones();
    this.loadLocations();

    this.whFilters.get('search')!.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.loadWarehouses());
    this.whFilters.get('is_active')!.valueChanges.subscribe(() => this.loadWarehouses());
    this.zoneFilters.valueChanges.pipe(debounceTime(300)).subscribe(() => this.loadZones());
    this.locFilters.valueChanges.subscribe(() => this.loadLocations());
    this.capFilters.get('warehouse_id')!.valueChanges.subscribe(id => {
      if (id) this.loadWarehouseCapacity(Number(id));
      else this.warehouseCapacity.set(null);
    });
  }

  loadWarehouses(): void {
    this.loading.set(true);
    const { search, is_active } = this.whFilters.value;
    this.svc.getWarehouses({ search: search || undefined, is_active: is_active || undefined }).subscribe({
      next: r => { this.warehouses.set(r.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadZones(): void {
    const { warehouse_id, type, search } = this.zoneFilters.value;
    this.svc.getZones({
      warehouse_id: warehouse_id ? Number(warehouse_id) : undefined,
      type: type || undefined,
      search: search || undefined,
    }).subscribe({ next: r => this.zones.set(r.data ?? []), error: () => {} });
  }

  loadLocations(): void {
    const { zone_id } = this.locFilters.value;
    this.svc.getLocations({ zone_id: zone_id ? Number(zone_id) : undefined }).subscribe({
      next: r => this.locations.set(r.data ?? []), error: () => {},
    });
  }

  openWarehouseForm(wh?: Warehouse): void {
    this.dialog.open(WarehouseFormDialogComponent, { data: wh || null, width: '560px' })
      .afterClosed().subscribe(saved => { if (saved) { this.snack.open(wh ? 'Almacén actualizado' : 'Almacén creado', 'OK', { duration: 3000 }); this.loadWarehouses(); } });
  }

  openZoneForm(zone?: Zone): void {
    this.dialog.open(ZoneFormDialogComponent, { data: { zone: zone || null, warehouses: this.warehouses() }, width: '620px' })
      .afterClosed().subscribe(saved => { if (saved) { this.snack.open(zone ? 'Zona actualizada' : 'Zona creada', 'OK', { duration: 3000 }); this.loadZones(); } });
  }

  openLocationForm(loc?: Location): void {
    this.dialog.open(LocationFormDialogComponent, { data: { location: loc || null, zones: this.zones() }, width: '560px', minHeight: '560px' })
      .afterClosed().subscribe(saved => { if (saved) { this.snack.open(loc ? 'Ubicación actualizada' : 'Ubicación creada', 'OK', { duration: 3000 }); this.loadLocations(); } });
  }

  deleteWarehouse(wh: Warehouse): void {
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Eliminar almacén', message: `¿Eliminar "${wh.name}"?`, confirmColor: 'warn' }, width: '420px' })
      .afterClosed().subscribe(ok => { if (ok) this.svc.deleteWarehouse(wh.id).subscribe(() => { this.snack.open('Almacén eliminado', 'OK', { duration: 3000 }); this.loadWarehouses(); }); });
  }

  deleteZone(z: Zone): void {
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Eliminar zona', message: `¿Eliminar "${z.name}"?`, confirmColor: 'warn' }, width: '420px' })
      .afterClosed().subscribe(ok => { if (ok) this.svc.deleteZone(z.id).subscribe(() => { this.snack.open('Zona eliminada', 'OK', { duration: 3000 }); this.loadZones(); }); });
  }

  deleteLocation(l: Location): void {
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Eliminar ubicación', message: `¿Eliminar "${l.name}"?`, confirmColor: 'warn' }, width: '420px' })
      .afterClosed().subscribe(ok => { if (ok) this.svc.deleteLocation(l.id).subscribe(() => { this.snack.open('Ubicación eliminada', 'OK', { duration: 3000 }); this.loadLocations(); }); });
  }

  getZoneTypeBadge(type: string): string {
    const map: Record<string, string> = { ambient: 'Ambiente', cold: '❄️ Refrigerado', frozen: '🧊 Congelado', controlled: '🌡 Controlado' };
    return map[type] || type;
  }

  getTempRange(z: Zone): string {
    if (z.temp_min !== null && z.temp_max !== null) return `${z.temp_min}–${z.temp_max} °C`;
    return '—';
  }

  // ── Capacidad física ─────────────────────────────────────────

  loadWarehouseCapacity(id: number): void {
    this.loadingCapacity.set(true);
    this.warehouseCapacity.set(null);
    this.svc.getWarehouseCapacity(id).subscribe({
      next: r => { this.warehouseCapacity.set(r.data); this.loadingCapacity.set(false); },
      error: () => this.loadingCapacity.set(false),
    });
  }

  /** Clase CSS de color según porcentaje de uso */
  capClass(pct: number | null): string {
    if (pct === null) return 'cap--undefined';
    if (pct > 85) return 'cap--high';
    if (pct > 60) return 'cap--mid';
    return 'cap--low';
  }

  /** Formato de volumen: si es null "—", si es grande en m³ */
  fmtVol(val: number | null): string {
    if (val === null) return '—';
    return val >= 1_000_000
      ? `${(val / 1_000_000).toFixed(2)} m³`
      : `${val.toLocaleString()} cm³`;
  }

  fmtKg(val: number | null): string {
    if (val === null) return '—';
    return val >= 1000 ? `${(val / 1000).toFixed(2)} t` : `${val.toFixed(2)} kg`;
  }

  fmtPct(val: number | null): string {
    return val !== null ? `${val.toFixed(1)} %` : 'sin límite';
  }

  volBadge(cv: CapacityVolume): string {
    if (!cv.max_cm3) return `Usado: ${this.fmtVol(cv.used_cm3)}`;
    return `${this.fmtVol(cv.used_cm3)} / ${this.fmtVol(cv.max_cm3)}`;
  }

  wgtBadge(cw: CapacityWeight): string {
    if (!cw.max_kg) return `Usado: ${this.fmtKg(cw.used_kg)}`;
    return `${this.fmtKg(cw.used_kg)} / ${this.fmtKg(cw.max_kg)}`;
  }
}

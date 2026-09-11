import { Component, Input, Output, EventEmitter, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormArray, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  WarehouseService, WarehouseDetail, ZoneDetail, Location,
  WarehouseFormPayload, WarehouseCapacity, CapacityVolume, CapacityWeight,
} from '../warehouse.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';

@Component({
  selector: 'app-warehouse-detail-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSlideToggleModule, MatProgressSpinnerModule,
    MatExpansionModule, MatTooltipModule, MatDividerModule,
    FormErrorsComponent, LoadingSpinnerComponent, PermissionDirective,
  ],
  templateUrl: './warehouse-detail-form.component.html',
  styleUrl: './warehouse-detail-form.component.scss',
})
export class WarehouseDetailFormComponent implements OnChanges {
  @Input() warehouseId: number | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  private svc = inject(WarehouseService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  warehouse = signal<WarehouseDetail | null>(null);
  loading = signal(false);
  saving = signal(false);
  errors = signal<string[]>([]);

  warehouseCapacity = signal<WarehouseCapacity | null>(null);
  loadingCapacity = signal(false);

  openZoneIndex = signal<number | null>(null);

  readonly zoneTypes = [
    { value: 'ambient', label: 'Ambiente' },
    { value: 'cold', label: 'Refrigerado' },
    { value: 'frozen', label: 'Congelado' },
    { value: 'controlled', label: 'Controlado' },
  ];

  readonly zoneTypeIcons: Record<string, string> = {
    ambient: 'thermostat',
    cold: 'ac_unit',
    frozen: 'severe_cold',
    controlled: 'tune',
  };

  form = this.buildForm();

  get zonesArray(): FormArray { return this.form.get('zones') as FormArray; }
  getLocationsArray(zi: number): FormArray {
    return (this.zonesArray.at(zi) as FormGroup).get('locations') as FormArray;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['warehouseId']) {
      this.form = this.buildForm();
      this.warehouse.set(null);
      this.warehouseCapacity.set(null);
      this.openZoneIndex.set(null);
      this.errors.set([]);
      if (this.warehouseId !== null) {
        this.loadWarehouse();
      }
    }
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      name:        ['', Validators.required],
      address:     [null as string | null],
      description: [null as string | null],
      is_active:   [true],
      zones:       this.fb.array([]),
    });
  }

  private loadWarehouse(): void {
    this.loading.set(true);
    this.svc.getWarehouseDetail(this.warehouseId!).subscribe({
      next: wh => {
        this.warehouse.set(wh);
        this.populateForm(wh);
        this.loading.set(false);
        this.loadCapacity(wh.id);
      },
      error: () => {
        this.snack.open('Error al cargar el almacén', 'OK', { duration: 3000 });
        this.loading.set(false);
      },
    });
  }

  private loadCapacity(warehouseId: number): void {
    this.loadingCapacity.set(true);
    this.svc.getWarehouseCapacity(warehouseId).subscribe({
      next: r => { this.warehouseCapacity.set(r.data); this.loadingCapacity.set(false); },
      error: () => this.loadingCapacity.set(false),
    });
  }

  toggleZone(zi: number): void {
    this.openZoneIndex.update(v => v === zi ? null : zi);
  }

  private populateForm(wh: WarehouseDetail): void {
    this.form.patchValue({
      name: wh.name,
      address: wh.address, description: wh.description, is_active: wh.is_active,
    });
    (this.form.get('zones') as FormArray).clear();
    wh.zones.forEach(z => (this.form.get('zones') as FormArray).push(this.createZoneGroup(z)));
  }

  private createZoneGroup(zone?: ZoneDetail): FormGroup {
    return this.fb.group({
      _existingId:  [zone?.id ?? null],
      name:         [zone?.name ?? '', Validators.required],
      type:         [zone?.type ?? 'ambient', Validators.required],
      temp_min:     [zone?.temp_min ?? null],
      temp_max:     [zone?.temp_max ?? null],
      humidity_min: [zone?.humidity_min ?? null],
      humidity_max: [zone?.humidity_max ?? null],
      description:  [zone?.description ?? null],
      locations:    this.fb.array((zone?.locations ?? []).map(l => this.createLocationGroup(l))),
    });
  }

  private createLocationGroup(loc?: Location): FormGroup {
    return this.fb.group({
      _existingId:   [loc?.id ?? null],
      name:          [loc?.name ?? '', Validators.required],
      volume_cm3:    [loc?.volume_cm3 ?? null],
      max_weight_kg: [loc?.max_weight_kg ?? null],
      description:   [loc?.description ?? null],
      // campos auxiliares para calcular volumen
      dim_h: [null as number | null],
      dim_w: [null as number | null],
      dim_l: [null as number | null],
    });
  }

  calcVolume(zi: number, li: number): void {
    const g = this.getLocationsArray(zi).at(li) as FormGroup;
    const h = Number(g.get('dim_h')?.value);
    const w = Number(g.get('dim_w')?.value);
    const l = Number(g.get('dim_l')?.value);
    const vol = (h > 0 && w > 0 && l > 0) ? h * w * l : null;
    g.get('volume_cm3')?.setValue(vol, { emitEvent: false });
  }

  addZone(): void {
    this.zonesArray.push(this.createZoneGroup());
  }

  addLocation(zi: number): void {
    this.getLocationsArray(zi).push(this.createLocationGroup());
  }

  removeZone(zi: number): void {
    const g = this.zonesArray.at(zi) as FormGroup;
    const existingId = g.get('_existingId')?.value as number | null;
    const name = g.get('name')?.value || 'esta zona';

    if (existingId) {
      this.dialog.open(ConfirmDialogComponent, {
        data: { title: 'Eliminar zona', message: `¿Eliminar la zona "${name}" y todas sus ubicaciones?`, confirmColor: 'warn' },
        width: '420px',
      }).afterClosed().subscribe(ok => {
        if (ok) {
          this.svc.deleteZone(existingId).subscribe({
            next: () => { this.snack.open('Zona eliminada', 'OK', { duration: 3000 }); this.zonesArray.removeAt(zi); },
            error: () => this.snack.open('Error al eliminar la zona', 'OK', { duration: 3000 }),
          });
        }
      });
    } else {
      this.zonesArray.removeAt(zi);
    }
  }

  removeLocation(zi: number, li: number): void {
    const g = this.getLocationsArray(zi).at(li) as FormGroup;
    const existingId = g.get('_existingId')?.value as number | null;
    const name = g.get('name')?.value || 'esta ubicación';

    if (existingId) {
      this.dialog.open(ConfirmDialogComponent, {
        data: { title: 'Eliminar ubicación', message: `¿Eliminar la ubicación "${name}"?`, confirmColor: 'warn' },
        width: '420px',
      }).afterClosed().subscribe(ok => {
        if (ok) {
          this.svc.deleteLocation(existingId).subscribe({
            next: () => { this.snack.open('Ubicación eliminada', 'OK', { duration: 3000 }); this.getLocationsArray(zi).removeAt(li); },
            error: () => this.snack.open('Error al eliminar la ubicación', 'OK', { duration: 3000 }),
          });
        }
      });
    } else {
      this.getLocationsArray(zi).removeAt(li);
    }
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.errors.set([]);
    const payload = this.buildPayload();
    const wh = this.warehouse();
    const req$ = wh
      ? this.svc.updateWarehouseWithZones(wh.id, payload)
      : this.svc.createWarehouseWithZones(payload);

    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open(wh ? 'Almacén actualizado' : 'Almacén creado', 'OK', { duration: 3000 });
        this.saved.emit();
      },
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          const errs = err.error?.errors || {};
          this.errors.set(Object.values(errs).flat() as string[]);
        } else if (err.status === 409) {
          this.errors.set([err.error?.message || 'Conflicto: código duplicado']);
        }
      },
    });
  }

  private buildPayload(): WarehouseFormPayload {
    const v = this.form.getRawValue();
    return {
      name: v.name,
      address: v.address || null,
      description: v.description || null,
      is_active: v.is_active,
      zones: v.zones.map((z: any) => ({
        ...(z._existingId ? { id: z._existingId } : {}),
        name: z.name, type: z.type,
        temp_min: z.temp_min ?? null, temp_max: z.temp_max ?? null,
        humidity_min: z.humidity_min ?? null, humidity_max: z.humidity_max ?? null,
        description: z.description || null,
        locations: z.locations.map((l: any) => ({
          ...(l._existingId ? { id: l._existingId } : {}),
          name: l.name,
          volume_cm3: l.volume_cm3 ?? null,
          max_weight_kg: l.max_weight_kg ?? null,
          description: l.description || null,
        })),
      })),
    };
  }

  capClass(pct: number | null): string {
    if (pct === null) return 'cap--undefined';
    if (pct > 85) return 'cap--high';
    if (pct > 60) return 'cap--mid';
    return 'cap--low';
  }

  fmtVol(val: number | null): string {
    if (val === null) return '—';
    return val >= 1_000_000 ? `${(val / 1_000_000).toFixed(2)} m³` : `${val.toLocaleString()} cm³`;
  }

  fmtKg(val: number | null): string {
    if (val === null) return '—';
    return val >= 1000 ? `${(val / 1000).toFixed(2)} t` : `${val.toFixed(2)} kg`;
  }

  fmtPct(val: number | null): string {
    return val !== null ? `${val.toFixed(1)} %` : 'sin límite';
  }

  volBadge(cv: CapacityVolume): string {
    return cv.max_cm3 ? `${this.fmtVol(cv.used_cm3)} / ${this.fmtVol(cv.max_cm3)}` : `Usado: ${this.fmtVol(cv.used_cm3)}`;
  }

  wgtBadge(cw: CapacityWeight): string {
    return cw.max_kg ? `${this.fmtKg(cw.used_kg)} / ${this.fmtKg(cw.max_kg)}` : `Usado: ${this.fmtKg(cw.used_kg)}`;
  }

  getZoneTypeLabel(type: string): string {
    return this.zoneTypes.find(t => t.value === type)?.label ?? type;
  }
}

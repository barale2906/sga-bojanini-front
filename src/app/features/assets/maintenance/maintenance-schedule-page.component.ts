import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subscription, debounceTime, Observable } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { AssetMaintenanceService } from '../asset-maintenance.service';
import { AssetCatalogStore } from '../asset-catalog.store';
import {
  AssetMaintenance, AssetType, MAINTENANCE_STATUS_TONE, MaintenanceFilters, MaintenanceStatus, MaintenanceType, StatusTone,
} from '../assets.models';
import { ToneChipComponent } from '../shared/tone-chip.component';
import { MaintenanceActionsService } from '../shared/maintenance-actions.service';
import { CalendarDay, buildMonthGrid, gridRange } from './calendar.util';

/** Máximo de órdenes por consulta en la vista mensual. */
const MONTH_LIMIT = 500;

/**
 * Cronograma de mantenimiento: calendario mensual y lista, con semáforo
 * (vencido / programado / en ejecución / realizado) y acciones sobre cada orden.
 */
@Component({
  selector: 'app-maintenance-schedule-page',
  standalone: true,
  imports: [
    DatePipe, RouterLink, ReactiveFormsModule, MatButtonModule, MatButtonToggleModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule, MatMenuModule, MatTooltipModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective, ToneChipComponent,
  ],
  templateUrl: './maintenance-schedule-page.component.html',
  styleUrl: './maintenance-schedule-page.component.scss',
})
export class MaintenanceSchedulePageComponent implements OnInit {
  private svc = inject(AssetMaintenanceService);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  store = inject(AssetCatalogStore);
  actions = inject(MaintenanceActionsService);

  readonly statusTone = MAINTENANCE_STATUS_TONE;
  readonly weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  view = signal<'calendar' | 'list'>('calendar');
  month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  items = signal<AssetMaintenance[]>([]);
  loading = signal(false);
  private loadSub?: Subscription;

  readonly weeks = computed(() => buildMonthGrid(this.month()));

  /** Órdenes agrupadas por fecha programada (YYYY-MM-DD). */
  readonly byDate = computed(() => {
    const map = new Map<string, AssetMaintenance[]>();
    for (const m of this.items()) {
      const list = map.get(m.scheduled_date) ?? [];
      list.push(m);
      map.set(m.scheduled_date, list);
    }
    return map;
  });

  readonly summary = computed(() => {
    const items = this.items();
    return {
      overdue: items.filter(m => m.is_overdue).length,
      scheduled: items.filter(m => m.status === 'scheduled' && !m.is_overdue).length,
      inProgress: items.filter(m => m.status === 'in_progress').length,
      completed: items.filter(m => m.status === 'completed').length,
    };
  });

  listCols = ['date', 'asset', 'type', 'status', 'performer', 'actions'];

  filters = this.fb.group({
    search: [''],
    status: ['' as MaintenanceStatus | ''],
    maintenance_type: ['' as MaintenanceType | ''],
    site_id: [null as number | null],
    asset_type: ['' as AssetType | ''],
  });

  ngOnInit(): void {
    this.store.load().subscribe();
    this.load();
    this.filters.valueChanges.pipe(debounceTime(300)).subscribe(() => this.load());
  }

  private currentFilters(): MaintenanceFilters {
    const f = this.filters.getRawValue();
    const { from, to } = gridRange(this.weeks());
    return {
      from, to,
      search: f.search || undefined,
      status: f.status || undefined,
      maintenance_type: f.maintenance_type || undefined,
      site_id: f.site_id,
      asset_type: f.asset_type || undefined,
    };
  }

  load(): void {
    this.loading.set(true);
    this.loadSub?.unsubscribe();
    this.loadSub = this.svc.list({ ...this.currentFilters(), per_page: MONTH_LIMIT }).subscribe({
      next: res => {
        this.items.set(res.data);
        this.loading.set(false);
        if (res.meta.total > MONTH_LIMIT) {
          this.snack.open(`Se muestran ${MONTH_LIMIT} de ${res.meta.total} órdenes; aplique filtros.`, 'OK', { duration: 5000 });
        }
      },
      error: err => {
        this.loading.set(false);
        this.snack.open(err.error?.message ?? 'Error al cargar el cronograma', 'OK', { duration: 4000 });
      },
    });
  }

  moveMonth(delta: number): void {
    const m = this.month();
    this.month.set(new Date(m.getFullYear(), m.getMonth() + delta, 1));
    this.load();
  }

  goToday(): void {
    const now = new Date();
    this.month.set(new Date(now.getFullYear(), now.getMonth(), 1));
    this.load();
  }

  dayItems(day: CalendarDay): AssetMaintenance[] {
    return this.byDate().get(day.date) ?? [];
  }

  /** Clase del semáforo de una orden. */
  tone(m: AssetMaintenance): StatusTone {
    return m.is_overdue ? 'bad' : this.statusTone[m.status];
  }

  run(action$: Observable<boolean>): void {
    action$.subscribe(changed => changed && this.load());
  }

  export(): void {
    this.svc.exportSchedule(this.currentFilters()).subscribe({
      error: err => this.snack.open(err.error?.message ?? 'No fue posible exportar', 'OK', { duration: 4000 }),
    });
  }
}

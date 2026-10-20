import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AssetMaintenanceService } from '../asset-maintenance.service';
import { Asset, AssetMaintenance, MAINTENANCE_STATUS_TONE, MaintenancePlan } from '../assets.models';
import { ToneChipComponent } from '../shared/tone-chip.component';
import { MaintenanceActionsService } from '../shared/maintenance-actions.service';
import { MaintenancePlanDialogComponent } from '../dialogs/maintenance-plan-dialog.component';
import { MaintenanceOrderDialogComponent } from '../dialogs/maintenance-order-dialog.component';

/** Planes periódicos y órdenes (cronograma e historial) de un equipo. */
@Component({
  selector: 'app-asset-maintenance-panel',
  standalone: true,
  imports: [DatePipe, MatTableModule, MatButtonModule, MatIconModule, MatTooltipModule, MatMenuModule, PermissionDirective, ToneChipComponent],
  templateUrl: './asset-maintenance-panel.component.html',
  styleUrl: './asset-detail.component.scss',
})
export class AssetMaintenancePanelComponent implements OnInit {
  private svc = inject(AssetMaintenanceService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  actions = inject(MaintenanceActionsService);

  @Input({ required: true }) asset!: Asset;
  @Input() readonly = false;
  /** Emite cuando una acción pudo cambiar el estado del activo. */
  @Output() changed = new EventEmitter<void>();

  readonly statusTone = MAINTENANCE_STATUS_TONE;
  plans = signal<MaintenancePlan[]>([]);
  orders = signal<AssetMaintenance[]>([]);
  planCols = ['type', 'frequency', 'performer', 'next', 'status', 'actions'];
  orderCols = ['date', 'type', 'status', 'performer', 'result', 'actions'];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.svc.plans(this.asset.id).subscribe({ next: res => this.plans.set(res.data) });
    this.svc.list({ asset_id: this.asset.id, per_page: 100 }).subscribe({
      next: res => this.orders.set([...res.data].sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))),
    });
  }

  openPlan(plan?: MaintenancePlan): void {
    this.dialog.open(MaintenancePlanDialogComponent, { data: { assetId: this.asset.id, plan: plan ?? null }, width: '640px', maxWidth: '96vw' })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.snack.open(plan ? 'Plan actualizado' : 'Plan creado: se programó la próxima orden', 'OK', { duration: 3500 });
        this.load();
      });
  }

  deletePlan(plan: MaintenancePlan): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar plan', message: `¿Eliminar el plan ${plan.maintenance_type_label.toLowerCase()} (${plan.frequency_label.toLowerCase()})? Se cancela su orden programada.`, confirmColor: 'warn', confirmText: 'Eliminar' },
      width: '460px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.deletePlan(plan.id).subscribe({
        next: () => { this.snack.open('Plan eliminado', 'OK', { duration: 3000 }); this.load(); },
        error: err => this.snack.open(err.error?.message ?? 'No fue posible eliminar', 'OK', { duration: 4000 }),
      });
    });
  }

  scheduleOrder(): void {
    this.dialog.open(MaintenanceOrderDialogComponent, {
      data: { assetId: this.asset.id, assetLabel: `${this.asset.code} — ${this.asset.name}` },
      width: '600px', maxWidth: '96vw',
    }).afterClosed().subscribe(saved => {
      if (!saved) return;
      this.snack.open('Mantenimiento programado', 'OK', { duration: 3000 });
      this.load();
    });
  }

  run(action$: Observable<boolean>): void {
    action$.subscribe(changed => {
      if (!changed) return;
      this.load();
      this.changed.emit();
    });
  }
}

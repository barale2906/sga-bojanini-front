import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, filter, map, of, switchMap, catchError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AssetMaintenanceService } from '../asset-maintenance.service';
import { AssetMaintenance } from '../assets.models';
import { MaintenanceCompleteDialogComponent } from '../dialogs/maintenance-complete-dialog.component';
import { MaintenanceOrderDialogComponent } from '../dialogs/maintenance-order-dialog.component';
import { ReasonDialogComponent } from './reason-dialog.component';

/**
 * Acciones sobre una orden de mantenimiento (iniciar, registrar, reprogramar,
 * cancelar, reporte) con sus diálogos y mensajes. Cada acción emite `true`
 * cuando cambió algo, para que la vista recargue.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceActionsService {
  private svc = inject(AssetMaintenanceService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  canSchedule(): boolean { return this.auth.hasPermission('activos_mantenimientos.programar'); }
  canExecute(): boolean { return this.auth.hasPermission('activos_mantenimientos.ejecutar'); }
  canCancel(): boolean { return this.auth.hasPermission('activos_mantenimientos.cancelar'); }

  start(m: AssetMaintenance): Observable<boolean> {
    return this.svc.start(m.id).pipe(
      map(() => { this.snack.open('Mantenimiento iniciado: el equipo quedó "En mantenimiento"', 'OK', { duration: 3500 }); return true; }),
      catchError(err => this.fail(err, 'No fue posible iniciar el mantenimiento')),
    );
  }

  complete(m: AssetMaintenance): Observable<boolean> {
    return this.dialog.open(MaintenanceCompleteDialogComponent, { data: m, width: '820px', maxWidth: '96vw', disableClose: true })
      .afterClosed().pipe(
        filter(Boolean),
        map(() => { this.snack.open('Mantenimiento registrado', 'OK', { duration: 3500 }); return true; }),
      );
  }

  reschedule(m: AssetMaintenance): Observable<boolean> {
    return this.dialog.open(MaintenanceOrderDialogComponent, {
      data: { assetId: m.asset.id, assetLabel: `${m.asset.code} — ${m.asset.name}`, maintenance: m },
      width: '560px', maxWidth: '96vw',
    }).afterClosed().pipe(
      filter(Boolean),
      map(() => { this.snack.open('Mantenimiento reprogramado', 'OK', { duration: 3000 }); return true; }),
    );
  }

  cancel(m: AssetMaintenance): Observable<boolean> {
    return this.dialog.open(ReasonDialogComponent, {
      data: { title: 'Cancelar mantenimiento', message: `${m.asset.code} — ${m.maintenance_type_label} del ${m.scheduled_date}`, confirmText: 'Cancelar orden' },
      width: '460px',
    }).afterClosed().pipe(
      filter((reason): reason is string => !!reason),
      switchMap(reason => this.svc.cancel(m.id, reason)),
      map(() => { this.snack.open('Mantenimiento cancelado', 'OK', { duration: 3000 }); return true; }),
      catchError(err => this.fail(err, 'No fue posible cancelar')),
    );
  }

  openReport(m: AssetMaintenance): void {
    this.svc.openReport(m.id).subscribe({ error: err => this.fail(err, 'No fue posible abrir el reporte').subscribe() });
  }

  private fail(err: { error?: { message?: string } }, fallback: string): Observable<boolean> {
    this.snack.open(err.error?.message ?? fallback, 'OK', { duration: 5000 });
    return of(false);
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MedicalServicesService, ProcedurePrice } from '../../inventory/medical-services.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { ProcedurePriceFormDialogComponent } from './procedure-price-form-dialog.component';

export interface ProcedurePricesDialogData {
  procedureId: number;
  procedureName: string;
  procedureCode: string;
}

@Component({
  selector: 'app-procedure-prices-dialog',
  standalone: true,
  imports: [
    CommonModule, MatDialogModule, MatTableModule, MatButtonModule,
    MatIconModule, MatTooltipModule, LoadingSpinnerComponent, PermissionDirective,
  ],
  template: `
    <h2 mat-dialog-title>Tarifas — {{ data.procedureCode }} {{ data.procedureName }}</h2>
    <mat-dialog-content>
      <app-loading-spinner [loading]="loading()" [inline]="true"></app-loading-spinner>

      <div class="toolbar">
        <button *sgaPermission="'procedimientos.crear'" mat-stroked-button color="primary" (click)="openForm()">
          <mat-icon>add</mat-icon> Nueva tarifa
        </button>
      </div>

      <table mat-table [dataSource]="prices()" class="prices-table">
        <ng-container matColumnDef="effective_from">
          <th mat-header-cell *matHeaderCellDef>Vigente desde</th>
          <td mat-cell *matCellDef="let p">{{ p.effective_from | date:'dd/MM/yyyy' }}</td>
        </ng-container>

        <ng-container matColumnDef="effective_to">
          <th mat-header-cell *matHeaderCellDef>Vigente hasta</th>
          <td mat-cell *matCellDef="let p">{{ p.effective_to ? (p.effective_to | date:'dd/MM/yyyy') : '—' }}</td>
        </ng-container>

        <ng-container matColumnDef="unit_price">
          <th mat-header-cell *matHeaderCellDef>Valor</th>
          <td mat-cell *matCellDef="let p">{{ p.unit_price | currency:'COP':'symbol':'1.0-0' }}</td>
        </ng-container>

        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>Estado</th>
          <td mat-cell *matCellDef="let p">
            @if (p.is_currently_valid) {
              <span class="badge badge--on">Vigente</span>
            } @else {
              <span class="badge" [class.badge--off]="!p.is_active">{{ p.is_active ? 'Activa' : 'Inactiva' }}</span>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="notes">
          <th mat-header-cell *matHeaderCellDef>Notas</th>
          <td mat-cell *matCellDef="let p">{{ p.notes || '—' }}</td>
        </ng-container>

        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef class="act">Acciones</th>
          <td mat-cell *matCellDef="let p" class="act">
            <button *sgaPermission="'procedimientos.editar'" mat-icon-button color="primary" (click)="openForm(p)" matTooltip="Editar">
              <mat-icon>edit</mat-icon>
            </button>
            <button *sgaPermission="'procedimientos.eliminar'" mat-icon-button color="warn" (click)="delete(p)" matTooltip="Eliminar">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="cols"></tr>
        <tr mat-row *matRowDef="let row; columns: cols;"></tr>
        <tr class="mat-row" *matNoDataRow>
          <td class="no-data" [attr.colspan]="cols.length">Sin tarifas registradas</td>
        </tr>
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="true">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .toolbar { display:flex; justify-content:flex-end; margin-bottom:0.5rem; }
    .prices-table { width:100%; min-width:560px; }
    .badge { display:inline-flex; padding:0.15rem 0.6rem; border-radius:9999px; font-size:0.75rem; font-weight:600; background:#e2e8f0; color:#4a5568; }
    .badge--on { background:#c6f6d5; color:#276749; }
    .badge--off { background:#fed7d7; color:#c53030; }
    .act { white-space:nowrap; }
    .no-data { text-align:center; padding:2rem; color:#a0aec0; }
  `],
})
export class ProcedurePricesDialogComponent implements OnInit {
  data: ProcedurePricesDialogData = inject(MAT_DIALOG_DATA);
  private svc = inject(MedicalServicesService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  prices = signal<ProcedurePrice[]>([]);
  loading = signal(false);

  cols = ['effective_from', 'effective_to', 'unit_price', 'status', 'notes', 'actions'];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.svc.getProcedurePrices(this.data.procedureId).subscribe({
      next: r => { this.prices.set(r.data ?? []); this.loading.set(false); },
      error: err => {
        this.loading.set(false);
        this.snack.open(err.error?.message || 'Error al cargar las tarifas', 'OK', { duration: 4000 });
      },
    });
  }

  openForm(price?: ProcedurePrice): void {
    this.dialog.open(ProcedurePriceFormDialogComponent, {
      data: { procedureId: this.data.procedureId, procedureName: `${this.data.procedureCode} ${this.data.procedureName}`, price: price ?? null },
      width: '480px',
    }).afterClosed().subscribe(saved => {
      if (saved) {
        this.snack.open(price ? 'Tarifa actualizada' : 'Tarifa creada', 'OK', { duration: 3000 });
        this.load();
      }
    });
  }

  delete(price: ProcedurePrice): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar tarifa',
        message: `¿Eliminar la tarifa de ${price.unit_price}? Esta acción no se puede deshacer.`,
        confirmColor: 'warn',
        confirmText: 'Eliminar',
      },
      width: '460px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.deleteProcedurePrice(this.data.procedureId, price.id).subscribe({
        next: () => { this.snack.open('Tarifa eliminada', 'OK', { duration: 3000 }); this.load(); },
        error: err => this.snack.open(err.error?.message || 'Error al eliminar la tarifa', 'OK', { duration: 4000 }),
      });
    });
  }
}

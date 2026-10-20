import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { AssetsService } from '../assets.service';
import { AssetCatalogStore } from '../asset-catalog.store';
import { ASSET_STATUS_TONE, Asset } from '../assets.models';
import { ToneChipComponent } from '../shared/tone-chip.component';
import { AssetFormDialogComponent } from '../dialogs/asset-form-dialog.component';
import { AssetTransferDialogComponent } from '../dialogs/asset-transfer-dialog.component';
import { AssetTransferConfirmDialogComponent } from '../dialogs/asset-transfer-confirm-dialog.component';
import { AssetStatusDialogComponent } from '../dialogs/asset-status-dialog.component';
import { AssetCommentsPanelComponent } from './asset-comments-panel.component';
import { TechnicalProfileFormComponent } from './technical-profile-form.component';
import { AssetMaintenancePanelComponent } from './asset-maintenance-panel.component';
import { AssetDocumentsPanelComponent } from './asset-documents-panel.component';
import { AssetHistoryPanelComponent } from './asset-history-panel.component';

/**
 * Ficha del activo: datos generales y comentarios, hoja de vida y
 * mantenimiento (solo equipos), documentos e historial.
 */
@Component({
  selector: 'app-asset-detail',
  standalone: true,
  imports: [
    CurrencyPipe, DatePipe, RouterLink, MatTabsModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule,
    LoadingSpinnerComponent, PermissionDirective, ToneChipComponent, AssetCommentsPanelComponent,
    TechnicalProfileFormComponent, AssetMaintenancePanelComponent, AssetDocumentsPanelComponent, AssetHistoryPanelComponent,
  ],
  templateUrl: './asset-detail.component.html',
  styleUrl: './asset-detail.component.scss',
})
export class AssetDetailComponent implements OnInit {
  private svc = inject(AssetsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private store = inject(AssetCatalogStore);

  @ViewChild(AssetHistoryPanelComponent) historyPanel?: AssetHistoryPanelComponent;

  readonly statusTone = ASSET_STATUS_TONE;
  asset = signal<Asset | null>(null);
  loading = signal(true);
  readonly retired = computed(() => this.asset()?.status === 'retired');

  ngOnInit(): void {
    this.store.load().subscribe();
    this.route.paramMap.subscribe(params => this.load(Number(params.get('id'))));
  }

  load(id = this.asset()?.id): void {
    if (!id) return;
    this.loading.set(true);
    this.svc.get(id).subscribe({
      next: res => { this.asset.set(res.data); this.loading.set(false); },
      error: err => {
        this.loading.set(false);
        this.snack.open(err.error?.message ?? 'Activo no encontrado', 'OK', { duration: 4000 });
        this.router.navigate(['/assets']);
      },
    });
  }

  /** Recarga la ficha y el historial tras una acción que cambia estado o ubicación. */
  refresh(): void {
    this.load();
    this.historyPanel?.reload();
  }

  edit(): void {
    this.dialog.open(AssetFormDialogComponent, { data: this.asset(), width: '760px', maxWidth: '96vw' })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.snack.open('Activo actualizado', 'OK', { duration: 3000 });
        this.refresh();
      });
  }

  transfer(): void {
    this.dialog.open(AssetTransferDialogComponent, { data: this.asset(), width: '760px', maxWidth: '96vw', disableClose: true })
      .afterClosed().subscribe(t => {
        if (!t) return;
        this.snack.open(t.status === 'pending_signature' ? 'Traslado pendiente de firma' : 'Traslado aplicado', 'OK', { duration: 4000 });
        this.refresh();
      });
  }

  signPendingTransfer(): void {
    const pending = this.asset()?.pending_transfer;
    if (!pending) return;
    this.svc.transfers({ asset_id: this.asset()!.id, status: 'pending_signature' }).subscribe(res => {
      const transfer = res.data[0];
      if (!transfer) return;
      this.dialog.open(AssetTransferConfirmDialogComponent, { data: transfer, width: '640px', maxWidth: '96vw', disableClose: true })
        .afterClosed().subscribe(done => {
          if (!done) return;
          this.snack.open('Traslado confirmado', 'OK', { duration: 3000 });
          this.refresh();
        });
    });
  }

  changeStatus(): void {
    this.dialog.open(AssetStatusDialogComponent, { data: this.asset(), width: '460px' })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.snack.open('Estado actualizado', 'OK', { duration: 3000 });
        this.refresh();
      });
  }

  lifeSheet(): void {
    this.svc.openLifeSheet(this.asset()!.id).subscribe({
      error: err => this.snack.open(err.error?.message ?? 'No fue posible generar la hoja de vida', 'OK', { duration: 4000 }),
    });
  }

  label(): void {
    this.svc.openLabels([this.asset()!.id]).subscribe({
      error: err => this.snack.open(err.error?.message ?? 'No fue posible generar la etiqueta', 'OK', { duration: 4000 }),
    });
  }
}

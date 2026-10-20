import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subscription, debounceTime } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PaginationMeta } from '../../../core/models/api-response.model';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { AssetsService } from '../assets.service';
import { AssetCatalogStore } from '../asset-catalog.store';
import {
  ASSET_STATUS_TONE, Asset, AssetCategory, AssetFilters, AssetSite, AssetStatistics, AssetStatus, AssetTransfer,
  AssetTransferStatus, AssetType,
} from '../assets.models';
import { ToneChipComponent } from '../shared/tone-chip.component';
import { ReasonDialogComponent } from '../shared/reason-dialog.component';
import { AssetFormDialogComponent } from '../dialogs/asset-form-dialog.component';
import { AssetTransferDialogComponent } from '../dialogs/asset-transfer-dialog.component';
import { AssetTransferConfirmDialogComponent } from '../dialogs/asset-transfer-confirm-dialog.component';
import { AssetImportDialogComponent } from '../dialogs/asset-import-dialog.component';
import {
  AssetCategoryDialogComponent, AssetPlaceDialogComponent, AssetSiteDialogComponent,
} from '../dialogs/asset-catalog-dialogs.component';

const TAB_KEYS = ['inventory', 'transfers', 'catalogs'] as const;

/**
 * Inventario de activos: indicadores, listado con filtros, traslados
 * pendientes de firma y catálogos (categorías, sedes y sitios).
 */
@Component({
  selector: 'app-assets-page',
  standalone: true,
  imports: [
    CurrencyPipe, DatePipe, RouterLink, ReactiveFormsModule, MatTabsModule, MatTableModule, MatPaginatorModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule,
    MatMenuModule, MatCheckboxModule, PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective,
    ToneChipComponent,
  ],
  templateUrl: './assets-page.component.html',
  styleUrl: './assets-page.component.scss',
})
export class AssetsPageComponent implements OnInit {
  private svc = inject(AssetsService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  store = inject(AssetCatalogStore);

  readonly statusTone = ASSET_STATUS_TONE;
  selectedTab = signal(0);

  // ── Inventario ────────────────────────────────────────────────────────────
  assets = signal<Asset[]>([]);
  meta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  stats = signal<AssetStatistics | null>(null);
  loading = signal(false);
  selected = signal<Set<number>>(new Set());
  private loadSub?: Subscription;

  cols = ['select', 'code', 'name', 'category', 'location', 'responsible', 'status', 'next_maintenance', 'actions'];

  filters = this.fb.group({
    search: [''],
    asset_type: ['' as AssetType | ''],
    category_id: [null as number | null],
    site_id: [null as number | null],
    status: ['' as AssetStatus | ''],
    maintenance_overdue: [false],
    include_retired: [false],
  });

  // ── Traslados ─────────────────────────────────────────────────────────────
  transfers = signal<AssetTransfer[]>([]);
  transfersMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  loadingTransfers = signal(false);
  transferStatus = signal<AssetTransferStatus | ''>('pending_signature');
  transferCols = ['asset', 'type', 'route', 'requested', 'status', 'actions'];

  // ── Catálogos ─────────────────────────────────────────────────────────────
  categories = signal<AssetCategory[]>([]);
  sites = signal<AssetSite[]>([]);
  categoryCols = ['code', 'name', 'type', 'status', 'actions'];

  ngOnInit(): void {
    this.store.load().subscribe();

    const tab = TAB_KEYS.indexOf(this.route.snapshot.queryParamMap.get('tab') as typeof TAB_KEYS[number]);
    this.selectedTab.set(Math.max(tab, 0));

    this.load();
    this.loadStats();
    this.filters.valueChanges.pipe(debounceTime(300)).subscribe(() => {
      this.load(1);
      this.loadStats();
    });

    this.loadTransfers();
    this.loadCatalogs();
  }

  onTabChange(index: number): void {
    this.selectedTab.set(index);
    this.router.navigate([], { queryParams: { tab: TAB_KEYS[index] }, replaceUrl: true });
  }

  // ── Inventario ────────────────────────────────────────────────────────────

  private currentFilters(): AssetFilters {
    const f = this.filters.getRawValue();
    return {
      search: f.search || undefined,
      asset_type: f.asset_type || undefined,
      category_id: f.category_id,
      site_id: f.site_id,
      status: f.status || undefined,
      maintenance_overdue: f.maintenance_overdue ?? false,
      include_retired: f.include_retired ?? false,
    };
  }

  load(page = this.meta().current_page): void {
    this.loading.set(true);
    this.loadSub?.unsubscribe();
    this.loadSub = this.svc.list({ ...this.currentFilters(), page, per_page: this.meta().per_page }).subscribe({
      next: res => {
        this.assets.set(res.data);
        this.meta.set(res.meta);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.snack.open(err.error?.message ?? 'Error al cargar los activos', 'OK', { duration: 4000 });
      },
    });
  }

  loadStats(): void {
    const f = this.filters.getRawValue();
    this.svc.statistics({ site_id: f.site_id, asset_type: f.asset_type || undefined, category_id: f.category_id })
      .subscribe({ next: res => this.stats.set(res.data), error: () => this.stats.set(null) });
  }

  onPage(e: PageEvent): void {
    this.meta.update(m => ({ ...m, per_page: e.pageSize }));
    this.load(e.pageIndex + 1);
  }

  /** Marca · modelo · serial. */
  assetSubtitle(asset: Asset): string {
    return [asset.brand, asset.model, asset.serial].filter(Boolean).join(' · ') || '—';
  }

  filterByStatus(status: AssetStatus | ''): void {
    this.filters.patchValue({ status, include_retired: status === 'retired' });
  }

  clearFilters(): void {
    this.filters.reset({ search: '', asset_type: '', category_id: null, site_id: null, status: '', maintenance_overdue: false, include_retired: false });
  }

  toggleSelected(id: number): void {
    this.selected.update(set => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  toggleAll(checked: boolean): void {
    this.selected.set(checked ? new Set(this.assets().map(a => a.id)) : new Set());
  }

  openForm(asset?: Asset): void {
    this.dialog.open(AssetFormDialogComponent, { data: asset ?? null, width: '760px', maxWidth: '96vw' })
      .afterClosed().subscribe(saved => {
        if (!saved) return;
        this.snack.open(asset ? 'Activo actualizado' : `Activo ${saved.code} registrado`, 'Ver ficha', { duration: 5000 })
          .onAction().subscribe(() => this.router.navigate(['/assets', saved.id]));
        this.load();
        this.loadStats();
      });
  }

  openTransfer(asset: Asset): void {
    this.dialog.open(AssetTransferDialogComponent, { data: asset, width: '760px', maxWidth: '96vw', disableClose: true })
      .afterClosed().subscribe(transfer => {
        if (!transfer) return;
        this.snack.open(transfer.status === 'pending_signature' ? 'Traslado pendiente de firma' : 'Traslado aplicado', 'OK', { duration: 4000 });
        this.load();
        this.loadStats();
        this.loadTransfers();
      });
  }

  openImport(): void {
    this.dialog.open(AssetImportDialogComponent, { width: '760px', maxWidth: '96vw' })
      .afterClosed().subscribe(imported => {
        if (!imported) return;
        this.store.refresh();
        this.load(1);
        this.loadStats();
        this.loadCatalogs();
      });
  }

  printLabels(): void {
    const ids = [...this.selected()];
    if (!ids.length) return;
    this.svc.openLabels(ids).subscribe({
      error: err => this.snack.open(err.error?.message ?? 'No fue posible generar las etiquetas', 'OK', { duration: 4000 }),
    });
  }

  exportExcel(): void {
    this.svc.exportInventory(this.currentFilters()).subscribe({
      error: err => this.snack.open(err.error?.message ?? 'No fue posible exportar', 'OK', { duration: 4000 }),
    });
  }

  delete(asset: Asset): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar activo',
        message: `¿Eliminar ${asset.code} — ${asset.name}? Úselo solo para registros creados por error; si el activo tiene historia, regístrelo como baja.`,
        confirmColor: 'warn',
        confirmText: 'Eliminar',
      },
      width: '480px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.delete(asset.id).subscribe({
        next: () => { this.snack.open('Activo eliminado', 'OK', { duration: 3000 }); this.load(); this.loadStats(); },
        error: err => this.snack.open(err.error?.message ?? 'No fue posible eliminar', 'OK', { duration: 5000 }),
      });
    });
  }

  // ── Traslados ─────────────────────────────────────────────────────────────

  loadTransfers(page = 1): void {
    this.loadingTransfers.set(true);
    this.svc.transfers({ status: this.transferStatus(), page, per_page: this.transfersMeta().per_page }).subscribe({
      next: res => {
        this.transfers.set(res.data);
        this.transfersMeta.set(res.meta);
        this.loadingTransfers.set(false);
      },
      error: () => this.loadingTransfers.set(false),
    });
  }

  setTransferStatus(status: AssetTransferStatus | ''): void {
    this.transferStatus.set(status);
    this.loadTransfers(1);
  }

  onTransfersPage(e: PageEvent): void {
    this.transfersMeta.update(m => ({ ...m, per_page: e.pageSize }));
    this.loadTransfers(e.pageIndex + 1);
  }

  confirmTransfer(transfer: AssetTransfer): void {
    this.dialog.open(AssetTransferConfirmDialogComponent, { data: transfer, width: '640px', maxWidth: '96vw', disableClose: true })
      .afterClosed().subscribe(done => {
        if (!done) return;
        this.snack.open('Traslado confirmado', 'Ver acta', { duration: 5000 })
          .onAction().subscribe(() => this.openAct(done));
        this.loadTransfers(this.transfersMeta().current_page);
        this.load();
        this.loadStats();
      });
  }

  cancelTransfer(transfer: AssetTransfer): void {
    this.dialog.open(ReasonDialogComponent, {
      data: { title: 'Cancelar traslado', message: `${transfer.asset.code} — ${transfer.type_label}`, confirmText: 'Cancelar traslado' },
      width: '460px',
    }).afterClosed().subscribe(reason => {
      if (!reason) return;
      this.svc.cancelTransfer(transfer.id, reason).subscribe({
        next: () => { this.snack.open('Traslado cancelado', 'OK', { duration: 3000 }); this.loadTransfers(); this.loadStats(); },
        error: err => this.snack.open(err.error?.message ?? 'No fue posible cancelar', 'OK', { duration: 4000 }),
      });
    });
  }

  openAct(transfer: AssetTransfer): void {
    this.svc.openTransferAct(transfer.id).subscribe({
      error: err => this.snack.open(err.error?.message ?? 'No fue posible abrir el acta', 'OK', { duration: 4000 }),
    });
  }

  // ── Catálogos ─────────────────────────────────────────────────────────────

  loadCatalogs(): void {
    this.svc.categories().subscribe({ next: res => this.categories.set(res.data) });
    this.svc.sites().subscribe({ next: res => this.sites.set(res.data) });
  }

  private afterCatalogChange(message: string): void {
    this.snack.open(message, 'OK', { duration: 3000 });
    this.loadCatalogs();
    this.store.refresh();
  }

  openCategory(category?: AssetCategory): void {
    this.dialog.open(AssetCategoryDialogComponent, { data: category ?? null, width: '480px' })
      .afterClosed().subscribe(saved => saved && this.afterCatalogChange(category ? 'Categoría actualizada' : 'Categoría creada'));
  }

  openSite(site?: AssetSite): void {
    this.dialog.open(AssetSiteDialogComponent, { data: site ?? null, width: '480px' })
      .afterClosed().subscribe(saved => saved && this.afterCatalogChange(site ? 'Sede actualizada' : 'Sede creada'));
  }

  openPlace(site: AssetSite, place?: NonNullable<AssetSite['places']>[number]): void {
    this.dialog.open(AssetPlaceDialogComponent, { data: { site, place: place ?? null }, width: '480px' })
      .afterClosed().subscribe(saved => saved && this.afterCatalogChange(place ? 'Sitio actualizado' : 'Sitio creado'));
  }

  deleteCatalog(kind: 'category' | 'site' | 'place', id: number, name: string): void {
    const labels = { category: 'la categoría', site: 'la sede', place: 'el sitio' };
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar', message: `¿Eliminar ${labels[kind]} "${name}"?`, confirmColor: 'warn', confirmText: 'Eliminar' },
      width: '440px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      const request$ = kind === 'category' ? this.svc.deleteCategory(id) : kind === 'site' ? this.svc.deleteSite(id) : this.svc.deletePlace(id);
      request$.subscribe({
        next: () => this.afterCatalogChange('Registro eliminado'),
        error: err => this.snack.open(err.error?.message ?? 'No fue posible eliminar', 'OK', { duration: 5000 }),
      });
    });
  }
}

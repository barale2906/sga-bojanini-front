import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InventoryService, Batch, StockItem, Movement } from './inventory.service';
import { WarehouseService, Warehouse, Location } from '../warehouse/warehouse.service';
import { CatalogService, Product } from '../catalog/catalog.service';
import { PaginationMeta } from '../../core/models/api-response.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { MovementFormDialogComponent } from './movements/movement-form-dialog.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../shared/adapters/es-date.adapter';

interface MovementRow {
  id: number | null;
  movement_type: string;
  product_name: string;
  warehouse_name: string;
  quantity: number;
  user_name: string;
  date: string;
}

const MOV_TYPE_LABELS: Record<string, string> = {
  entry: 'Entrada',
  exit: 'Salida',
  transfer: 'Traslado',
  adjustment: 'Ajuste',
  return: 'Devolución',
  expiration_write_off: 'Baja por vencimiento',
  loss: 'Baja por pérdida',
};

const MOV_TYPE_ICONS: Record<string, string> = {
  entry: 'add_box',
  exit: 'output',
  transfer: 'swap_horiz',
  adjustment: 'tune',
  return: 'undo',
  expiration_write_off: 'delete_sweep',
  loss: 'remove_circle',
};

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    CommonModule, ReactiveFormsModule, MatTabsModule, MatTableModule, MatSortModule,
    MatPaginatorModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatChipsModule, MatTooltipModule,
    MatDatepickerModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective, DateFormatPipe,
  ],
  templateUrl: './inventory-page.component.html',
  styleUrl: './inventory-page.component.scss',
})
export class InventoryPageComponent implements OnInit {
  private svc = inject(InventoryService);
  private wSvc = inject(WarehouseService);
  private cSvc = inject(CatalogService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  // Batches
  batches = signal<Batch[]>([]);
  batchMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  expiringBatches = signal<Batch[]>([]);
  batchCols = ['actions', 'lot_number', 'product', 'status', 'quantity', 'expiration_date', 'days'];
  batchFilters = this.fb.group({ status: [''], warehouse_id: [''] });

  // Stock
  stock = signal<StockItem[]>([]);
  stockMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  lowStock = signal<StockItem[]>([]);
  stockCols = ['product', 'warehouse', 'available', 'total', 'last_movement'];
  stockFilters = this.fb.group({ warehouse_id: [''], product_id: [''] });

  // Movements
  moveDisplayRows = signal<MovementRow[]>([]);
  moveMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  moveCols = ['type', 'product', 'warehouse', 'quantity', 'user', 'created_at'];
  moveFilters = this.fb.group({
    movement_type: [''],
    warehouse_id: [''],
    product_id: [''],
    date_from: [null as Date | null],
    date_to: [null as Date | null],
  });
  moveSort = signal<Sort>({ active: '', direction: '' });

  moveSortedData = computed(() => {
    const { active, direction } = this.moveSort();
    const data = [...this.moveDisplayRows()];
    if (!active || !direction) return data;
    return data.sort((a, b) => {
      let cmp = 0;
      switch (active) {
        case 'type':       cmp = a.movement_type.localeCompare(b.movement_type); break;
        case 'product':    cmp = a.product_name.localeCompare(b.product_name); break;
        case 'warehouse':  cmp = a.warehouse_name.localeCompare(b.warehouse_name); break;
        case 'quantity':   cmp = a.quantity - b.quantity; break;
        case 'user':       cmp = a.user_name.localeCompare(b.user_name); break;
        case 'created_at': cmp = a.date.localeCompare(b.date); break;
      }
      return direction === 'asc' ? cmp : -cmp;
    });
  });

  // Data
  warehouses = signal<Warehouse[]>([]);
  products = signal<Product[]>([]);
  locations = signal<Location[]>([]);
  loading = signal(false);

  movTypes = [
    { value: 'entry',                label: '↓ Entrada' },
    { value: 'exit',                 label: '↑ Salida' },
    { value: 'transfer',             label: '↔ Traslado' },
    { value: 'adjustment',           label: '⚖ Ajuste' },
    { value: 'return',               label: '↩ Devolución' },
    { value: 'expiration_write_off', label: '🗑 Baja vencimiento' },
    { value: 'loss',                 label: '⚠ Baja pérdida' },
  ];

  ngOnInit(): void {
    this.wSvc.getWarehouses().subscribe({ next: r => this.warehouses.set(r.data), error: () => {} });
    this.cSvc.getProducts({ per_page: 200 }).subscribe({ next: r => this.products.set(r.data), error: () => {} });
    this.loadBatches(); this.loadExpiringBatches(); this.loadStock(); this.loadLowStock(); this.loadMovements();
    this.batchFilters.valueChanges.subscribe(() => this.loadBatches(1));
    this.stockFilters.valueChanges.subscribe(() => this.loadStock(1));
    this.moveFilters.valueChanges.subscribe(() => this.loadMovements(1));
  }

  loadBatches(page = 1): void {
    const { status, warehouse_id } = this.batchFilters.value;
    this.svc.getBatches({ status: status || undefined, warehouse_id: warehouse_id ? Number(warehouse_id) : undefined, page, per_page: this.batchMeta().per_page }).subscribe({
      next: r => { this.batches.set(r.data); this.batchMeta.set(r.meta); },
      error: () => {},
    });
  }

  loadExpiringBatches(): void {
    this.svc.getExpiringBatches().subscribe({ next: r => this.expiringBatches.set(r.data), error: () => {} });
  }

  loadStock(page = 1): void {
    const { warehouse_id, product_id } = this.stockFilters.value;
    this.loading.set(true);
    this.svc.getStock({ warehouse_id: warehouse_id ? Number(warehouse_id) : undefined, product_id: product_id ? Number(product_id) : undefined, page, per_page: this.stockMeta().per_page }).subscribe({
      next: r => { this.stock.set(r.data); this.stockMeta.set(r.meta); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadLowStock(): void {
    this.svc.getLowStock().subscribe({ next: r => this.lowStock.set(r.data), error: () => {} });
  }

  loadMovements(page = 1): void {
    const { movement_type, warehouse_id, product_id, date_from, date_to } = this.moveFilters.value;
    this.svc.getMovements({
      movement_type: movement_type || undefined,
      warehouse_id:  warehouse_id  ? Number(warehouse_id)  : undefined,
      product_id:    product_id    ? Number(product_id)    : undefined,
      date_from:     date_from     ? this.toApiDate(date_from)  : undefined,
      date_to:       date_to       ? this.toApiDate(date_to)    : undefined,
      page,
      per_page: this.moveMeta().per_page,
    }).subscribe({
      next: r => {
        const rows: MovementRow[] = r.data.map(m => ({
          id: m.id,
          movement_type: m.movement_type,
          product_name: m.product_name || m.product?.name || '—',
          warehouse_name: this.getWarehouseName(m.warehouse_id),
          quantity: m.quantity,
          user_name: m.user_name || '—',
          date: m.created_at,
        }));
        this.moveDisplayRows.set(rows);
        this.moveMeta.set(r.meta);
      },
      error: () => {},
    });
  }

  openMovement(type: string): void {
    const needsWide = type === 'entry' || type === 'transfer';
    this.dialog.open(MovementFormDialogComponent, {
      data: { type, warehouses: this.warehouses(), products: this.products(), inventorySvc: this.svc },
      width: needsWide ? '760px' : '620px', maxWidth: '95vw', maxHeight: '94vh',
    }).afterClosed().subscribe(result => {
      const ok = result === true || (result && result.ok);
      if (!ok) return;

      this.loadStock(); this.loadMovements(); this.loadBatches();

      if (type === 'exit' && result?.batch) {
        const b = result.batch;
        const loc = b.locations?.[0];
        const locStr = loc
          ? `${loc.location_name}${loc.zone ? ' · ' + loc.zone.zone_name : ''}`
          : 'sin ubicación';
        this.snack.open(
          `Salida registrada — Lote: ${b.lot_number} — Ubicación: ${locStr}`,
          'OK',
          { duration: 6000 }
        );
      } else {
        this.snack.open('Movimiento registrado', 'OK', { duration: 3000 });
      }
    });
  }

  writeOff(batch: Batch): void {
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Dar de baja lote', message: `¿Dar de baja el lote "${batch.lot_number}" por vencimiento? Esto eliminará ${batch.quantity_available} unidades del inventario.`, confirmColor: 'warn', confirmText: 'Dar de baja' }, width: '460px' })
      .afterClosed().subscribe(ok => {
        if (ok) this.svc.writeOff(batch.id).subscribe({ next: () => { this.snack.open('Lote dado de baja', 'OK', { duration: 3000 }); this.loadBatches(); this.loadStock(); }, error: () => {} });
      });
  }

  onBatchPage(e: PageEvent): void { this.batchMeta.update(m => ({ ...m, per_page: e.pageSize })); this.loadBatches(e.pageIndex + 1); }
  onStockPage(e: PageEvent): void { this.stockMeta.update(m => ({ ...m, per_page: e.pageSize })); this.loadStock(e.pageIndex + 1); }
  onMovePage(e: PageEvent): void  { this.moveMeta.update(m => ({ ...m, per_page: e.pageSize })); this.loadMovements(e.pageIndex + 1); }
  onMoveSort(sort: Sort): void    { this.moveSort.set(sort); }

  getStatusBadge(status: string): string {
    const m: Record<string, string> = { active: 'badge--on', expired: 'badge--error', depleted: 'badge--gray' };
    return m[status] || '';
  }

  getMovIcon(type: string): string {
    return MOV_TYPE_ICONS[type] || 'swap_vert';
  }

  getMovTypeLabel(type: string): string {
    return MOV_TYPE_LABELS[type] || type;
  }

  getWarehouseName(warehouseId: number): string {
    return this.warehouses().find(w => w.id === warehouseId)?.name || '—';
  }

  private toApiDate(date: Date): string {
    return date.toISOString().substring(0, 10);
  }
}

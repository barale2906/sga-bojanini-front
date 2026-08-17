import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InventoryService, Batch, StockItem, Movement, MovementSignatureRecord, MovementDocument } from './inventory.service';
import { AuthService } from '../../core/services/auth.service';
import { MovementPdfService, MovementPdfSignature } from '../../shared/services/movement-pdf.service';
import { WarehouseService, Warehouse, Location } from '../warehouse/warehouse.service';
import { CatalogService, Category, Product } from '../catalog/catalog.service';
import { PaginationMeta } from '../../core/models/api-response.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { ProductSearchComponent } from '../../shared/components/product-search/product-search.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { MovementFormDialogComponent } from './movements/movement-form-dialog.component';
import { ExitWizardDialogComponent } from './movements/exit-wizard-dialog.component';
import { WarehouseTransferDialogComponent } from './movements/warehouse-transfer-dialog.component';
import { InitialEntriesImportDialogComponent } from './initial-entries/initial-entries-import-dialog.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { SendDocumentEmailDialogComponent, SendDocumentEmailDialogData } from '../../shared/components/send-document-email-dialog/send-document-email-dialog.component';
import { PurchaseReceiveContextService } from '../purchasing/purchase-receive-context.service';
import { PurchaseOrder } from '../purchasing/purchasing.service';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../shared/adapters/es-date.adapter';

interface MovementRow {
  id: number | null;
  movement_document_id: number | null;
  doc_number: string | null;
  doc_status: 'pending_signature' | 'confirmed' | null;
  movement_type: string;
  product_name: string;
  category_name: string;
  lot_number: string | null;
  expiration_date: string | null;
  warehouse_name: string;
  warehouse_to_name: string | null;
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
    MatDatepickerModule, MatProgressSpinnerModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective, DateFormatPipe,
    ProductSearchComponent,
  ],
  templateUrl: './inventory-page.component.html',
  styleUrl: './inventory-page.component.scss',
})
export class InventoryPageComponent implements OnInit {
  private svc          = inject(InventoryService);
  private wSvc         = inject(WarehouseService);
  private cSvc         = inject(CatalogService);
  private dialog       = inject(MatDialog);
  private snack        = inject(MatSnackBar);
  private fb           = inject(FormBuilder);
  private router       = inject(Router);
  private poReceiveCtx = inject(PurchaseReceiveContextService);
  private movPdfSvc    = inject(MovementPdfService);
  protected authSvc    = inject(AuthService);

  // Batches
  batches = signal<Batch[]>([]);
  batchMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  expiringBatches = signal<Batch[]>([]);
  batchCols = ['lot_number', 'product', 'category', 'warehouse', 'status', 'quantity', 'expiration_date', 'days'];
  batchFilters = this.fb.group({ status: [''], warehouse_id: [''], category_id: [''], generic_product_id: [''] });
  batchFilterProduct = signal<Product | null>(null);

  // Stock
  stock = signal<StockItem[]>([]);
  stockMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  lowStock = signal<StockItem[]>([]);
  stockCols = ['product', 'category', 'warehouse', 'available', 'total'];
  stockFilters = this.fb.group({ warehouse_id: [''], category_id: [''], generic_product_id: [''] });

  // Movements
  moveDisplayRows = signal<MovementRow[]>([]);
  moveMeta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  moveCols = ['type', 'product', 'category', 'lot_number', 'expiration_date', 'warehouse', 'quantity', 'user', 'created_at'];
  moveFilters = this.fb.group({
    movement_type: [''],
    warehouse_id: [''],
    category_id: [''],
    generic_product_id: [''],
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
  categories = signal<Category[]>([]);
  locations = signal<Location[]>([]);
  loading = signal(false);

  // Producto seleccionado en cada filtro (para sincronizar con app-product-search)
  stockFilterProduct = signal<Product | null>(null);
  moveFilterProduct  = signal<Product | null>(null);

  onBatchFilterProduct(p: Product | null): void {
    this.batchFilterProduct.set(p);
    this.batchFilters.patchValue({ generic_product_id: p ? String(p.id) : '' });
  }

  onStockFilterProduct(p: Product | null): void {
    this.stockFilterProduct.set(p);
    this.stockFilters.patchValue({ generic_product_id: p ? String(p.id) : '' });
  }

  onMoveFilterProduct(p: Product | null): void {
    this.moveFilterProduct.set(p);
    this.moveFilters.patchValue({ generic_product_id: p ? String(p.id) : '' });
  }
  loadingPdf = signal<number | null>(null);

  readonly PRINTABLE_TYPES = new Set(['exit', 'transfer', 'adjustment', 'return', 'loss']);

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
    const pendingOrder = this.poReceiveCtx.consumeOrder();

    // Carga inicial de almacenes, productos y categorías; si hay OC pendiente, esperar antes de abrir diálogos
    forkJoin([
      this.wSvc.getWarehouses(),
      this.cSvc.getProducts({ per_page: 200 }),
      this.cSvc.getCategories({ is_active: '1' }),
    ]).subscribe({
      next: ([wRes, pRes, cRes]) => {
        this.warehouses.set(wRes.data);
        this.products.set(pRes.data);
        this.categories.set(cRes.data);
        if (pendingOrder) {
          this._openPoReceiveSequentially(pendingOrder);
        }
      },
      error: () => {},
    });

    this.loadBatches(); this.loadExpiringBatches(); this.loadStock(); this.loadLowStock(); this.loadMovements();
    this.batchFilters.valueChanges.subscribe(() => this.loadBatches(1));
    this.stockFilters.valueChanges.subscribe(() => this.loadStock(1));
    this.moveFilters.valueChanges.subscribe(() => this.loadMovements(1));
  }

  private _openPoReceiveSequentially(order: PurchaseOrder): void {
    const items = order.items ?? [];
    if (!items.length) return;

    const openItem = (idx: number): void => {
      if (idx >= items.length) return;
      const item = items[idx];
      const pending = item.quantity_requested - (item.quantity_received ?? 0);
      // Saltar ítems ya completamente recibidos
      if (pending <= 0) { openItem(idx + 1); return; }

      this.dialog.open(MovementFormDialogComponent, {
        data: {
          type: 'entry',
          warehouses: this.warehouses(),
          products: this.products(),
          inventorySvc: this.svc,
          purchaseOrder: order,
          purchaseOrderItem: item,
          itemIndex: idx,
          itemTotal: items.length,
        },
        width: '820px', maxWidth: '96vw', maxHeight: '94vh',
      }).afterClosed().subscribe(result => {
        const ok = result === true || result?.ok;
        if (ok) {
          this.loadStock(); this.loadMovements(); this.loadBatches();
          this.snack.open(
            items.length > 1 ? `Entrada ítem ${idx + 1}/${items.length} registrada` : 'Entrada registrada',
            'OK', { duration: 3000 },
          );
        }
        openItem(idx + 1);
      });
    };

    openItem(0);
  }

  loadBatches(page = 1): void {
    const { status, warehouse_id, category_id, generic_product_id } = this.batchFilters.value;
    this.svc.getBatches({
      status:             status             || undefined,
      warehouse_id:       warehouse_id       ? Number(warehouse_id)      : undefined,
      category_id:        category_id        ? Number(category_id)       : undefined,
      generic_product_id: generic_product_id ? Number(generic_product_id): undefined,
      page,
      per_page: this.batchMeta().per_page,
    }).subscribe({
      next: r => { this.batches.set(r.data ?? []); this.batchMeta.set(r.meta); },
      error: () => {},
    });
  }

  loadExpiringBatches(): void {
    this.svc.getExpiringBatches().subscribe({ next: r => this.expiringBatches.set(r.data ?? []), error: () => {} });
  }

  loadStock(page = 1): void {
    const { warehouse_id, category_id, generic_product_id } = this.stockFilters.value;
    this.loading.set(true);
    this.svc.getStock({
      warehouse_id:       warehouse_id       ? Number(warehouse_id)       : undefined,
      category_id:        category_id        ? Number(category_id)        : undefined,
      generic_product_id: generic_product_id ? Number(generic_product_id) : undefined,
      page,
      per_page: this.stockMeta().per_page,
    }).subscribe({
      next: r => { this.stock.set((r.data ?? []).filter(s => s.available_quantity > 0)); this.stockMeta.set(r.meta); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadLowStock(): void {
    this.svc.getLowStock().subscribe({ next: r => this.lowStock.set(r.data ?? []), error: () => {} });
  }

  loadMovements(page = 1): void {
    const { movement_type, warehouse_id, category_id, generic_product_id, date_from, date_to } = this.moveFilters.value;
    this.svc.getMovements({
      movement_type:      movement_type      || undefined,
      warehouse_id:       warehouse_id       ? Number(warehouse_id)       : undefined,
      category_id:        category_id        ? Number(category_id)        : undefined,
      generic_product_id: generic_product_id ? Number(generic_product_id) : undefined,
      date_from:     date_from     ? this.toApiDate(date_from)  : undefined,
      date_to:       date_to       ? this.toApiDate(date_to)    : undefined,
      page,
      per_page: this.moveMeta().per_page,
    }).subscribe({
      next: r => {
        const rows: MovementRow[] = (r.data ?? []).map(m => ({
          id: m.id,
          movement_document_id: m.movement_document_id ?? null,
          doc_number: null,
          doc_status: m.status ?? null,
          movement_type: m.movement_type,
          // product_name ya no siempre viene en el listado (nuevo modelo genérico+variante);
          // variant_lab_brand es el fallback cuando el backend no carga el genérico completo.
          product_name: m.product_name || m.product?.name || m.variant_lab_brand || '—',
          category_name: m.category_name ?? '—',
          lot_number: m.batch_lot_number ?? null,
          expiration_date: m.batch_expiration_date ?? null,
          // m.warehouse?.name evita la race condition con el forkJoin de almacenes en ngOnInit.
          warehouse_name: m.warehouse?.name ?? this.getWarehouseName(m.warehouse_id),
          warehouse_to_name: m.warehouse_to_name ?? (m.warehouse_to_id ? this.getWarehouseName(m.warehouse_to_id) : null),
          quantity: m.quantity,
          user_name: m.user_name || '—',
          date: m.movement_date ?? m.created_at,
        }));
        this.moveDisplayRows.set(rows);
        this.moveMeta.set(r.meta);
      },
      error: () => {},
    });
  }

  openMovement(type: string): void {
    if (type === 'exit') {
      this._openExitWizard();
      return;
    }

    if (type === 'transfer') {
      this._openTransferDialog();
      return;
    }

    const needsWide = type === 'entry';
    this.dialog.open(MovementFormDialogComponent, {
      data: { type, warehouses: this.warehouses(), products: this.products(), inventorySvc: this.svc },
      width: needsWide ? '760px' : '620px', maxWidth: '95vw', maxHeight: '94vh',
    }).afterClosed().subscribe(result => {
      const ok = result === true || (result && result.ok);
      if (!ok) return;
      this.loadStock(); this.loadMovements(); this.loadBatches();
      this.snack.open('Movimiento registrado', 'OK', { duration: 3000 });
    });
  }

  private _openTransferDialog(): void {
    this.dialog.open(WarehouseTransferDialogComponent, {
      data: { warehouses: this.warehouses(), products: this.products(), inventorySvc: this.svc, catalogSvc: this.cSvc },
      width: '720px', maxWidth: '96vw', maxHeight: '94vh',
    }).afterClosed().subscribe(result => {
      if (!result) return;
      this.loadStock(); this.loadMovements(); this.loadBatches();
      this.snack.open('Traslado registrado exitosamente', 'OK', { duration: 3500 });
    });
  }

  private _openExitWizard(): void {
    this.dialog.open(ExitWizardDialogComponent, {
      data: { warehouses: this.warehouses(), products: this.products(), inventorySvc: this.svc },
      width: '95vw', maxWidth: '1020px', height: '93vh', maxHeight: '93vh',
    }).afterClosed().subscribe(result => {
      if (!result?.ok) return;
      this.loadStock(); this.loadMovements(); this.loadBatches();
      const msg = result.withRecords
        ? 'Salida registrada con procedimientos del paciente'
        : 'Salida de stock registrada';
      this.snack.open(msg, 'OK', { duration: 4000 });
    });
  }

  goToPatientRecords(): void {
    this.router.navigate(['/inventory/patient-records']);
  }

  goToClinicalTemplates(): void {
    this.router.navigate(['/inventory/clinical-templates']);
  }

  openInitialEntriesImport(): void {
    this.dialog.open(InitialEntriesImportDialogComponent, {
      data: { warehouses: this.warehouses() },
      width: '600px', maxWidth: '96vw', maxHeight: '94vh',
    }).afterClosed().subscribe(imported => {
      if (!imported) return;
      this.loadStock(); this.loadMovements(); this.loadBatches();
      this.snack.open('Carga masiva de entradas finalizada', 'OK', { duration: 3500 });
    });
  }

  printMovement(row: MovementRow): void {
    if (!row.id || this.loadingPdf() !== null) return;
    this.loadingPdf.set(row.id);

    const toSig = (rec: MovementSignatureRecord): MovementPdfSignature => ({
      signer_name:     rec.signer_name,
      signer_document: rec.signer_document,
      signature_data:  rec.signature_data ?? '',
      signed_at:       rec.signed_at,
    });

    // Camino principal: obtener el documento completo (todos los productos + firmas)
    if (row.movement_document_id) {
      this.svc.getMovementDocument(row.movement_document_id).subscribe({
        next: docRes => {
          const doc: MovementDocument = docRes.data;
          const sigs  = doc.signatures ?? [];
          const deliv = sigs.find(s => s.role === 'delivered_by') ?? null;
          const recv  = sigs.find(s => s.role === 'received_by')  ?? null;
          this.loadingPdf.set(null);
          this.movPdfSvc.generateAndPrint({
            movement_type:     doc.document_type,
            doc_id:            doc.id,
            doc_number:        doc.document_number,
            date:              doc.movement_date ?? doc.created_at,
            user_name:         doc.user_name,
            warehouse_name:    doc.warehouse_name ?? row.warehouse_name,
            warehouse_to_name: doc.warehouse_to_name,
            reason:            doc.reason,
            cost_center_name:  doc.cost_center?.name ?? null,
            lines: (doc.movements ?? []).map(m => ({
              product_name:    m.product_name ?? '',
              lot_number:      m.batch_lot_number ?? null,
              expiration_date: m.batch_expiration_date ?? null,
              quantity:        m.quantity,
            })),
            delivered_by: deliv ? toSig(deliv) : null,
            received_by:  recv  ? toSig(recv)  : null,
          });
        },
        error: () => {
          this.loadingPdf.set(null);
          this.snack.open('No se pudo cargar el comprobante para imprimir', 'OK', { duration: 3000 });
        },
      });
      return;
    }

    // Fallback: movimiento sin documento (ajustes/bajas/devoluciones sin movement_document_id)
    this.svc.getMovement(row.id).subscribe({
      next: res => {
        const m = res.data;
        const hasSignatures = m.status === 'confirmed' && m.signatures && m.signatures.length > 0;
        const deliveredSig$ = hasSignatures
          ? this.svc.getMovementSignature(m.movement_document_id ?? m.id, 'delivered_by').pipe(map(r => toSig(r.data)), catchError(() => of(null)))
          : of(null);
        const receivedSig$ = hasSignatures
          ? this.svc.getMovementSignature(m.movement_document_id ?? m.id, 'received_by').pipe(map(r => toSig(r.data)), catchError(() => of(null)))
          : of(null);

        forkJoin([deliveredSig$, receivedSig$]).subscribe(([deliveredBy, receivedBy]) => {
          this.loadingPdf.set(null);
          this.movPdfSvc.generateAndPrint({
            movement_type:     m.movement_type,
            doc_id:            m.movement_document_id ?? m.id,
            date:              m.movement_date ?? m.created_at,
            user_name:         m.user_name,
            warehouse_name:    row.warehouse_name,
            warehouse_to_name: row.warehouse_to_name,
            reason:            m.reason,
            cost_center_name:  m.cost_center?.name ?? null,
            lines: [{ product_name: m.product_name || m.variant_lab_brand || row.product_name || '', lot_number: m.batch_lot_number, expiration_date: m.batch_expiration_date, quantity: m.quantity }],
            delivered_by: deliveredBy,
            received_by:  receivedBy,
          });
        });
      },
      error: () => {
        this.loadingPdf.set(null);
        this.snack.open('No se pudo cargar el movimiento para imprimir', 'OK', { duration: 3000 });
      },
    });
  }

  openSendEmail(row: MovementRow): void {
    if (!row.movement_document_id) return;
    this.dialog.open(SendDocumentEmailDialogComponent, {
      data: {
        document_id:     row.movement_document_id,
        document_number: row.doc_number ?? `#${row.movement_document_id}`,
        inventorySvc:    this.svc,
      } satisfies SendDocumentEmailDialogData,
      width: '540px', maxWidth: '96vw', maxHeight: '90vh',
      disableClose: true,
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

  getBatchRowClass(batch: Batch): string {
    const days = batch.days_until_expiry;
    if (batch.status === 'expired' || (days !== null && days !== undefined && days < 0)) return 'row--expired';
    if (days !== null && days !== undefined && days >= 0 && days < 30) return 'row--expiring';
    return '';
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

import { Component, inject, signal, computed, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { InventoryService, BatchDetail, MovementDocument } from '../inventory.service';
import { WarehouseService, Warehouse, Location } from '../../warehouse/warehouse.service';
import { CatalogService, Product, ProductVariant } from '../../catalog/catalog.service';
import { MovementPdfService } from '../../../shared/services/movement-pdf.service';
import { MovementConfirmDialogComponent, MovementConfirmResult } from './movement-confirm-dialog.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ProductSearchComponent } from '../../../shared/components/product-search/product-search.component';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

interface TransferItem {
  // display
  product_name:    string;
  variant_label:   string;
  fefo:            BatchDetail[];          // lotes seleccionados (qty > 0)
  lotQtys:         Record<string, number>; // qty por lot_number
  qty_total:       number;
  loc_from_name:   string;
  loc_to_name:     string;
  // payload
  product_variant_id: number;
  location_from_id:   number | null;
  location_to_id:     number | null;
}

@Component({
  selector: 'app-transfer-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatProgressSpinnerModule, MatTooltipModule,
    PageHeaderComponent, ProductSearchComponent, FormErrorsComponent,
  ],
  templateUrl: './transfer-page.component.html',
  styleUrl: './transfer-page.component.scss',
})
export class TransferPageComponent implements OnInit {
  @ViewChild('productScanner') productScannerRef?: ProductSearchComponent;

  private router  = inject(Router);
  private invSvc  = inject(InventoryService);
  private wSvc    = inject(WarehouseService);
  private catSvc  = inject(CatalogService);
  private pdfSvc  = inject(MovementPdfService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);

  // ── Estado de página ──────────────────────────────────────────
  saving  = signal(false);
  errors  = signal<string[]>([]);

  // ── Cabecera: almacenes + fecha + motivo ──────────────────────
  warehouseFromId = signal<number | null>(null);
  warehouseToId   = signal<number | null>(null);
  movementDate    = signal('');
  reason          = signal('');

  warehouses        = signal<Warehouse[]>([]);
  locationsFrom     = signal<Location[]>([]);
  locationsTo       = signal<Location[]>([]);
  loadingLocFrom    = signal(false);
  loadingLocTo      = signal(false);

  readonly today = new Date().toISOString().split('T')[0];

  // ── Draft: producto en formulario ────────────────────────────
  draftProduct     = signal<Product | null>(null);
  draftVariants    = signal<ProductVariant[]>([]);
  draftVariantId   = signal<number | null>(null);
  draftFefo        = signal<BatchDetail[]>([]);
  draftLotQtys     = signal<Record<string, number>>({});
  draftLocFromId   = signal<number | null>(null);
  draftLocToId     = signal<number | null>(null);
  loadingVariants  = signal(false);
  loadingDraftFefo = signal(false);
  draftFetchError  = signal<string | null>(null);

  // ── Lista de ítems confirmados ────────────────────────────────
  items = signal<TransferItem[]>([]);

  // ── Computed helpers ──────────────────────────────────────────

  get headersComplete(): boolean {
    return !!(this.warehouseFromId() && this.warehouseToId() &&
              this.warehouseFromId() !== this.warehouseToId());
  }

  get warehouseFromName(): string {
    return this.warehouses().find(w => w.id === this.warehouseFromId())?.name ?? '';
  }

  get warehouseToName(): string {
    return this.warehouses().find(w => w.id === this.warehouseToId())?.name ?? '';
  }

  get draftVariant(): ProductVariant | null {
    return this.draftVariants().find(v => v.id === this.draftVariantId()) ?? null;
  }

  draftAvailableQty = computed((): number =>
    this.draftFefo().reduce((sum, b) => sum + b.quantity_available, 0)
  );

  draftTotalQty = computed((): number =>
    Object.values(this.draftLotQtys()).reduce((sum, q) => sum + (q || 0), 0)
  );

  canAdd = computed((): boolean => {
    if (!this.draftVariantId() || this.loadingDraftFefo() || !!this.draftFetchError()) return false;
    // Solo exigir ubicación destino si el almacén destino tiene ubicaciones cargadas
    if (this.locationsTo().length > 0 && !this.draftLocToId()) return false;
    const total = this.draftTotalQty();
    return total > 0 && total <= this.draftAvailableQty();
  });

  canSubmit = computed((): boolean =>
    this.headersComplete && this.items().length > 0 && !this.saving()
  );

  // ── Ciclo de vida ─────────────────────────────────────────────

  ngOnInit(): void {
    this.wSvc.getWarehouses().subscribe({ next: r => this.warehouses.set(r.data), error: () => {} });
  }

  // ── Almacén origen ────────────────────────────────────────────

  onWarehouseFromChange(id: number | null): void {
    this.warehouseFromId.set(id);
    this.locationsFrom.set([]);
    this.draftLocFromId.set(null);
    this._clearDraftStock();
    if (!id) return;
    this.loadingLocFrom.set(true);
    this.wSvc.getWarehouseLocations(id)
      .pipe(finalize(() => this.loadingLocFrom.set(false)))
      .subscribe({ next: r => this.locationsFrom.set(r.data), error: () => {} });
  }

  // ── Almacén destino ───────────────────────────────────────────

  onWarehouseToChange(id: number | null): void {
    this.warehouseToId.set(id);
    this.locationsTo.set([]);
    this.draftLocToId.set(null);
    if (!id) return;
    this.loadingLocTo.set(true);
    this.wSvc.getWarehouseLocations(id)
      .pipe(finalize(() => this.loadingLocTo.set(false)))
      .subscribe({ next: r => this.locationsTo.set(r.data), error: () => {} });
  }

  // ── Draft producto ────────────────────────────────────────────

  onDraftProductSelected(product: Product | null): void {
    this.draftProduct.set(product);
    this.draftVariants.set([]);
    this.draftVariantId.set(null);
    this._clearDraftStock();
    if (!product) return;
    this.loadingVariants.set(true);
    this.catSvc.getVariants(product.id).subscribe({
      next: r => {
        const activos = (r.data ?? []).filter((v: ProductVariant) => v.is_active);
        this.draftVariants.set(activos);
        if (activos.length === 1) this.onDraftVariantChange(activos[0].id);
        this.loadingVariants.set(false);
      },
      error: () => this.loadingVariants.set(false),
    });
  }

  onDraftVariantChange(variantId: number | null): void {
    this.draftVariantId.set(variantId);
    this._clearDraftStock();
    if (!variantId || !this.draftProduct() || !this.warehouseFromId()) return;
    this.loadingDraftFefo.set(true);
    this.invSvc.getProductBatches(this.draftProduct()!.id, true, this.warehouseFromId()!)
      .pipe(finalize(() => this.loadingDraftFefo.set(false)))
      .subscribe({
        next: r => {
          const available = r.data.filter((b: BatchDetail) => b.status === 'active' && b.quantity_available > 0);
          this.draftFefo.set(available);
          const qtys: Record<string, number> = {};
          for (const b of available) qtys[b.lot_number] = 0;
          this.draftLotQtys.set(qtys);
          if (!available.length) {
            this.draftFetchError.set(`Sin stock vigente de "${this.draftProduct()!.name}" en ${this.warehouseFromName}`);
          }
        },
        error: () => this.draftFetchError.set(`Error al verificar stock de "${this.draftProduct()!.name}"`),
      });
  }

  setLotQty(lotNumber: string, rawVal: number | null): void {
    const max = this.draftFefo().find(b => b.lot_number === lotNumber)?.quantity_available ?? 0;
    const val = Math.max(0, Math.min(rawVal ?? 0, max));
    this.draftLotQtys.update(prev => ({ ...prev, [lotNumber]: val }));
  }

  private _clearDraftStock(): void {
    this.draftFefo.set([]);
    this.draftLotQtys.set({});
    this.draftFetchError.set(null);
  }

  // ── Agregar ítem ──────────────────────────────────────────────

  addItem(): void {
    if (!this.canAdd()) return;
    const variant = this.draftVariant!;
    const locFrom = this.locationsFrom().find(l => l.id === this.draftLocFromId());
    const locTo   = this.locationsTo().find(l => l.id === this.draftLocToId());

    const selectedBatches = this.draftFefo().filter(b => (this.draftLotQtys()[b.lot_number] || 0) > 0);

    this.items.update(list => [...list, {
      product_name:       this.draftProduct()!.name,
      variant_label:      variant.lab_brand ?? 'Sin marca',
      fefo:               selectedBatches,
      lotQtys:            { ...this.draftLotQtys() },
      qty_total:          this.draftTotalQty(),
      loc_from_name:      locFrom?.name ?? 'Sin ubicación',
      loc_to_name:        locTo?.name ?? `Ubic. ${this.draftLocToId()}`,
      product_variant_id: variant.id,
      location_from_id:   this.draftLocFromId(),
      location_to_id:     this.draftLocToId(),
    }]);

    setTimeout(() => this.productScannerRef?.focus(), 50);
    this._clearDraftFull();
  }

  removeItem(i: number): void {
    this.items.update(arr => arr.filter((_, idx) => idx !== i));
  }

  private _clearDraftFull(): void {
    this.draftProduct.set(null);
    this.draftVariants.set([]);
    this.draftVariantId.set(null);
    this.draftLocFromId.set(null);
    this.draftLocToId.set(null);
    this.draftLotQtys.set({});
    this._clearDraftStock();
  }

  // ── Guardar transferencia ─────────────────────────────────────

  save(): void {
    if (!this.canSubmit()) return;
    this.errors.set([]);
    this.saving.set(true);

    const payload = {
      warehouse_from_id: this.warehouseFromId(),
      warehouse_to_id:   this.warehouseToId(),
      movement_date:     this.movementDate() || undefined,
      reason:            this.reason() || undefined,
      items: this.items().flatMap(item =>
        item.fefo
          .map(b => ({
            product_variant_id: item.product_variant_id,
            batch_id:           b.id,
            quantity:           item.lotQtys[b.lot_number] || 0,
            ...(item.location_from_id ? { location_from_id: item.location_from_id } : {}),
            ...(item.location_to_id   ? { location_to_id:   item.location_to_id }   : {}),
          }))
          .filter(i => i.quantity > 0)
      ),
    };

    this.invSvc.transfer(payload).subscribe({
      next: res => {
        const doc: MovementDocument = res.data;
        this.saving.set(false);
        if (doc.status === 'pending_signature') {
          const ref = this.dialog.open(MovementConfirmDialogComponent, {
            width: '560px', maxWidth: '96vw', disableClose: true,
            data: {
              document_id: doc.id,
              movements: (doc.movements ?? []).map((m: any) => ({
                id: m.id, product_name: m.product_name ?? null,
                batch_lot_number: m.batch_lot_number ?? null,
                quantity: m.quantity, movement_type: m.movement_type,
              })),
              warehouseName: this.warehouseFromName,
              inventorySvc:  this.invSvc,
            },
          });
          ref.afterClosed().subscribe((result: MovementConfirmResult | { cancelled: true } | undefined) => {
            if (result && 'confirmed' in result) {
              this._printAndNavigate(doc, result.delivered_by, result.received_by);
            } else {
              this.router.navigate(['/inventory']);
            }
          });
        } else {
          this._printAndNavigate(doc, null, null);
        }
      },
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          const raw: Record<string, string[]> = err.error?.errors || {};
          const msgs: string[] = [];
          for (const [key, messages] of Object.entries(raw)) {
            const match = key.match(/^items\.(\d+)\.(.+)$/);
            if (match) {
              const idx   = parseInt(match[1], 10);
              const field = match[2];
              msgs.push(...messages.map((m: string) => `Producto ${idx + 1} — ${field}: ${m}`));
            } else {
              msgs.push(...(messages as string[]));
            }
          }
          this.errors.set(msgs);
        } else if (err.status === 409 && err.error?.error_code === 'EXPIRED_STOCK') {
          this.errors.set([err.error?.message || 'El producto solo tiene stock vencido en el almacén origen.']);
        } else if (err.status === 409) {
          this.errors.set([err.error?.message || 'Stock insuficiente para la transferencia.']);
        } else {
          this.errors.set([err.error?.message || 'Error al registrar el traslado.']);
        }
      },
    });
  }

  private _printAndNavigate(doc: MovementDocument, deliveredBy: any, receivedBy: any): void {
    this.pdfSvc.generateAndPrint({
      movement_type:     'transfer',
      doc_id:            doc.id,
      doc_number:        doc.document_number,
      date:              doc.movement_date ?? doc.created_at,
      user_name:         doc.user_name,
      warehouse_name:    this.warehouseFromName,
      warehouse_to_name: this.warehouseToName,
      reason:            this.reason() || null,
      lines: (doc.movements ?? []).map((m: any) => ({
        product_name:    m.product_name ?? '',
        lot_number:      m.batch_lot_number ?? null,
        expiration_date: m.batch_expiration_date ?? null,
        quantity:        m.quantity,
      })),
      delivered_by: deliveredBy,
      received_by:  receivedBy,
    });
    this.snack.open('Traslado registrado exitosamente', 'OK', { duration: 3500 });
    this.router.navigate(['/inventory']);
  }

  goBack(): void { this.router.navigate(['/inventory']); }
}

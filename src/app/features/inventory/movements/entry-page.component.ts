import { Component, inject, signal, computed, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize, Observable, of, map, catchError, forkJoin } from 'rxjs';
import { InventoryService, MovementDocument } from '../inventory.service';
import { WarehouseService, Warehouse, Location, LocationCapacity } from '../../warehouse/warehouse.service';
import { CatalogService, Product, ProductVariant, ProductPresentation } from '../../catalog/catalog.service';
import { PurchasingService, PurchaseOrder, PurchaseOrderItem } from '../../purchasing/purchasing.service';
import { MovementPdfService } from '../../../shared/services/movement-pdf.service';
import { MovementConfirmDialogComponent, MovementConfirmResult } from './movement-confirm-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ProductSearchComponent } from '../../../shared/components/product-search/product-search.component';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { AuthService } from '../../../core/services/auth.service';

// ── Interfaces ────────────────────────────────────────────────

interface EntryItem {
  // display
  product_name:       string;
  variant_label:      string;
  lot_number:         string;
  expiration_date:    string;
  manufacturing_date: string | null;
  location_name:      string;
  qty_display:        string;
  notes:              string;
  // payload
  product_variant_id:      number;
  location_id:             number;
  lot_number_raw:          string;
  expiration_date_raw:     string;
  manufacturing_date_raw:  string | null;
  quantity_base:           number | null;
  product_presentation_id: number | null;
  quantity_in_presentation: number | null;
  // vínculo con la OC (cantidad en la presentación de la OC)
  po_item_id:  number | null;
  po_quantity: number | null;
}

@Component({
  selector: 'app-entry-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatProgressSpinnerModule, MatTooltipModule, MatDividerModule,
    PageHeaderComponent, ProductSearchComponent, FormErrorsComponent,
  ],
  templateUrl: './entry-page.component.html',
  styleUrl: './entry-page.component.scss',
})
export class EntryPageComponent implements OnInit {
  @ViewChild('productScanner') productScannerRef?: ProductSearchComponent;

  private router    = inject(Router);
  private route     = inject(ActivatedRoute);
  private invSvc    = inject(InventoryService);
  private wSvc      = inject(WarehouseService);
  private catSvc    = inject(CatalogService);
  private poSvc     = inject(PurchasingService);
  private pdfSvc    = inject(MovementPdfService);
  private dialog    = inject(MatDialog);
  private snack     = inject(MatSnackBar);
  private authSvc   = inject(AuthService);

  // ── Page state ────────────────────────────────────────────────
  saving  = signal(false);
  errors  = signal<string[]>([]);

  // ── Header fields ─────────────────────────────────────────────
  warehouseId     = signal<number | null>(null);
  movementDate    = signal('');
  invoiceNumber   = signal('');
  temperature     = signal<number | null>(null);
  reason          = signal('');

  warehouses      = signal<Warehouse[]>([]);
  locations       = signal<Location[]>([]);
  loadingLoc      = signal(false);

  // ── Draft item (form that clears after each add) ──────────────
  draftProduct     = signal<Product | null>(null);
  draftVariants    = signal<ProductVariant[]>([]);
  draftVariantId   = signal<number | null>(null);
  draftPresMode    = signal(false);
  draftPresentations = signal<ProductPresentation[]>([]);
  draftPresId      = signal<number | null>(null);
  draftQtyInPres   = signal<number | null>(null);
  draftLot         = signal('');
  draftExpiry      = signal('');
  draftMfg         = signal('');
  draftLocationId  = signal<number | null>(null);
  draftQtyBase     = signal<number | null>(null);
  draftNotes       = signal('');
  draftLocCap      = signal<LocationCapacity | null>(null);
  loadingVariants  = signal(false);
  loadingDetail    = signal(false);
  loadingLocCap    = signal(false);

  // ── Committed items list ──────────────────────────────────────
  items = signal<EntryItem[]>([]);

  // ── Orden de compra vinculada (?po_id=) ───────────────────────
  poOrder        = signal<PurchaseOrder | null>(null);
  loadingPo      = signal(false);
  draftPoItem    = signal<PurchaseOrderItem | null>(null);
  loadingPoItem  = signal(false);
  pendingOrders  = signal<PurchaseOrder[]>([]);

  /** No se puede cambiar de OC con ítems de la actual ya en la lista. */
  poLocked = computed((): boolean => this.items().some(i => !!i.po_item_id));

  poReceivable = computed((): boolean =>
    ['sent', 'partially_received'].includes(this.poOrder()?.status ?? '')
  );

  /** Pendiente por ítem de la OC, descontando lo ya agregado a la lista. */
  poPendingMap = computed((): Map<number, number> => {
    const m = new Map<number, number>();
    for (const it of this.poOrder()?.items ?? []) {
      if (!it.id) continue;
      const added = this.items()
        .filter(e => e.po_item_id === it.id)
        .reduce((sum, e) => sum + (e.po_quantity ?? 0), 0);
      m.set(it.id, Math.max(0, Number(it.quantity_requested) - Number(it.quantity_received ?? 0) - added));
    }
    return m;
  });

  draftPoPending = computed((): number =>
    this.draftPoItem()?.id ? (this.poPendingMap().get(this.draftPoItem()!.id!) ?? 0) : 0
  );

  readonly today = new Date().toISOString().split('T')[0];
  // Rango aceptado en fechas de lote: evita años de 2 dígitos tecleados en el input nativo (ej. "28" → 0028)
  readonly minLotDate = '2000-01-01';
  readonly maxLotDate = '2099-12-31';

  expiryInvalid = computed(() => !!this.draftExpiry() && !this._isValidLotDate(this.draftExpiry()));
  mfgInvalid    = computed(() => !!this.draftMfg() && !this._isValidLotDate(this.draftMfg()));

  // ── Computed helpers ──────────────────────────────────────────

  get warehouseSelected(): boolean { return !!this.warehouseId(); }

  get draftVariant(): ProductVariant | null {
    return this.draftVariants().find(v => v.id === this.draftVariantId()) ?? null;
  }

  draftPreviewBaseUnits = computed((): number | null => {
    if (!this.draftPresMode()) return null;
    const pres = this.draftPresentations().find(p => p.id === this.draftPresId());
    if (!pres || !this.draftQtyInPres()) return null;
    return Math.round(this.draftQtyInPres()! * pres.factor_to_base * 100) / 100;
  });

  canAdd = computed((): boolean => {
    if (!this.draftVariantId()) return false;
    if (!this.draftLot().trim()) return false;
    if (!this.draftExpiry() || this.expiryInvalid() || this.mfgInvalid()) return false;
    if (!this.draftLocationId()) return false;
    if (this.draftPoItem()) {
      const qty = this.draftQtyInPres();
      return !!(this.draftPresMode() && this.draftPresId() && qty && Number.isInteger(qty)
        && qty > 0 && qty <= this.draftPoPending());
    }
    if (this.draftPresMode()) {
      return !!(this.draftPresId() && this.draftQtyInPres() && this.draftQtyInPres()! > 0);
    }
    return !!(this.draftQtyBase() && this.draftQtyBase()! > 0);
  });

  canSubmit = computed((): boolean =>
    !!this.warehouseId() && this.items().length > 0 && !this.saving()
  );

  // ── Lifecycle ─────────────────────────────────────────────────

  ngOnInit(): void {
    this.wSvc.getWarehouses().subscribe({ next: r => this.warehouses.set(r.data), error: () => {} });

    const poId = this.route.snapshot.queryParamMap.get('po_id');
    if (poId) this._loadPoItems(Number(poId));
    this._loadPendingOrders();
  }

  // ── Warehouse change ──────────────────────────────────────────

  onWarehouseChange(id: number | null): void {
    this.warehouseId.set(id);
    this.locations.set([]);
    this.draftLocationId.set(null);
    this.draftLocCap.set(null);
    if (!id) return;
    this.loadingLoc.set(true);
    this.wSvc.getWarehouseLocations(id)
      .pipe(finalize(() => this.loadingLoc.set(false)))
      .subscribe({ next: r => this.locations.set(r.data), error: () => {} });
  }

  // ── Draft product ─────────────────────────────────────────────

  onDraftProductSelected(product: Product | null): void {
    this.draftPoItem.set(null);
    this.draftProduct.set(product);
    this.draftVariants.set([]);
    this.draftVariantId.set(null);
    this.draftPresentations.set([]);
    this.draftPresId.set(null);
    this.draftQtyInPres.set(null);
    this.draftPresMode.set(false);
    this.draftLot.set('');
    this.draftExpiry.set('');
    this.draftMfg.set('');
    this.draftQtyBase.set(null);
    this.draftNotes.set('');
    if (!product) return;
    this.loadingVariants.set(true);
    this.catSvc.getVariants(product.id).subscribe({
      next: r => {
        const activos = (r.data ?? []).filter(v => v.is_active);
        this.draftVariants.set(activos);
        if (activos.length === 1) this.onDraftVariantChange(activos[0].id);
        this.loadingVariants.set(false);
      },
      error: () => this.loadingVariants.set(false),
    });
  }

  onDraftVariantChange(variantId: number | null): void {
    this.draftVariantId.set(variantId);
    this.draftPresentations.set([]);
    this.draftPresId.set(null);
    this.draftQtyInPres.set(null);
    this.draftPresMode.set(false);
    if (!variantId || !this.draftProduct()) return;
    this.loadingDetail.set(true);
    this.catSvc.getPresentations(this.draftProduct()!.id).subscribe({
      next: r => {
        this.draftPresentations.set(r.data ?? []);
        this.loadingDetail.set(false);
      },
      error: () => this.loadingDetail.set(false),
    });
  }

  onDraftLocationChange(locId: number | null): void {
    this.draftLocationId.set(locId);
    this.draftLocCap.set(null);
    if (!locId) return;
    this.loadingLocCap.set(true);
    this.wSvc.getLocationCapacity(locId)
      .pipe(finalize(() => this.loadingLocCap.set(false)))
      .subscribe({ next: r => this.draftLocCap.set(r.data), error: () => {} });
  }

  togglePresMode(use: boolean): void {
    this.draftPresMode.set(use);
    this.draftPresId.set(null);
    this.draftQtyInPres.set(null);
    this.draftQtyBase.set(null);
  }

  // ── Add item to list ──────────────────────────────────────────

  addItem(): void {
    if (!this.canAdd()) return;
    const variant = this.draftVariant!;
    const loc     = this.locations().find(l => l.id === this.draftLocationId());
    const pres    = this.draftPresentations().find(p => p.id === this.draftPresId());

    const qtyDisplay = this.draftPresMode() && pres
      ? `${this.draftQtyInPres()} × ${pres.name} (≈${this.draftPreviewBaseUnits()} u. base)`
      : `${this.draftQtyBase()} u. base`;

    // Enfocar el buscador de producto para el siguiente ítem
    setTimeout(() => this.productScannerRef?.focus(), 50);

    this.items.update(list => [...list, {
      product_name:       this.draftProduct()!.name,
      variant_label:      variant.lab_brand ?? 'Sin marca',
      lot_number:         this.draftLot(),
      expiration_date:    this.draftExpiry(),
      manufacturing_date: this.draftMfg() || null,
      location_name:      loc?.name ?? String(this.draftLocationId()),
      qty_display:        qtyDisplay,
      notes:              this.draftNotes(),
      product_variant_id:       variant.id,
      location_id:              this.draftLocationId()!,
      lot_number_raw:           this.draftLot(),
      expiration_date_raw:      this.draftExpiry(),
      manufacturing_date_raw:   this.draftMfg() || null,
      quantity_base:            this.draftPresMode() ? null : Number(this.draftQtyBase()),
      product_presentation_id:  this.draftPresMode() ? (this.draftPresId() ?? null) : null,
      quantity_in_presentation: this.draftPresMode() ? Number(this.draftQtyInPres()) : null,
      po_item_id:               this.draftPoItem()?.id ?? null,
      po_quantity:              this.draftPoItem() ? Number(this.draftQtyInPres()) : null,
    }]);

    this._clearDraft();
  }

  removeItem(i: number): void {
    this.items.update(list => list.filter((_, idx) => idx !== i));
  }

  private _isValidLotDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= this.minLotDate && value <= this.maxLotDate;
  }

  private _clearDraft(): void {
    this.draftPoItem.set(null);
    this.draftProduct.set(null);
    this.draftVariants.set([]);
    this.draftVariantId.set(null);
    this.draftPresentations.set([]);
    this.draftPresId.set(null);
    this.draftQtyInPres.set(null);
    this.draftPresMode.set(false);
    this.draftLot.set('');
    this.draftExpiry.set('');
    this.draftMfg.set('');
    this.draftLocationId.set(null);
    this.draftQtyBase.set(null);
    this.draftNotes.set('');
    this.draftLocCap.set(null);
  }

  // ── PO prefill ────────────────────────────────────────────────

  private _loadPoItems(poId: number): void {
    this.loadingPo.set(true);
    this.poSvc.getOrder(poId)
      .pipe(finalize(() => this.loadingPo.set(false)))
      .subscribe({
        next: r => {
          const order: PurchaseOrder = r.data;
          this.poOrder.set(order);
          if (!this.poReceivable()) return;
          if (order.warehouse_id) this.onWarehouseChange(order.warehouse_id);
          this.reason.set(`Recepción ${order.code}`);
        },
        error: () => this.errors.set(['No se pudo cargar la orden de compra']),
      });
  }

  /** OC enviadas o recibidas parcialmente, para avisar al entrar sin ?po_id. */
  private _loadPendingOrders(): void {
    if (!this.authSvc.hasAnyPermission(['ordenes_compra.recibir'])) return;
    forkJoin([
      this.poSvc.getOrders({ status: 'sent', order_type: 'purchase', per_page: 100 }),
      this.poSvc.getOrders({ status: 'partially_received', order_type: 'purchase', per_page: 100 }),
    ]).subscribe({
      next: ([sent, partial]) => this.pendingOrders.set([...(sent.data ?? []), ...(partial.data ?? [])]),
      error: () => {},
    });
  }

  onPoSelected(poId: number | null): void {
    if (this.poLocked()) return;
    this.draftPoItem.set(null);
    this.poOrder.set(null);
    this.router.navigate([], {
      relativeTo: this.route, replaceUrl: true,
      queryParams: { po_id: poId ?? null },
    });
    if (poId) this._loadPoItems(poId);
    else this.reason.set('');
  }

  poPending(item: PurchaseOrderItem): number {
    return item.id ? (this.poPendingMap().get(item.id) ?? 0) : 0;
  }

  /** Precarga el formulario con un ítem de la OC; lote, vencimiento y ubicación los completa el usuario. */
  loadPoItem(item: PurchaseOrderItem): void {
    const genericId = item.variant?.generic?.id;
    if (!genericId || !this.warehouseSelected) return;
    this._clearDraft();
    this.loadingPoItem.set(true);
    this.catSvc.getProduct(genericId).subscribe({
      next: r => {
        this.draftProduct.set(r.data);
        this.draftPoItem.set(item);
        this.catSvc.getVariants(genericId).subscribe({
          next: vr => {
            this.draftVariants.set((vr.data ?? []).filter(v => v.is_active || v.id === item.product_variant_id));
            this.draftVariantId.set(item.product_variant_id);
            this.catSvc.getPresentations(genericId)
              .pipe(finalize(() => this.loadingPoItem.set(false)))
              .subscribe({
                next: pr => {
                  this.draftPresentations.set(pr.data ?? []);
                  this.draftPresMode.set(true);
                  this.draftPresId.set(item.product_presentation_id);
                  this.draftQtyInPres.set(this.poPending(item) || null);
                },
                error: () => {},
              });
          },
          error: () => this.loadingPoItem.set(false),
        });
      },
      error: () => this.loadingPoItem.set(false),
    });
  }

  /** Aviso cuando la entrada se guardó pero la OC no pudo actualizarse. */
  private poWarning: string | null = null;

  unlinkPoItem(): void {
    this.draftPoItem.set(null);
  }

  /** Actualiza el seguimiento de recepción de la OC; la entrada al inventario ya quedó registrada. */
  private _receivePo(): Observable<string | null> {
    const order  = this.poOrder();
    const linked = this.items().filter(i => i.po_item_id && i.po_quantity);
    if (!order || !linked.length) return of(null);
    return this.poSvc.receive(order.id, linked.map(i => ({
      item_id:           i.po_item_id!,
      quantity_received: i.po_quantity!,
      lot_number:        i.lot_number_raw,
      expiration_date:   i.expiration_date_raw,
      location_id:       i.location_id,
    }))).pipe(
      map(() => null),
      catchError(err => of(
        `La entrada se registró, pero no se actualizó la OC ${order.code}: ` +
        (err.error?.message || 'error desconocido'),
      )),
    );
  }

  // ── Save ──────────────────────────────────────────────────────

  save(): void {
    if (!this.canSubmit()) return;
    this.errors.set([]);
    this.saving.set(true);

    const payload = {
      warehouse_id:      this.warehouseId(),
      movement_date:     this.movementDate() || undefined,
      invoice_number:    this.invoiceNumber() || undefined,
      entry_temperature: this.temperature() ?? undefined,
      reason:            this.reason() || undefined,
      items: this.items().map(item => ({
        product_variant_id:       item.product_variant_id,
        location_id:              item.location_id,
        lot_number:               item.lot_number_raw,
        expiration_date:          item.expiration_date_raw,
        manufacturing_date:       item.manufacturing_date_raw || undefined,
        quantity_base:            item.quantity_base ?? undefined,
        product_presentation_id:  item.product_presentation_id ?? undefined,
        quantity_in_presentation: item.quantity_in_presentation ?? undefined,
        notes:                    item.notes || undefined,
      })),
    };

    this.invSvc.entry(payload).subscribe({
      next: res => this._receivePo().subscribe(poError => {
        this.poWarning = poError;
        const doc: MovementDocument = res.data;
        const needsSignature = doc.status === 'pending_signature';
        this.saving.set(false);

        if (needsSignature) {
          const ref = this.dialog.open(MovementConfirmDialogComponent, {
            width: '560px', maxWidth: '96vw', disableClose: true,
            data: {
              document_id: doc.id,
              movements: (doc.movements ?? []).map(m => ({
                id: m.id, product_name: m.product_name ?? null,
                batch_lot_number: m.batch_lot_number ?? null,
                quantity: m.quantity, movement_type: m.movement_type,
              })),
              warehouseName: this.warehouses().find(w => w.id === this.warehouseId())?.name ?? '',
              inventorySvc:  this.invSvc,
            },
          });
          ref.afterClosed().subscribe((result: MovementConfirmResult | { cancelled: true } | undefined) => {
            if (result && 'confirmed' in result) {
              this._printAndNavigate(doc, result.delivered_by, result.received_by);
            } else {
              if (this.poWarning) this.snack.open(this.poWarning, 'OK', { duration: 8000 });
              this.router.navigate(['/inventory']);
            }
          });
        } else {
          this._printAndNavigate(doc, null, null);
        }
      }),
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
              msgs.push(...messages.map(m => `Producto ${idx + 1} — ${field}: ${m}`));
            } else {
              msgs.push(...messages);
            }
          }
          this.errors.set(msgs);
        } else {
          this.errors.set([err.error?.message || 'Ocurrió un error al registrar la entrada']);
        }
      },
    });
  }

  private _printAndNavigate(doc: MovementDocument, deliveredBy: any, receivedBy: any): void {
    const wh = this.warehouses().find(w => w.id === this.warehouseId());
    this.pdfSvc.generateAndPrint({
      movement_type: 'entry',
      doc_id:        doc.id,
      doc_number:    doc.document_number,
      date:          doc.movement_date ?? doc.created_at,
      user_name:     doc.user_name,
      warehouse_name: wh?.name ?? '',
      reason:        this.reason() || null,
      lines: (doc.movements ?? []).map(m => ({
        product_name:    m.product_name ?? '',
        lot_number:      m.batch_lot_number ?? null,
        expiration_date: m.batch_expiration_date ?? null,
        quantity:        m.quantity,
      })),
      delivered_by: deliveredBy,
      received_by:  receivedBy,
    });
    if (this.poWarning) this.snack.open(this.poWarning, 'OK', { duration: 8000 });
    else this.snack.open('Entrada registrada exitosamente', 'OK', { duration: 3500 });
    this.router.navigate(['/inventory']);
  }

  goBack(): void { this.router.navigate(['/inventory']); }
}

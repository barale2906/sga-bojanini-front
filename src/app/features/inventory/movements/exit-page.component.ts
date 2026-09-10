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
import { InventoryService, BatchDetail, CostCenter, MovementDocument } from '../inventory.service';
import { WarehouseService, Warehouse, Location } from '../../warehouse/warehouse.service';
import { MedicalServicesService, MedicalService } from '../medical-services.service';
import { Product } from '../../catalog/catalog.service';
import { MovementPdfService } from '../../../shared/services/movement-pdf.service';
import { MovementConfirmDialogComponent, MovementConfirmResult } from './movement-confirm-dialog.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ProductSearchComponent } from '../../../shared/components/product-search/product-search.component';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

interface CartItem {
  product:     Product;
  quantity:    number;           // total (suma de lotes o qty de kit)
  location_id: number | null;
  fefo:        BatchDetail[];    // solo lotes con cantidad > 0, en orden FEFO
  lotQtys:     Record<string, number>; // qty por lot_number → para el payload
  isKit:       boolean;
}

@Component({
  selector: 'app-exit-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatProgressSpinnerModule, MatTooltipModule,
    PageHeaderComponent, ProductSearchComponent, FormErrorsComponent,
  ],
  templateUrl: './exit-page.component.html',
  styleUrl: './exit-page.component.scss',
})
export class ExitPageComponent implements OnInit {
  @ViewChild('productScanner') productScannerRef?: ProductSearchComponent;

  private router  = inject(Router);
  private invSvc  = inject(InventoryService);
  private wSvc    = inject(WarehouseService);
  private medSvc  = inject(MedicalServicesService);
  private pdfSvc  = inject(MovementPdfService);
  private dialog  = inject(MatDialog);
  private snack   = inject(MatSnackBar);

  // ── Estado de página ──────────────────────────────────────────
  saving  = signal(false);
  errors  = signal<string[]>([]);

  // ── Cabecera: CC + almacén + fecha + motivo ───────────────────
  costCenterId      = signal<number | null>(null);
  warehouseId       = signal<number | null>(null);
  movementDate      = signal('');
  reason            = signal('');
  serviceId         = signal<number | null>(null);
  patientDocument   = signal('');
  patientExternalId = signal('');

  costCenters        = signal<CostCenter[]>([]);
  loadingCostCenters = signal(false);
  medicalServices    = signal<MedicalService[]>([]);
  loadingServices    = signal(false);
  warehouses         = signal<Warehouse[]>([]);
  locations          = signal<Location[]>([]);
  loadingLocations   = signal(false);

  readonly today = new Date().toISOString().split('T')[0];

  // ── Draft: producto que se está agregando ─────────────────────
  draftProduct     = signal<Product | null>(null);
  draftFefo        = signal<BatchDetail[]>([]);
  /** Cantidades por lote (keyed por lot_number) — para productos no-kit */
  draftLotQtys     = signal<Record<string, number>>({});
  /** Para kits: cantidad única */
  draftQtyKit      = signal<number | null>(null);
  draftLocationId  = signal<number | null>(null);
  loadingDraftFefo = signal(false);
  draftFetchError  = signal<string | null>(null);
  _kitAvailable    = signal<number | null>(null);

  // ── Lista de ítems confirmados ────────────────────────────────
  cartItems = signal<CartItem[]>([]);

  // ── Computed helpers ──────────────────────────────────────────

  get headersComplete(): boolean {
    return !!(this.costCenterId() && this.warehouseId());
  }

  get selectedWarehouseName(): string {
    return this.warehouses().find(w => w.id === this.warehouseId())?.name ?? '';
  }

  get selectedCostCenter(): CostCenter | null {
    return this.costCenters().find(c => c.id === this.costCenterId()) ?? null;
  }

  get isExternalCC(): boolean {
    return this.selectedCostCenter?.is_external ?? false;
  }

  draftAvailableQty = computed((): number => {
    if (!this.draftProduct()) return 0;
    if (this.draftProduct()!.product_type === 'kit') return this._kitAvailable() ?? 0;
    return this.draftFefo().reduce((sum, b) => sum + b.quantity_available, 0);
  });

  /** Suma de cantidades seleccionadas por lote */
  draftTotalQty = computed((): number =>
    Object.values(this.draftLotQtys()).reduce((sum, q) => sum + (q || 0), 0)
  );

  canAdd = computed((): boolean => {
    if (!this.draftProduct() || this.loadingDraftFefo() || !!this.draftFetchError()) return false;
    const isKit = this.draftProduct()!.product_type === 'kit';
    if (isKit) {
      const q = this.draftQtyKit();
      return !!(q && q > 0 && q <= (this._kitAvailable() ?? 0));
    }
    const total = this.draftTotalQty();
    return total > 0 && total <= this.draftAvailableQty();
  });

  canSubmit = computed((): boolean =>
    this.headersComplete && this.cartItems().length > 0 && !this.saving()
  );

  // ── Ciclo de vida ─────────────────────────────────────────────

  ngOnInit(): void {
    this.wSvc.getWarehouses().subscribe({ next: r => this.warehouses.set(r.data), error: () => {} });

    this.loadingCostCenters.set(true);
    this.invSvc.getCostCenters({ is_active: true })
      .pipe(finalize(() => this.loadingCostCenters.set(false)))
      .subscribe({ next: r => this.costCenters.set(r.data), error: () => {} });
  }

  // ── Centro de costo ───────────────────────────────────────────

  onCostCenterChange(ccId: number | null): void {
    this.costCenterId.set(ccId);
    this.serviceId.set(null);
    this.patientDocument.set('');
    this.patientExternalId.set('');
    this.medicalServices.set([]);
    if (!ccId) return;
    const cc = this.costCenters().find(c => c.id === ccId);
    if (cc?.is_external) this._loadMedicalServices();
  }

  private _loadMedicalServices(): void {
    this.loadingServices.set(true);
    this.medSvc.getMedicalServices({ is_active: true })
      .pipe(finalize(() => this.loadingServices.set(false)))
      .subscribe({ next: r => this.medicalServices.set(r.data), error: () => {} });
  }

  // ── Almacén ───────────────────────────────────────────────────

  onWarehouseChange(id: number | null): void {
    this.warehouseId.set(id);
    this.locations.set([]);
    this._clearDraft();
    if (!id) return;
    this.loadingLocations.set(true);
    this.wSvc.getWarehouseLocations(id)
      .pipe(finalize(() => this.loadingLocations.set(false)))
      .subscribe({ next: r => this.locations.set(r.data), error: () => {} });
  }

  // ── Draft producto ────────────────────────────────────────────

  onDraftProductSelected(product: Product | null): void {
    this.draftProduct.set(product);
    this.draftFefo.set([]);
    this.draftLotQtys.set({});
    this.draftQtyKit.set(null);
    this.draftLocationId.set(null);
    this.draftFetchError.set(null);
    this._kitAvailable.set(null);
    if (!product || !this.warehouseId()) return;

    const wId   = this.warehouseId()!;
    const isKit = product.product_type === 'kit';
    this.loadingDraftFefo.set(true);

    if (isKit) {
      this.invSvc.getKitAvailability(product.id, wId)
        .pipe(finalize(() => this.loadingDraftFefo.set(false)))
        .subscribe({
          next: r => {
            this._kitAvailable.set(r.data.available_kits);
            if (r.data.available_kits === 0) {
              this.draftFetchError.set(`Sin stock de "${product.name}" en este almacén`);
            }
          },
          error: () => this.draftFetchError.set(`Error al verificar stock de "${product.name}"`),
        });
      return;
    }

    this.invSvc.getProductBatches(product.id, true, wId)
      .pipe(finalize(() => this.loadingDraftFefo.set(false)))
      .subscribe({
        next: r => {
          const available = r.data.filter((b: BatchDetail) => b.status === 'active' && b.quantity_available > 0);
          this.draftFefo.set(available);
          // Inicializar cantidades en 0 para cada lote
          const qtys: Record<string, number> = {};
          for (const b of available) qtys[b.lot_number] = 0;
          this.draftLotQtys.set(qtys);
          if (!available.length) {
            this.draftFetchError.set(`Sin stock disponible de "${product.name}" en este almacén`);
          }
        },
        error: () => this.draftFetchError.set(`Error al verificar stock de "${product.name}"`),
      });
  }

  setLotQty(lotNumber: string, rawVal: number | null): void {
    const max = this.draftFefo().find(b => b.lot_number === lotNumber)?.quantity_available ?? 0;
    const val = Math.max(0, Math.min(rawVal ?? 0, max));
    this.draftLotQtys.update(prev => ({ ...prev, [lotNumber]: val }));
  }

  // ── Agregar ítem ──────────────────────────────────────────────

  addItem(): void {
    if (!this.canAdd()) return;
    const product = this.draftProduct()!;
    const isKit   = product.product_type === 'kit';
    const qty     = isKit ? this.draftQtyKit()! : this.draftTotalQty();

    // Solo guardar los lotes donde el usuario asignó cantidad > 0
    const selectedBatches = isKit
      ? []
      : this.draftFefo().filter(b => (this.draftLotQtys()[b.lot_number] || 0) > 0);

    this.cartItems.update(list => [...list, {
      product,
      quantity:    qty,
      location_id: this.draftLocationId(),
      fefo:        selectedBatches,
      lotQtys:     isKit ? {} : { ...this.draftLotQtys() },
      isKit,
    }]);

    setTimeout(() => this.productScannerRef?.focus(), 50);
    this._clearDraft();
  }

  removeItem(i: number): void {
    this.cartItems.update(arr => arr.filter((_, idx) => idx !== i));
  }

  private _clearDraft(): void {
    this.draftProduct.set(null);
    this.draftFefo.set([]);
    this.draftLotQtys.set({});
    this.draftQtyKit.set(null);
    this.draftLocationId.set(null);
    this.draftFetchError.set(null);
    this._kitAvailable.set(null);
  }

  // ── Guardar salida ────────────────────────────────────────────

  save(): void {
    if (!this.canSubmit()) return;
    this.errors.set([]);
    this.saving.set(true);

    const payload: Record<string, unknown> = {
      warehouse_id:   this.warehouseId(),
      cost_center_id: this.costCenterId(),
      movement_date:  this.movementDate() || undefined,
      reason:         this.reason() || undefined,
      ...(this.serviceId()         ? { service_id: this.serviceId() }                  : {}),
      ...(this.patientDocument()   ? { patient_document: this.patientDocument() }      : {}),
      ...(this.patientExternalId() ? { patient_external_id: this.patientExternalId() } : {}),
      items: this.cartItems().flatMap(item => {
        if (item.isKit) {
          return [{
            generic_product_id: item.product.id,
            quantity:           Number(item.quantity),
            ...(item.location_id ? { location_id: item.location_id } : {}),
          }];
        }
        // Un ítem por lote seleccionado, en orden FEFO (fefo ya está filtrado y ordenado)
        return item.fefo
          .map(b => ({
            generic_product_id: item.product.id,
            batch_id:           b.id,
            quantity:           item.lotQtys[b.lot_number] || 0,
            ...(item.location_id ? { location_id: item.location_id } : {}),
          }))
          .filter(i => i.quantity > 0);
      }),
    };

    this.invSvc.exit(payload).subscribe({
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
              warehouseName: this.selectedWarehouseName,
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
          this.errors.set([err.error?.message || 'El producto solo tiene stock vencido en este almacén.']);
        } else if (err.status === 409) {
          this.errors.set([err.error?.message || 'Error de stock o negocio.']);
        } else {
          this.errors.set([err.error?.message || 'Error al registrar la salida.']);
        }
      },
    });
  }

  private _printAndNavigate(doc: MovementDocument, deliveredBy: any, receivedBy: any): void {
    const cc = this.costCenters().find(c => c.id === this.costCenterId());
    this.pdfSvc.generateAndPrint({
      movement_type:    'exit',
      doc_id:           doc.id,
      doc_number:       doc.document_number,
      date:             doc.movement_date ?? doc.created_at,
      user_name:        doc.user_name,
      warehouse_name:   this.selectedWarehouseName,
      cost_center_name: cc?.name ?? null,
      reason:           this.reason() || null,
      lines: (doc.movements ?? []).map((m: any) => ({
        product_name:    m.product_name ?? '',
        lot_number:      m.batch_lot_number ?? null,
        expiration_date: m.batch_expiration_date ?? null,
        quantity:        m.quantity,
      })),
      delivered_by: deliveredBy,
      received_by:  receivedBy,
    });
    this.snack.open('Salida registrada exitosamente', 'OK', { duration: 3500 });
    this.router.navigate(['/inventory']);
  }

  goBack(): void { this.router.navigate(['/inventory']); }
}

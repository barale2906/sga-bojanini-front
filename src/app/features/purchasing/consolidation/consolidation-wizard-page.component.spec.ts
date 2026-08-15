import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ConsolidationWizardPageComponent } from './consolidation-wizard-page.component';
import { PurchasingService, ConsolidationPreview, ConsolidationPreviewItem, TaxBreakdownEntry } from '../purchasing.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePreviewItem(overrides: Partial<ConsolidationPreviewItem> = {}): ConsolidationPreviewItem {
  return {
    product_variant_id: 1, product_presentation_id: 1,
    quantity: 10, unit_price: 5000, tax_rate: 19,
    subtotal: 50000, tax_amount: 9500, total_price: 59500,
    source_order_codes: ['OC-2026-00001'],
    variant: { id: 1, lab_brand: 'Genfar', brand_sku: 'GEN-001', generic: { id: 1, name: 'Ibuprofeno 400mg' } },
    presentation: { id: 1, code: 'CAJ-10', name: 'Caja x 10' },
    ...overrides,
  };
}

function makePreview(
  itemOverrides: Partial<ConsolidationPreviewItem>[] = [],
  taxBreakdown: TaxBreakdownEntry[] = [{ rate: 19, taxable_base: 50000, tax_amount: 9500 }],
): ConsolidationPreview {
  const items = itemOverrides.length ? itemOverrides.map(makePreviewItem) : [makePreviewItem()];
  return {
    supplier: { id: 3, name: 'Proveedor XYZ', tax_id: '900123456-1' },
    purchase_orders: [
      { id: 12, code: 'OC-2026-00012', total_amount: 297500, warehouse: { id: 1, name: 'Almacén Central' } },
    ],
    items,
    subtotal: 50000,
    tax_breakdown: taxBreakdown,
    tax_amount: 9500,
    total_amount: 59500,
  };
}

function previewResponse(data: ConsolidationPreview) {
  return of({ success: true, message: '', data });
}

// ─── Suite principal ─────────────────────────────────────────────────────────

describe('ConsolidationWizardPageComponent — paso 3 (preview)', () => {
  let component: ConsolidationWizardPageComponent;
  let purchasingSvc: PurchasingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsolidationWizardPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAnimationsAsync(),
        {
          provide: MatSnackBar,
          useValue: { open: vi.fn() },
        },
        {
          provide: MatDialog,
          useValue: { open: vi.fn() },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ConsolidationWizardPageComponent);
    component    = fixture.componentInstance;
    purchasingSvc = TestBed.inject(PurchasingService);

    // Stub loadSuppliers para que no haga HTTP real en ngOnInit
    vi.spyOn(purchasingSvc, 'getConsolidableSuppliers').mockReturnValue(
      of({ success: true, message: '', data: [{ id: 3, name: 'Proveedor XYZ', tax_id: '900-1' }] }),
    );

    fixture.detectChanges();
  });

  // ── Camino feliz ──────────────────────────────────────────────────────────

  it('llama al endpoint consolidation-preview con los IDs seleccionados', () => {
    const spy = vi.spyOn(purchasingSvc, 'getConsolidationPreview').mockReturnValue(previewResponse(makePreview()));
    component.selectedIds.set(new Set([12, 15]));
    component.loadConsolidationPreview();
    expect(spy).toHaveBeenCalledWith([12, 15]);
  });

  it('puebla previewItems con los datos devueltos por el backend', () => {
    vi.spyOn(purchasingSvc, 'getConsolidationPreview').mockReturnValue(
      previewResponse(makePreview([{ quantity: 7, source_order_codes: ['OC-A', 'OC-B'] }])),
    );
    component.selectedIds.set(new Set([12]));
    component.loadConsolidationPreview();

    expect(component.previewItems().length).toBe(1);
    expect(component.previewItems()[0].quantity).toBe(7);
    expect(component.previewItems()[0].source_order_codes).toEqual(['OC-A', 'OC-B']);
  });

  it('establece los totales del backend en previewSubtotal / previewTax / previewTotal', () => {
    const preview = makePreview();
    preview.subtotal     = 100000;
    preview.tax_amount   = 19000;
    preview.total_amount = 119000;
    vi.spyOn(purchasingSvc, 'getConsolidationPreview').mockReturnValue(previewResponse(preview));

    component.selectedIds.set(new Set([12]));
    component.loadConsolidationPreview();

    expect(component.previewSubtotal()).toBe(100000);
    expect(component.previewTax()).toBe(19000);
    expect(component.previewTotal()).toBe(119000);
  });

  it('puebla previewOcList con el array purchase_orders del backend', () => {
    vi.spyOn(purchasingSvc, 'getConsolidationPreview').mockReturnValue(previewResponse(makePreview()));
    component.selectedIds.set(new Set([12]));
    component.loadConsolidationPreview();

    expect(component.previewOcList().length).toBe(1);
    expect(component.previewOcList()[0].code).toBe('OC-2026-00012');
    expect(component.previewOcList()[0].warehouse.name).toBe('Almacén Central');
  });

  it('puebla previewTaxBreakdown con el desglose de IVA por tasa del backend', () => {
    const breakdown: TaxBreakdownEntry[] = [
      { rate: 0,  taxable_base: 30000, tax_amount: 0 },
      { rate: 19, taxable_base: 20000, tax_amount: 3800 },
    ];
    vi.spyOn(purchasingSvc, 'getConsolidationPreview').mockReturnValue(
      previewResponse(makePreview([], breakdown)),
    );
    component.selectedIds.set(new Set([12]));
    component.loadConsolidationPreview();

    expect(component.previewTaxBreakdown().length).toBe(2);
    const entry19 = component.previewTaxBreakdown().find(t => t.rate === 19)!;
    expect(entry19.tax_amount).toBe(3800);
    expect(entry19.taxable_base).toBe(20000);
  });

  it('desactiva previewLoading al completar exitosamente', () => {
    vi.spyOn(purchasingSvc, 'getConsolidationPreview').mockReturnValue(previewResponse(makePreview()));
    component.selectedIds.set(new Set([12]));
    component.loadConsolidationPreview();
    expect(component.previewLoading()).toBe(false);
  });

  // ── Errores ───────────────────────────────────────────────────────────────

  it('guarda el mensaje de error en previewError cuando la API devuelve 422', () => {
    const errMsg = 'Las siguientes órdenes ya fueron consolidadas: OC-2026-00008.';
    vi.spyOn(purchasingSvc, 'getConsolidationPreview').mockReturnValue(
      throwError(() => ({ error: { message: errMsg } })),
    );
    component.selectedIds.set(new Set([8]));
    component.loadConsolidationPreview();

    expect(component.previewError()).toBe(errMsg);
    expect(component.previewLoading()).toBe(false);
  });

  it('usa mensaje genérico cuando el error no tiene body', () => {
    vi.spyOn(purchasingSvc, 'getConsolidationPreview').mockReturnValue(
      throwError(() => ({})),
    );
    component.selectedIds.set(new Set([8]));
    component.loadConsolidationPreview();

    expect(component.previewError()).toBe('No se pudo cargar la vista previa');
  });

  it('limpia previewError al iniciar una nueva solicitud exitosa', () => {
    vi.spyOn(purchasingSvc, 'getConsolidationPreview')
      .mockReturnValueOnce(throwError(() => ({ error: { message: 'Error anterior' } })))
      .mockReturnValueOnce(previewResponse(makePreview()));

    component.selectedIds.set(new Set([8]));
    component.loadConsolidationPreview(); // falla
    expect(component.previewError()).toBeTruthy();

    component.loadConsolidationPreview(); // éxito
    expect(component.previewError()).toBeNull();
  });

  // ── Casos borde ───────────────────────────────────────────────────────────

  it('no llama al endpoint si no hay IDs seleccionados', () => {
    const spy = vi.spyOn(purchasingSvc, 'getConsolidationPreview');
    component.selectedIds.set(new Set());
    component.loadConsolidationPreview();
    expect(spy).not.toHaveBeenCalled();
  });

  it('onStepChange dispara loadConsolidationPreview al entrar al paso 3 (index 2)', () => {
    const spy = vi.spyOn(component, 'loadConsolidationPreview').mockImplementation(() => {});
    component.onStepChange({ selectedIndex: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('onStepChange no dispara el preview para los pasos 0 y 1', () => {
    const spy = vi.spyOn(component, 'loadConsolidationPreview').mockImplementation(() => {});
    component.onStepChange({ selectedIndex: 0 });
    component.onStepChange({ selectedIndex: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  // ── Items con source_order_codes ──────────────────────────────────────────

  it('preserva source_order_codes múltiples tal como los envía el backend', () => {
    const preview = makePreview([
      { source_order_codes: ['OC-2026-00002', 'OC-2026-00007'], quantity: 4 },
      { source_order_codes: ['OC-2026-00005'], quantity: 5, unit_price: 260000 },
    ]);
    vi.spyOn(purchasingSvc, 'getConsolidationPreview').mockReturnValue(previewResponse(preview));

    component.selectedIds.set(new Set([12, 15]));
    component.loadConsolidationPreview();

    expect(component.previewItems()[0].source_order_codes).toEqual(['OC-2026-00002', 'OC-2026-00007']);
    expect(component.previewItems()[1].source_order_codes).toEqual(['OC-2026-00005']);
  });

  it('no agrupa items en el frontend — entrega exactamente los del backend', () => {
    // Mismo variant+presentation con precios distintos = 2 items separados
    const preview = makePreview([
      { unit_price: 258000, quantity: 4, source_order_codes: ['OC-A'] },
      { unit_price: 260000, quantity: 5, source_order_codes: ['OC-B'] },
    ]);
    vi.spyOn(purchasingSvc, 'getConsolidationPreview').mockReturnValue(previewResponse(preview));

    component.selectedIds.set(new Set([1, 2]));
    component.loadConsolidationPreview();

    expect(component.previewItems().length).toBe(2);
  });
});

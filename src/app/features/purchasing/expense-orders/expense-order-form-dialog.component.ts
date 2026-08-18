import { Component, inject, OnInit, signal, DestroyRef, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormArray, Validators, FormControl } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatDividerModule } from '@angular/material/divider';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ExpenseOrderService, ExpenseOrder, ExpenseSupplier } from './expense-order.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

export const UNITS = ['und', 'm', 'kg', 'hora', 'global', 'lt', 'm²', 'ml', 'gr'];

@Component({
  selector: 'app-expense-order-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatTableModule, MatProgressSpinnerModule,
    MatTooltipModule, MatAutocompleteModule, MatDividerModule, FormErrorsComponent,
  ],
  templateUrl: './expense-order-form-dialog.component.html',
  styleUrl: './expense-order-form-dialog.component.scss',
})
export class ExpenseOrderFormDialogComponent implements OnInit {
  data: { order: ExpenseOrder | null; expenseSvc: ExpenseOrderService } = inject(MAT_DIALOG_DATA);
  private ref        = inject(MatDialogRef<ExpenseOrderFormDialogComponent>);
  private fb         = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  @ViewChildren('descInput') descInputs!: QueryList<ElementRef<HTMLInputElement>>;

  saving = signal(false);
  errors = signal<string[]>([]);
  readonly units = UNITS;

  // ── Typeahead proveedor ──────────────────────────────────────
  supplierQuery    = new FormControl('');
  supplierResults  = signal<ExpenseSupplier[]>([]);
  selectedSupplier = signal<ExpenseSupplier | null>(null);
  searchingSupplier = signal(false);

  // ── Crear proveedor inline ───────────────────────────────────
  showCreateSupplier = signal(false);
  creatingSupplier   = signal(false);
  createErrors       = signal<string[]>([]);
  createForm = this.fb.group({
    name:   ['', Validators.required],
    tax_id: [''],
    email:  [''],
    phone:  [''],
    notes:  [''],
  });

  // ── Formulario principal ─────────────────────────────────────
  form = this.fb.group({
    supplier_id: [null as number | null, Validators.required],
    notes: [''],
    expected_delivery_date: [''],
    items: this.fb.array([]),
  });

  get items() { return this.form.get('items') as FormArray; }
  get isEditMode() { return !!this.data.order; }

  ngOnInit(): void {
    this.initSupplierSearch();
    if (this.isEditMode) {
      this.loadExistingOrder();
    } else {
      this.addItem();
    }
  }

  // ── Búsqueda de proveedor ────────────────────────────────────

  private initSupplierSearch(): void {
    this.supplierQuery.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(q => {
      if (typeof q === 'string' && q.length >= 2) {
        this.searchingSupplier.set(true);
        this.data.expenseSvc.searchSuppliers(q).pipe(
          catchError(() => of({ data: [] as ExpenseSupplier[] }))
        ).subscribe(r => {
          this.supplierResults.set(r.data ?? []);
          this.searchingSupplier.set(false);
        });
      } else {
        this.supplierResults.set([]);
        this.searchingSupplier.set(false);
      }
    });
  }

  onSupplierSelected(event: MatAutocompleteSelectedEvent): void {
    const supplier = event.option.value as ExpenseSupplier | null;
    if (!supplier) return; // opción "Crear nuevo" — la maneja su propio (click)
    this.selectSupplier(supplier);
  }

  selectSupplier(supplier: ExpenseSupplier): void {
    this.selectedSupplier.set(supplier);
    this.form.patchValue({ supplier_id: supplier.id });
    this.supplierQuery.setValue(supplier.name, { emitEvent: false });
    this.supplierResults.set([]);
    this.showCreateSupplier.set(false);
  }

  clearSupplier(): void {
    this.selectedSupplier.set(null);
    this.form.patchValue({ supplier_id: null });
    this.supplierQuery.setValue('', { emitEvent: false });
    this.supplierResults.set([]);
  }

  displayFn(supplier: ExpenseSupplier | null): string {
    return supplier?.name ?? '';
  }

  /** Texto actual en el input (para el botón "Crear nuevo") */
  get currentQuery(): string {
    const v = this.supplierQuery.value;
    return typeof v === 'string' ? v : '';
  }

  // ── Crear proveedor inline ───────────────────────────────────

  openCreateSupplier(): void {
    this.createForm.reset({ name: this.currentQuery.trim() });
    this.createErrors.set([]);
    this.showCreateSupplier.set(true);
  }

  cancelCreateSupplier(): void {
    this.showCreateSupplier.set(false);
    this.createForm.reset();
    this.createErrors.set([]);
  }

  saveNewSupplier(): void {
    if (this.createForm.invalid || this.creatingSupplier()) return;
    this.creatingSupplier.set(true);
    this.createErrors.set([]);
    const v = this.createForm.value as any;
    this.data.expenseSvc.createExpenseSupplier({
      name: v.name,
      tax_id: v.tax_id || undefined,
      email: v.email || undefined,
      phone: v.phone || undefined,
      notes: v.notes || undefined,
    }).subscribe({
      next: r => {
        this.creatingSupplier.set(false);
        this.showCreateSupplier.set(false);
        this.selectSupplier(r.data!);
      },
      error: (err: any) => {
        this.creatingSupplier.set(false);
        if (err.status === 422) this.createErrors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        else this.createErrors.set([err.error?.message || 'Error al crear el proveedor']);
      },
    });
  }

  // ── Carga de orden existente ─────────────────────────────────

  private loadExistingOrder(): void {
    const o = this.data.order!;
    this.form.patchValue({
      supplier_id: o.supplier_id,
      notes: o.notes || '',
      expected_delivery_date: o.expected_delivery_date || '',
    });
    if (o.supplier) {
      const s: ExpenseSupplier = { id: o.supplier.id, name: o.supplier.name, supplier_type: 'expense' };
      this.selectedSupplier.set(s);
      this.supplierQuery.setValue(s.name, { emitEvent: false });
    }
    (o.items ?? []).forEach(item => {
      this.items.push(this.buildItemGroup({
        description: item.description,
        unit: item.unit,
        quantity: Number(item.quantity_requested),
        unit_price: Number(item.unit_price),
        tax_rate: item.tax_rate != null ? Number(item.tax_rate) : 0,
        notes: item.notes || '',
      }));
    });
    if ((o.items ?? []).length === 0) this.addItem();
  }

  private buildItemGroup(v?: { description?: string; unit?: string; quantity?: number; unit_price?: number; tax_rate?: number; notes?: string }) {
    return this.fb.group({
      description: [v?.description ?? '', [Validators.required, Validators.maxLength(255)]],
      unit:        [v?.unit ?? 'und', Validators.required],
      quantity:    [v?.quantity ?? 1,  [Validators.required, Validators.min(0.001)]],
      unit_price:  [v?.unit_price ?? 0, [Validators.required, Validators.min(0)]],
      tax_rate:    [v?.tax_rate ?? 0,  [Validators.min(0), Validators.max(100)]],
      notes:       [v?.notes ?? ''],
    });
  }

  addItem(): void {
    this.items.push(this.buildItemGroup());
    setTimeout(() => this.descInputs.last?.nativeElement.focus(), 0);
  }

  removeItem(i: number): void {
    if (this.items.length > 1) this.items.removeAt(i);
  }

  // ── Totales ──────────────────────────────────────────────────

  get totals(): { subtotal: number; tax: number; total: number } {
    let subtotal = 0; let tax = 0;
    for (const c of this.items.controls) {
      const qty = Number(c.get('quantity')?.value) || 0;
      const price = Number(c.get('unit_price')?.value) || 0;
      const rate = Number(c.get('tax_rate')?.value) || 0;
      const base = qty * price;
      subtotal += base;
      tax += base * rate / 100;
    }
    return { subtotal, tax, total: subtotal + tax };
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  }

  // ── Guardar ──────────────────────────────────────────────────

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.errors.set([]);
    const v = this.form.value;
    const payload = {
      supplier_id: v.supplier_id,
      notes: v.notes || undefined,
      expected_delivery_date: v.expected_delivery_date || undefined,
      items: (v.items as any[]).map(i => ({
        description: i.description,
        unit: i.unit,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate || 0,
        notes: i.notes || undefined,
      })),
    };
    const req$ = this.isEditMode
      ? this.data.expenseSvc.updateOrder(this.data.order!.id, payload)
      : this.data.expenseSvc.createOrder(payload);

    req$.subscribe({
      next: () => this.ref.close(true),
      error: (err: any) => {
        this.saving.set(false);
        if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        else this.errors.set([err.error?.message || 'Error al guardar la orden']);
      },
    });
  }
}

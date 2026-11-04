import {
  Component, Input, Output, EventEmitter, OnInit, OnChanges,
  SimpleChanges, inject, signal, OnDestroy, ViewChild, ElementRef, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, timer, takeUntil, finalize, filter, map, switchMap } from 'rxjs';
import { CatalogService, Product } from '../../../features/catalog/catalog.service';

@Component({
  selector: 'app-product-search',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatAutocompleteModule, MatFormFieldModule, MatInputModule,
    MatIconModule, MatButtonModule, MatProgressSpinnerModule, MatTooltipModule,
  ],
  templateUrl: './product-search.component.html',
  styleUrl: './product-search.component.scss',
})
export class ProductSearchComponent implements OnInit, OnChanges, OnDestroy {
  @Input() label = 'Producto';
  @Input() required = false;
  @Input() disabled = false;
  @Input() activeOnly = true;
  @Input() productType?: 'simple' | 'kit';
  @Input() selectedProduct: Product | null = null;
  @Output() productSelected = new EventEmitter<Product | null>();

  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

  private cSvc          = inject(CatalogService);
  private host          = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroy$      = new Subject<void>();
  /** Trigger unificado: permite que el Enter cancele cualquier debounce pendiente. */
  private searchTrigger$ = new Subject<{ term: string; immediate: boolean }>();

  searchCtrl = new FormControl<string | Product>('');
  results    = signal<Product[]>([]);
  loading    = signal(false);
  showClear  = signal(false);
  searched   = signal(false);
  /**
   * Ancho del panel de resultados. El campo puede ser angosto (p. ej. 180 px en
   * filtros), así que el panel crece hasta PANEL_MAX_WIDTH sin salirse del viewport.
   */
  panelWidth = signal<number | string>('');

  private static readonly PANEL_MAX_WIDTH = 520;
  private static readonly VIEWPORT_GUTTER = 16;

  displayFn = (value: Product | string | null): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return `${value.barcode} — ${value.name}`;
  };

  /** Texto completo del producto seleccionado (tooltip cuando el input lo recorta). */
  get selectedLabel(): string {
    const v = this.searchCtrl.value;
    return v && typeof v !== 'string' ? this.displayFn(v) : '';
  }

  /**
   * Recalcula el ancho antes de abrir el panel: al menos el ancho del campo y,
   * si hay espacio a la derecha, hasta PANEL_MAX_WIDTH.
   */
  @HostListener('window:resize')
  updatePanelWidth(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    if (!rect.width) return;
    const available = window.innerWidth - rect.left - ProductSearchComponent.VIEWPORT_GUTTER;
    const width = Math.max(rect.width, Math.min(ProductSearchComponent.PANEL_MAX_WIDTH, available));
    this.panelWidth.set(Math.floor(width));
  }

  ngOnInit(): void {
    // Alimenta el trigger con el tipeo normal del usuario.
    this.searchCtrl.valueChanges.pipe(
      filter(v => typeof v === 'string'),
      map(v => (v as string).trim()),
      takeUntil(this.destroy$),
    ).subscribe(term => {
      if (term.length < 2) {
        this.results.set([]);
        this.searched.set(false);
        if (!term) {
          this.showClear.set(false);
          this.productSelected.emit(null);
        }
        return;
      }
      this.searchTrigger$.next({ term, immediate: false });
    });

    // switchMap garantiza que un Enter (immediate) cancele el debounce pendiente
    // de los caracteres anteriores → sin doble petición.
    this.searchTrigger$.pipe(
      switchMap(({ term, immediate }) =>
        timer(immediate ? 0 : 300).pipe(map(() => ({ term, immediate })))
      ),
      takeUntil(this.destroy$),
    ).subscribe(({ term, immediate }) => this._search(term, immediate));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('selectedProduct' in changes) {
      const p = this.selectedProduct;
      this.searchCtrl.setValue(p ?? '', { emitEvent: false });
      this.showClear.set(!!p);
      if (!p) {
        this.results.set([]);
        this.searched.set(false);
      }
    }
    if ('disabled' in changes) {
      if (this.disabled) this.searchCtrl.disable({ emitEvent: false });
      else               this.searchCtrl.enable({ emitEvent: false });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Enter del teclado o del lector de barras → búsqueda inmediata sin esperar debounce. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    const val = this.searchCtrl.value;
    if (typeof val === 'string' && val.trim().length >= 2) {
      event.preventDefault();
      this.searchTrigger$.next({ term: val.trim(), immediate: true });
    }
  }

  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const product = event.option.value as Product;
    this.showClear.set(true);
    this.results.set([]);
    this.searched.set(false);
    this.productSelected.emit(product);
  }

  clear(): void {
    this.searchCtrl.setValue('', { emitEvent: false });
    this.results.set([]);
    this.searched.set(false);
    this.showClear.set(false);
    this.productSelected.emit(null);
  }

  focus(): void {
    this.searchInputRef?.nativeElement.focus();
  }

  private _search(term: string, immediate = false): void {
    this.loading.set(true);
    this.searched.set(false);
    this.cSvc.getProducts({
      search:       term,
      per_page:     20,
      is_active:    this.activeOnly ? '1' : undefined,
      product_type: this.productType,
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: r => {
          this.searched.set(true);
          this.results.set(r.data);
          // Lector de barras con resultado único → auto-selección directa.
          if (immediate && r.data.length === 1) {
            const product = r.data[0];
            this.searchCtrl.setValue(product, { emitEvent: false });
            this.showClear.set(true);
            this.results.set([]);
            this.searched.set(false);
            this.productSelected.emit(product);
          }
        },
        error: () => { this.results.set([]); this.searched.set(true); },
      });
  }
}

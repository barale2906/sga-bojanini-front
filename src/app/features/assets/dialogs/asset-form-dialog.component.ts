import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { AssetsService } from '../assets.service';
import { AssetCatalogStore } from '../asset-catalog.store';
import { Asset, AssetPayload, AssetStatus, toApiDate } from '../assets.models';
import { SitePlacePickerComponent } from '../shared/site-place-picker.component';

/**
 * Registro y edición de un activo. Ubicación, responsable y estado inicial
 * solo se piden al registrar; después cambian por traslado o cambio de estado.
 * El código lo genera el sistema.
 */
@Component({
  selector: 'app-asset-form-dialog',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatProgressSpinnerModule,
    FormErrorsComponent, SitePlacePickerComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ asset ? 'Editar activo ' + asset.code : 'Registrar activo' }}
    </h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      @if (!asset) {
        <p class="hint"><mat-icon>tag</mat-icon> El código del activo se genera automáticamente al guardar.</p>
      }

      <form [formGroup]="form" class="grid">
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>Nombre *</mat-label>
          <input matInput formControlName="name" maxlength="200">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Categoría *</mat-label>
          <mat-select formControlName="category_id">
            @for (c of store.categories(); track c.id) {
              <mat-option [value]="c.id">{{ c.code }} — {{ c.name }}</mat-option>
            }
          </mat-select>
          @if (selectedRequiresMaintenance()) {
            <mat-hint>Lleva hoja de vida y mantenimiento</mat-hint>
          }
        </mat-form-field>

        @if (!asset) {
          <mat-form-field appearance="outline">
            <mat-label>Estado inicial</mat-label>
            <mat-select formControlName="status">
              @for (s of store.catalogs()?.settable_statuses ?? []; track s.value) {
                <mat-option [value]="s.value">{{ s.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <div class="span-2">
            <app-site-place-picker [placeControl]="form.controls.place_id"></app-site-place-picker>
          </div>

          <mat-form-field appearance="outline" class="span-2">
            <mat-label>Responsable</mat-label>
            <mat-select formControlName="responsible_id">
              <mat-option [value]="null">Sin responsable</mat-option>
              @for (u of store.users(); track u.id) {
                <mat-option [value]="u.id">{{ u.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field appearance="outline">
          <mat-label>Marca</mat-label>
          <input matInput formControlName="brand" maxlength="100">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Modelo</mat-label>
          <input matInput formControlName="model" maxlength="100">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Serial</mat-label>
          <input matInput formControlName="serial" maxlength="100">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Fecha de adquisición</mat-label>
          <input matInput [matDatepicker]="acqPicker" formControlName="acquisition_date" [max]="today">
          <mat-datepicker-toggle matSuffix [for]="acqPicker"></mat-datepicker-toggle>
          <mat-datepicker #acqPicker></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Valor de adquisición</mat-label>
          <input matInput type="number" min="0" formControlName="acquisition_value">
          <span matTextPrefix>$&nbsp;</span>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Proveedor</mat-label>
          <mat-select formControlName="supplier_id">
            <mat-option [value]="null">—</mat-option>
            @for (s of store.suppliers(); track s.id) {
              <mat-option [value]="s.id">{{ s.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>N° de factura</mat-label>
          <input matInput formControlName="invoice_number" maxlength="50">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Garantía hasta</mat-label>
          <input matInput [matDatepicker]="warrantyPicker" formControlName="warranty_until">
          <mat-datepicker-toggle matSuffix [for]="warrantyPicker"></mat-datepicker-toggle>
          <mat-datepicker #warrantyPicker></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>Descripción</mat-label>
          <textarea matInput formControlName="description" rows="2"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>Observaciones</mat-label>
          <textarea matInput formControlName="notes" rows="2"></textarea>
        </mat-form-field>
        @if (!asset) {
          <mat-form-field appearance="outline" class="span-2">
            <mat-label>Comentario inicial</mat-label>
            <textarea matInput formControlName="comment" rows="2" maxlength="2000"></textarea>
            <mat-hint>Los comentarios del equipo se acumulan y no se editan</mat-hint>
          </mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18" class="inline-spinner"></mat-spinner> }
        {{ asset ? 'Guardar cambios' : 'Registrar activo' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:0 0.75rem; min-width:620px; padding-top:0.25rem; }
    .span-2 { grid-column: span 2; }
    .hint { display:flex; align-items:center; gap:0.35rem; color:#4a5568; font-size:0.85rem; margin:0 0 0.75rem; }
    .hint mat-icon { font-size:1.1rem; width:1.1rem; height:1.1rem; color:#C02F86; }
    .inline-spinner { display:inline-block; margin-right:6px; }
    @media (max-width: 720px) { .grid { grid-template-columns:1fr; min-width:0; } .span-2 { grid-column:auto; } }
  `],
})
export class AssetFormDialogComponent implements OnInit {
  asset: Asset | null = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AssetFormDialogComponent, Asset | null>);
  private svc = inject(AssetsService);
  private fb = inject(FormBuilder);
  store = inject(AssetCatalogStore);

  readonly today = new Date();
  saving = signal(false);
  errors = signal<string[]>([]);

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    category_id: [null as number | null, Validators.required],
    status: ['operational' as AssetStatus],
    place_id: [null as number | null],
    responsible_id: [null as number | null],
    brand: [''],
    model: [''],
    serial: [''],
    acquisition_date: [null as Date | null],
    acquisition_value: [null as number | null, Validators.min(0)],
    supplier_id: [null as number | null],
    invoice_number: [''],
    warranty_until: [null as Date | null],
    description: [''],
    notes: [''],
    comment: [''],
  });

  ngOnInit(): void {
    this.store.load().subscribe();

    if (!this.asset) {
      this.form.controls.place_id.addValidators(Validators.required);
      return;
    }

    this.form.patchValue({
      name: this.asset.name,
      category_id: this.asset.category?.id ?? null,
      brand: this.asset.brand ?? '',
      model: this.asset.model ?? '',
      serial: this.asset.serial ?? '',
      acquisition_date: this.asset.acquisition_date ? new Date(`${this.asset.acquisition_date}T00:00:00`) : null,
      acquisition_value: this.asset.acquisition_value !== null ? Number(this.asset.acquisition_value) : null,
      supplier_id: this.asset.supplier_id,
      invoice_number: this.asset.invoice_number ?? '',
      warranty_until: this.asset.warranty_until ? new Date(`${this.asset.warranty_until}T00:00:00`) : null,
      description: this.asset.description ?? '',
      notes: this.asset.notes ?? '',
    });
  }

  selectedRequiresMaintenance(): boolean {
    return this.store.requiresMaintenance(this.form.controls.category_id.value);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.errors.set([]);

    const v = this.form.getRawValue();
    const payload: AssetPayload = {
      name: v.name!.trim(),
      category_id: v.category_id!,
      brand: v.brand || null,
      model: v.model || null,
      serial: v.serial || null,
      acquisition_date: toApiDate(v.acquisition_date),
      acquisition_value: v.acquisition_value ?? null,
      supplier_id: v.supplier_id,
      invoice_number: v.invoice_number || null,
      warranty_until: toApiDate(v.warranty_until),
      description: v.description || null,
      notes: v.notes || null,
    };

    if (!this.asset) {
      Object.assign(payload, {
        place_id: v.place_id!,
        responsible_id: v.responsible_id,
        status: v.status,
        comment: v.comment || null,
      });
    }

    const request$ = this.asset ? this.svc.update(this.asset.id, payload) : this.svc.create(payload);

    request$.subscribe({
      next: res => this.ref.close(res.data),
      error: err => {
        this.saving.set(false);
        this.errors.set(err.status === 422
          ? Object.values(err.error?.errors ?? {}).flat() as string[]
          : [err.error?.message ?? 'No fue posible guardar el activo.']);
      },
    });
  }
}

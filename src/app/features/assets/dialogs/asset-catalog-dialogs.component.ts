import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Observable } from 'rxjs';
import { ApiResponse } from '../../../core/models/api-response.model';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { AssetsService } from '../assets.service';
import { AssetCategory, AssetPlace, AssetSite, AssetType } from '../assets.models';

/** Manejo común de guardado y errores para los diálogos de catálogos. */
abstract class CatalogDialog<T> {
  protected ref = inject(MatDialogRef<unknown, T | null>);
  protected svc = inject(AssetsService);
  protected fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);

  protected persist(request$: Observable<ApiResponse<T>>): void {
    this.saving.set(true);
    this.errors.set([]);
    request$.subscribe({
      next: res => this.ref.close(res.data),
      error: err => {
        this.saving.set(false);
        this.errors.set(err.status === 422
          ? Object.values(err.error?.errors ?? {}).flat() as string[]
          : [err.error?.message ?? 'No fue posible guardar.']);
      },
    });
  }
}

const DIALOG_IMPORTS = [
  ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
  MatButtonModule, MatSlideToggleModule, FormErrorsComponent,
];

const DIALOG_STYLES = `.form-col { display:flex; flex-direction:column; gap:0.25rem; min-width:400px; padding-top:0.5rem; }`;

@Component({
  selector: 'app-asset-category-dialog',
  standalone: true,
  imports: DIALOG_IMPORTS,
  template: `
    <h2 mat-dialog-title>{{ category ? 'Editar categoría' : 'Nueva categoría' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="form-col">
        <mat-form-field appearance="outline">
          <mat-label>Código *</mat-label>
          <input matInput formControlName="code" maxlength="20" style="text-transform:uppercase">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Nombre *</mat-label>
          <input matInput formControlName="name" maxlength="120">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Tipo de activo *</mat-label>
          <mat-select formControlName="asset_type">
            <mat-option value="biomedical">Equipo biomédico</mat-option>
            <mat-option value="computing">Equipo de cómputo</mat-option>
            <mat-option value="general">General (mobiliario y otros)</mat-option>
          </mat-select>
          <mat-hint>Biomédico y cómputo llevan hoja de vida y mantenimiento</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Descripción</mat-label>
          <textarea matInput formControlName="description" rows="2"></textarea>
        </mat-form-field>
        @if (category) {
          <mat-slide-toggle formControlName="is_active" color="primary">Activa</mat-slide-toggle>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [DIALOG_STYLES],
})
export class AssetCategoryDialogComponent extends CatalogDialog<AssetCategory> {
  category: AssetCategory | null = inject(MAT_DIALOG_DATA);

  form = this.fb.group({
    code: [this.category?.code ?? '', [Validators.required, Validators.maxLength(20)]],
    name: [this.category?.name ?? '', [Validators.required, Validators.maxLength(120)]],
    asset_type: [(this.category?.asset_type ?? 'biomedical') as AssetType, Validators.required],
    description: [this.category?.description ?? ''],
    is_active: [this.category?.is_active ?? true],
  });

  save(): void {
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    this.persist(this.svc.saveCategory({
      code: v.code!.toUpperCase().trim(),
      name: v.name!.trim(),
      asset_type: v.asset_type!,
      description: v.description || null,
      is_active: v.is_active!,
    }, this.category?.id));
  }
}

@Component({
  selector: 'app-asset-site-dialog',
  standalone: true,
  imports: DIALOG_IMPORTS,
  template: `
    <h2 mat-dialog-title>{{ site ? 'Editar sede' : 'Nueva sede' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="form-col">
        <mat-form-field appearance="outline">
          <mat-label>Nombre *</mat-label>
          <input matInput formControlName="name" maxlength="120" placeholder="Clínica, Edificio 2…">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Dirección</mat-label>
          <input matInput formControlName="address">
        </mat-form-field>
        @if (site) {
          <mat-slide-toggle formControlName="is_active" color="primary">Activa</mat-slide-toggle>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [DIALOG_STYLES],
})
export class AssetSiteDialogComponent extends CatalogDialog<AssetSite> {
  site: AssetSite | null = inject(MAT_DIALOG_DATA);

  form = this.fb.group({
    name: [this.site?.name ?? '', [Validators.required, Validators.maxLength(120)]],
    address: [this.site?.address ?? ''],
    is_active: [this.site?.is_active ?? true],
  });

  save(): void {
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    this.persist(this.svc.saveSite({ name: v.name!.trim(), address: v.address || null, is_active: v.is_active! }, this.site?.id));
  }
}

export interface AssetPlaceDialogData {
  site: AssetSite;
  place: AssetPlace | null;
}

@Component({
  selector: 'app-asset-place-dialog',
  standalone: true,
  imports: DIALOG_IMPORTS,
  template: `
    <h2 mat-dialog-title>{{ data.place ? 'Editar sitio' : 'Nuevo sitio' }} — {{ data.site.name }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="form-col">
        <mat-form-field appearance="outline">
          <mat-label>Nombre del sitio *</mat-label>
          <input matInput formControlName="name" maxlength="120" placeholder="Consultorio 1, Call center…">
        </mat-form-field>
        @if (data.place) {
          <mat-slide-toggle formControlName="is_active" color="primary">Activo</mat-slide-toggle>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [DIALOG_STYLES],
})
export class AssetPlaceDialogComponent extends CatalogDialog<AssetPlace> {
  data: AssetPlaceDialogData = inject(MAT_DIALOG_DATA);

  form = this.fb.group({
    name: [this.data.place?.name ?? '', [Validators.required, Validators.maxLength(120)]],
    is_active: [this.data.place?.is_active ?? true],
  });

  save(): void {
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    this.persist(this.svc.savePlace({ site_id: this.data.site.id, name: v.name!.trim(), is_active: v.is_active! }, this.data.place?.id));
  }
}

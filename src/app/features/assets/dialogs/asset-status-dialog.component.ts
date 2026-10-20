import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { AssetsService } from '../assets.service';
import { AssetCatalogStore } from '../asset-catalog.store';
import { Asset, AssetStatus } from '../assets.models';

/** Cambio manual de estado (la baja se registra como traslado con firma). */
@Component({
  selector: 'app-asset-status-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, FormErrorsComponent],
  template: `
    <h2 mat-dialog-title class="dlg-title"><mat-icon>published_with_changes</mat-icon> Cambiar estado — {{ asset.code }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="form-col" style="min-width:380px">
        <mat-form-field appearance="outline">
          <mat-label>Nuevo estado *</mat-label>
          <mat-select formControlName="status">
            @for (s of store.catalogs()?.settable_statuses ?? []; track s.value) {
              <mat-option [value]="s.value" [disabled]="s.value === asset.status">{{ s.label }}</mat-option>
            }
          </mat-select>
          <mat-hint>Para dar de baja use Trasladar → Baja</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Motivo</mat-label>
          <textarea matInput formControlName="reason" rows="2" maxlength="1000"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">Guardar</button>
    </mat-dialog-actions>
  `,
  styleUrl: './asset-dialogs.scss',
})
export class AssetStatusDialogComponent {
  asset: Asset = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AssetStatusDialogComponent, Asset | null>);
  private svc = inject(AssetsService);
  store = inject(AssetCatalogStore);

  saving = signal(false);
  errors = signal<string[]>([]);

  form = inject(FormBuilder).group({
    status: [null as AssetStatus | null, Validators.required],
    reason: [''],
  });

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    this.svc.changeStatus(this.asset.id, this.form.value.status!, this.form.value.reason).subscribe({
      next: res => this.ref.close(res.data),
      error: err => {
        this.saving.set(false);
        this.errors.set([err.error?.message ?? 'No fue posible cambiar el estado.']);
      },
    });
  }
}

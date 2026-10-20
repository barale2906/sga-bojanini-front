import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { AssetsService } from '../assets.service';
import { AssetCatalogStore } from '../asset-catalog.store';
import { AssetDocument, AssetDocumentType, toApiDate } from '../assets.models';

export interface DocumentUploadDialogData {
  assetId: number;
  maintenanceId?: number | null;
}

/** Máximo permitido por el backend (10 MB). */
const MAX_BYTES = 10 * 1024 * 1024;

/** Carga un documento del activo o un soporte de mantenimiento (PDF/JPG/PNG). */
@Component({
  selector: 'app-document-upload-dialog',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title class="dlg-title"><mat-icon>upload_file</mat-icon> Cargar documento</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="form-grid" style="min-width:460px">
        <div class="span-2 file-pick">
          <button mat-stroked-button type="button" (click)="fileInput.click()"><mat-icon>attach_file</mat-icon> Seleccionar archivo</button>
          <span>{{ file()?.name ?? 'PDF, JPG o PNG — máx. 10 MB' }}</span>
          <input #fileInput type="file" hidden accept=".pdf,.jpg,.jpeg,.png" (change)="onFile($event)">
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Tipo *</mat-label>
          <mat-select formControlName="document_type">
            @for (t of store.catalogs()?.document_types ?? []; track t.value) {
              <mat-option [value]="t.value">{{ t.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Título *</mat-label>
          <input matInput formControlName="title" maxlength="150">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Fecha de emisión</mat-label>
          <input matInput [matDatepicker]="issuedPicker" formControlName="issued_at">
          <mat-datepicker-toggle matSuffix [for]="issuedPicker"></mat-datepicker-toggle>
          <mat-datepicker #issuedPicker></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Vence</mat-label>
          <input matInput [matDatepicker]="expiresPicker" formControlName="expires_at">
          <mat-datepicker-toggle matSuffix [for]="expiresPicker"></mat-datepicker-toggle>
          <mat-datepicker #expiresPicker></mat-datepicker>
          <mat-hint>Certificados: se avisa antes de vencer</mat-hint>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || !file() || saving()">Cargar</button>
    </mat-dialog-actions>
  `,
  styleUrl: './asset-dialogs.scss',
  styles: [`.file-pick { display:flex; align-items:center; gap:0.75rem; margin-bottom:0.75rem; color:#4a5568; font-size:0.85rem; }`],
})
export class DocumentUploadDialogComponent {
  data: DocumentUploadDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<DocumentUploadDialogComponent, AssetDocument | null>);
  private svc = inject(AssetsService);
  store = inject(AssetCatalogStore);

  file = signal<File | null>(null);
  saving = signal(false);
  errors = signal<string[]>([]);

  form = inject(FormBuilder).group({
    document_type: [(this.data.maintenanceId ? 'service_report' : 'manual') as AssetDocumentType, Validators.required],
    title: ['', [Validators.required, Validators.maxLength(150)]],
    issued_at: [null as Date | null],
    expires_at: [null as Date | null],
  });

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    if (file.size > MAX_BYTES) {
      this.errors.set(['El archivo no puede superar 10 MB.']);
      return;
    }

    this.errors.set([]);
    this.file.set(file);
    if (!this.form.value.title) {
      this.form.patchValue({ title: file.name.replace(/\.[^.]+$/, '') });
    }
  }

  save(): void {
    const file = this.file();
    if (!file || this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const v = this.form.getRawValue();

    this.svc.uploadDocument(this.data.assetId, {
      file,
      document_type: v.document_type!,
      title: v.title!,
      maintenance_id: this.data.maintenanceId ?? null,
      issued_at: toApiDate(v.issued_at),
      expires_at: toApiDate(v.expires_at),
    }).subscribe({
      next: res => this.ref.close(res.data),
      error: err => {
        this.saving.set(false);
        this.errors.set(err.status === 422
          ? Object.values(err.error?.errors ?? {}).flat() as string[]
          : [err.error?.message ?? 'No fue posible cargar el documento.']);
      },
    });
  }
}

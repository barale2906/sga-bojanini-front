import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { CatalogService } from '../catalog.service';
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatDividerModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>upload_file</mat-icon>
      Importar {{ data.entity === 'products' ? 'Productos' : 'Proveedores' }}
    </h2>
    <mat-dialog-content class="import-content">
      <p class="hint">Descarga la plantilla Excel, llénala y súbela aquí.</p>

      <button mat-stroked-button (click)="downloadTemplate()" [disabled]="downloading()">
        @if (downloading()) { <mat-spinner diameter="18"></mat-spinner> }
        <mat-icon>download</mat-icon> Descargar Plantilla Excel
      </button>

      <mat-divider style="margin:1.5rem 0;"></mat-divider>

      <div class="upload-area" (click)="fileInput.click()" [class.has-file]="selectedFile()">
        <mat-icon>cloud_upload</mat-icon>
        <p>{{ selectedFile() ? selectedFile()!.name : 'Haz clic para seleccionar el archivo .xlsx' }}</p>
        <input #fileInput type="file" accept=".xlsx,.xls" (change)="onFileSelected($event)" style="display:none" />
      </div>

      @if (resultData(); as r) {
        <div class="result" [class.has-errors]="r.errors.length > 0">
          <mat-icon>{{ r.errors.length ? 'warning' : 'check_circle' }}</mat-icon>
          <div>
            <strong>{{ r.imported }} registros importados</strong>
            @if (r.errors.length) {
              <p>{{ r.errors.length }} errores encontrados:</p>
              <ul>@for (e of r.errors.slice(0, 5); track e.row) { <li>Fila {{ e.row }}: {{ e.errors.join(', ') }}</li> }</ul>
            }
          </div>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cerrar</button>
      <button mat-raised-button color="primary" (click)="upload()" [disabled]="!selectedFile() || uploading()">
        @if (uploading()) { <mat-spinner diameter="18"></mat-spinner> } Importar
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `.import-content { display: flex; flex-direction: column; gap: 1rem; padding: 0.5rem 0; min-height: 200px; }`,
    `.hint { color: #718096; font-size: 0.875rem; margin: 0; }`,
    `.upload-area { border: 2px dashed #CBD5E0; border-radius: 8px; padding: 2rem; text-align: center; cursor: pointer; transition: border-color 150ms; &:hover,&.has-file { border-color: #FFCF01; background: #fffbf0; } mat-icon { font-size: 2.5rem; width: 2.5rem; height: 2.5rem; color: #a0aec0; display: block; margin: 0 auto 0.5rem; } p { margin: 0; color: #718096; font-size: 0.875rem; } }`,
    `.result { display: flex; gap: 0.75rem; align-items: flex-start; background: #f0fff4; border: 1px solid #9ae6b4; border-radius: 8px; padding: 1rem; font-size: 0.875rem; &.has-errors { background: #fffbeb; border-color: #fbd38d; } mat-icon { font-size: 1.5rem; width: 1.5rem; height: 1.5rem; color: #38a169; flex-shrink: 0; } ul { margin: 0.25rem 0 0 1rem; padding: 0; } p { margin: 0.25rem 0; } }`,
  ],
})
export class ImportDialogComponent {
  data: { entity: 'products' | 'suppliers'; catalogSvc: CatalogService } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ImportDialogComponent>);

  downloading = signal(false);
  uploading = signal(false);
  selectedFile = signal<File | null>(null);
  result = signal<{ imported: number; errors: any[] } | null>(null);
  resultData = this.result; // alias para usarlo en el template sin non-null assertion

  downloadTemplate(): void {
    this.downloading.set(true);
    this.data.catalogSvc.downloadTemplate(this.data.entity).subscribe({
      next: blob => { saveAs(blob, `template_${this.data.entity}.xlsx`); this.downloading.set(false); },
      error: () => this.downloading.set(false),
    });
  }

  onFileSelected(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.selectedFile.set(file);
  }

  upload(): void {
    const file = this.selectedFile();
    if (!file || this.uploading()) return;
    this.uploading.set(true);
    const req$ = this.data.entity === 'products'
      ? this.data.catalogSvc.importProducts(file)
      : this.data.catalogSvc.importSuppliers(file);
    req$.subscribe({
      next: res => { this.result.set(res.data); this.uploading.set(false); },
      error: err => { this.uploading.set(false); this.result.set({ imported: 0, errors: [{ row: 0, errors: [err.error?.message || 'Error desconocido'] }] }); },
    });
  }
}

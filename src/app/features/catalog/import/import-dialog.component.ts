import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { CatalogService, ImportResult } from '../catalog.service';

export type ImportEntity = 'products' | 'suppliers';

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [
    CommonModule, MatDialogModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, MatTableModule,
  ],
  template: `
    <h2 mat-dialog-title>
      Importar {{ data === 'products' ? 'Productos' : 'Proveedores' }}
    </h2>
    <mat-dialog-content style="min-width:480px">

      @if (!result()) {
        <div class="upload-zone" [class.drag-over]="dragging()"
             (dragover)="$event.preventDefault(); dragging.set(true)"
             (dragleave)="dragging.set(false)"
             (drop)="onDrop($event)">
          <mat-icon class="upload-icon">upload_file</mat-icon>
          <p>Arrastra un archivo <strong>.xlsx, .xls o .csv</strong> aquí</p>
          <p class="hint">o</p>
          <button mat-stroked-button (click)="fileInput.click()" [disabled]="uploading()">
            Seleccionar archivo
          </button>
          <input #fileInput type="file" accept=".xlsx,.xls,.csv" style="display:none" (change)="onFileChange($event)" />
        </div>

        <div class="template-hint">
          <mat-icon style="font-size:1rem;vertical-align:middle">info</mat-icon>
          <button mat-button color="primary" (click)="downloadTemplate()" [disabled]="downloading()">
            @if (downloading()) { <mat-spinner diameter="14" style="display:inline-block"></mat-spinner> }
            Descargar plantilla Excel
          </button>
        </div>

        @if (uploading()) {
          <div style="text-align:center;padding:1.5rem">
            <mat-spinner diameter="40"></mat-spinner>
            <p>Procesando archivo...</p>
          </div>
        }

        @if (uploadError()) {
          <p class="upload-error">{{ uploadError() }}</p>
        }
      }

      @if (result(); as r) {
        <div class="result-summary">
          <div class="stat stat--ok"><span class="stat-n">{{ r.success }}</span><span class="stat-l">Exitosos</span></div>
          <div class="stat stat--err"><span class="stat-n">{{ r.failed }}</span><span class="stat-l">Con errores</span></div>
          <div class="stat stat--total"><span class="stat-n">{{ r.total }}</span><span class="stat-l">Total filas</span></div>
        </div>
        @if (r.errors.length) {
          <p style="font-weight:600;margin:1rem 0 0.5rem">Filas con errores:</p>
          <div class="error-list">
            @for (e of r.errors; track e.row) {
              <div class="error-row">
                <span class="row-label">Fila {{ e.row }}:</span>
                <span>{{ formatRowErrors(e.errors) }}</span>
              </div>
            }
          </div>
        }
      }

    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="!!result()">{{ result() ? 'Cerrar' : 'Cancelar' }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .upload-zone {
      border: 2px dashed #CBD5E0; border-radius: 8px; padding: 2rem;
      text-align: center; cursor: pointer; transition: border-color .2s;
      &.drag-over { border-color: #4299e1; background: #ebf8ff; }
      .upload-icon { font-size: 3rem; width: 3rem; height: 3rem; color: #a0aec0; }
      p { color: #4a5568; margin: 0.5rem 0; }
      .hint { color: #a0aec0; }
    }
    .template-hint { display:flex; align-items:center; gap:0.25rem; margin-top:0.75rem; color:#718096; font-size:.85rem; }
    .upload-error { color:#c53030; background:#fff5f5; border-left:3px solid #fc8181; padding:0.5rem 0.75rem; border-radius:4px; }
    .result-summary { display:flex; gap:1.5rem; justify-content:center; padding:1rem 0; }
    .stat { text-align:center; .stat-n { display:block; font-size:2rem; font-weight:700; } .stat-l { font-size:.8rem; color:#718096; } }
    .stat--ok .stat-n { color:#276749; }
    .stat--err .stat-n { color:#c53030; }
    .stat--total .stat-n { color:#2b6cb0; }
    .error-list { max-height:200px; overflow-y:auto; border:1px solid #fed7d7; border-radius:4px; }
    .error-row { padding:0.4rem 0.75rem; font-size:.83rem; border-bottom:1px solid #fff5f5; .row-label { font-weight:600; margin-right:0.5rem; } }
  `],
})
export class ImportDialogComponent {
  data: ImportEntity = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ImportDialogComponent>);
  private svc = inject(CatalogService);

  uploading = signal(false);
  downloading = signal(false);
  dragging = signal(false);
  uploadError = signal('');
  result = signal<ImportResult | null>(null);

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.upload(file);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.upload(file);
  }

  upload(file: File): void {
    this.uploading.set(true);
    this.uploadError.set('');
    const req$ = this.data === 'products'
      ? this.svc.importProducts(file)
      : this.svc.importSuppliers(file);

    req$.subscribe({
      next: r => { this.uploading.set(false); this.result.set(r.data); },
      error: err => {
        this.uploading.set(false);
        this.uploadError.set(err.error?.message || 'Error al procesar el archivo');
      },
    });
  }

  downloadTemplate(): void {
    this.downloading.set(true);
    this.svc.downloadTemplate(this.data).subscribe({
      next: blob => {
        this.downloading.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.data}_template.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => { this.downloading.set(false); },
    });
  }

  formatRowErrors(errors: Record<string, string[]>): string {
    return Object.values(errors).flat().join('; ');
  }
}

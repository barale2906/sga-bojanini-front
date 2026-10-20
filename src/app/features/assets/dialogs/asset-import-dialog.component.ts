import { Component, inject, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AssetsService } from '../assets.service';
import { AssetImportResult, ImportRowError } from '../assets.models';

/** Carga masiva de activos con la plantilla Excel. Cierra con `true` si se importó algo. */
@Component({
  selector: 'app-asset-import-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title class="dlg-title"><mat-icon>upload_file</mat-icon> Importar activos</h2>
    <mat-dialog-content class="dlg-content">
      @if (!result()) {
        <ol class="steps">
          <li>Descargue la plantilla: incluye las categorías y sedes/sitios vigentes y una hoja de instrucciones.</li>
          <li>Diligencie la hoja <strong>Activos</strong> (el código se genera solo). Opcional: hojas de vida y plan de mantenimiento.</li>
          <li>Cargue el archivo. Las filas con error no detienen la importación.</li>
        </ol>

        <button mat-stroked-button color="primary" (click)="downloadTemplate()" [disabled]="downloading()">
          @if (downloading()) { <mat-spinner diameter="16" class="inline-spinner"></mat-spinner> } @else { <mat-icon>download</mat-icon> }
          Descargar plantilla
        </button>

        <div class="upload-zone" [class.drag-over]="dragging()"
             (dragover)="$event.preventDefault(); dragging.set(true)"
             (dragleave)="dragging.set(false)"
             (drop)="onDrop($event)">
          <mat-icon class="upload-icon">cloud_upload</mat-icon>
          <p>Arrastre aquí el archivo <strong>.xlsx</strong> o</p>
          <button mat-flat-button color="primary" (click)="fileInput.click()" [disabled]="uploading()">Seleccionar archivo</button>
          <input #fileInput type="file" accept=".xlsx,.xls" hidden (change)="onFileChange($event)">
        </div>

        @if (uploading()) {
          <div class="processing"><mat-spinner diameter="36"></mat-spinner> Procesando archivo…</div>
        }
        @if (uploadError()) { <p class="upload-error">{{ uploadError() }}</p> }
      }

      @if (result(); as r) {
        <div class="result-summary">
          <div class="stat stat--ok"><span class="n">{{ r.created }}</span><span>Activos creados</span></div>
          <div class="stat stat--err"><span class="n">{{ r.failed }}</span><span>Filas con error</span></div>
          <div class="stat"><span class="n">{{ r.technical_profiles.created }}</span><span>Hojas de vida</span></div>
          <div class="stat"><span class="n">{{ r.related_catalogs.categories.created + r.related_catalogs.places.created }}</span><span>Catálogos nuevos</span></div>
        </div>

        @if (allErrors(r).length) {
          <p class="errors-title">Filas con errores</p>
          <div class="error-list">
            @for (e of allErrors(r); track $index) {
              <div class="error-row">
                <span class="row-label">{{ e.sheet }} · fila {{ e.row }}</span>
                <span>{{ formatErrors(e) }}</span>
              </div>
            }
          </div>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="(result()?.created ?? 0) > 0">{{ result() ? 'Cerrar' : 'Cancelar' }}</button>
    </mat-dialog-actions>
  `,
  styleUrl: './asset-dialogs.scss',
  styles: [`
    .steps { margin:0 0 1rem 1.1rem; padding:0; color:#4a5568; font-size:0.88rem; line-height:1.6; }
    .upload-zone { margin-top:1rem; border:2px dashed #cbd5e0; border-radius:10px; padding:1.5rem; text-align:center; color:#4a5568; }
    .upload-zone.drag-over { border-color:#C02F86; background:#fdf2f8; }
    .upload-icon { font-size:2.5rem; width:2.5rem; height:2.5rem; color:#a0aec0; }
    .processing { display:flex; align-items:center; gap:0.75rem; justify-content:center; padding:1rem; color:#4a5568; }
    .upload-error { color:#c53030; margin-top:0.75rem; }
    .result-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:0.5rem; }
    .stat { display:flex; flex-direction:column; align-items:center; padding:0.75rem; border-radius:8px; background:#f7fafc; font-size:0.8rem; color:#4a5568; }
    .stat .n { font-size:1.5rem; font-weight:700; color:#2d3748; }
    .stat--ok .n { color:#2f855a; } .stat--err .n { color:#c53030; }
    .errors-title { font-weight:600; margin:1rem 0 0.5rem; }
    .error-list { max-height:260px; overflow:auto; border:1px solid #fed7d7; border-radius:8px; }
    .error-row { display:flex; gap:0.75rem; padding:0.4rem 0.75rem; border-bottom:1px solid #fff5f5; font-size:0.82rem; }
    .row-label { font-weight:600; color:#c53030; white-space:nowrap; }
  `],
})
export class AssetImportDialogComponent {
  private svc = inject(AssetsService);

  dragging = signal(false);
  uploading = signal(false);
  downloading = signal(false);
  uploadError = signal<string | null>(null);
  result = signal<AssetImportResult | null>(null);

  downloadTemplate(): void {
    this.downloading.set(true);
    this.svc.downloadTemplate().subscribe({
      next: () => this.downloading.set(false),
      error: err => {
        this.downloading.set(false);
        this.uploadError.set(err.error?.message ?? 'No fue posible descargar la plantilla.');
      },
    });
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.upload(file);
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.upload(file);
    input.value = '';
  }

  allErrors(r: AssetImportResult): ImportRowError[] {
    return [
      ...r.related_catalogs.categories.errors,
      ...r.related_catalogs.places.errors,
      ...r.errors,
      ...r.technical_profiles.errors,
    ];
  }

  formatErrors(error: ImportRowError): string {
    return Object.entries(error.errors).map(([field, msgs]) => `${field}: ${msgs.join(', ')}`).join(' · ');
  }

  private upload(file: File): void {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      this.uploadError.set('Seleccione un archivo de Excel (.xlsx).');
      return;
    }

    this.uploading.set(true);
    this.uploadError.set(null);
    this.svc.import(file).subscribe({
      next: res => { this.uploading.set(false); this.result.set(res.data); },
      error: err => {
        this.uploading.set(false);
        this.uploadError.set(err.status === 422
          ? (Object.values(err.error?.errors ?? {}).flat() as string[]).join(' ')
          : err.error?.message ?? 'No fue posible importar el archivo.');
      },
    });
  }
}

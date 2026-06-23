import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InventoryService, InitialEntriesImportResult } from '../inventory.service';
import { Warehouse } from '../../warehouse/warehouse.service';

export interface InitialEntriesImportDialogData {
  warehouses: Warehouse[];
}

@Component({
  selector: 'app-initial-entries-import-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatSelectModule, MatProgressSpinnerModule,
  ],
  templateUrl: './initial-entries-import-dialog.component.html',
  styleUrl: './initial-entries-import-dialog.component.scss',
})
export class InitialEntriesImportDialogComponent {
  data: InitialEntriesImportDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<InitialEntriesImportDialogComponent>);
  private svc = inject(InventoryService);
  private snack = inject(MatSnackBar);

  warehouseId: number | null = null;

  downloading = signal(false);
  uploading = signal(false);
  dragging = signal(false);
  uploadError = signal('');
  result = signal<InitialEntriesImportResult | null>(null);

  get activeWarehouses(): Warehouse[] {
    return this.data.warehouses.filter(w => w.is_active);
  }

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
    this.svc.importInitialEntries(file, this.warehouseId ?? undefined).subscribe({
      next: r => { this.uploading.set(false); this.result.set(r.data); },
      error: err => {
        this.uploading.set(false);
        this.uploadError.set(err.error?.message || 'Error al procesar el archivo');
      },
    });
  }

  downloadTemplate(): void {
    this.downloading.set(true);
    this.svc.downloadInitialEntriesTemplate(this.warehouseId ?? undefined).subscribe({
      next: blob => {
        this.downloading.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'initial_entries_template.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: async err => {
        this.downloading.set(false);
        let message = 'No se pudo descargar la plantilla';
        if (err.error instanceof Blob) {
          try {
            const text = await err.error.text();
            message = JSON.parse(text)?.message || message;
          } catch {
            // respuesta de error sin cuerpo JSON legible
          }
        } else {
          message = err.error?.message || message;
        }
        this.snack.open(message, 'OK', { duration: 4000 });
      },
    });
  }

  formatRowErrors(errors: Record<string, string[]>): string {
    return Object.values(errors).flat().join('; ');
  }

  close(): void {
    const r = this.result();
    this.ref.close(!!r && r.success > 0);
  }
}

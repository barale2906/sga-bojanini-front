import { Component, inject, signal, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize } from 'rxjs/operators';
import { ServiceOrdersService, PriceListImportResult } from '../service-orders.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-price-lists-page',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatSnackBarModule,
    PageHeaderComponent,
  ],
  templateUrl: './price-lists-page.component.html',
  styleUrl: './price-lists-page.component.scss',
})
export class PriceListsPageComponent {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private svc   = inject(ServiceOrdersService);
  private snack = inject(MatSnackBar);

  downloading   = signal(false);
  uploading     = signal(false);
  uploadResult  = signal<PriceListImportResult | null>(null);
  uploadError   = signal<string | null>(null);
  selectedFile  = signal<File | null>(null);

  downloadTemplate(): void {
    this.downloading.set(true);
    this.svc.downloadPriceListTemplate()
      .pipe(finalize(() => this.downloading.set(false)))
      .subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a');
          a.href     = url;
          a.download = 'plantilla-precios.xlsx';
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.snack.open('Error al descargar la plantilla', 'Cerrar', { duration: 4000 });
        },
      });
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0] ?? null;
    this.selectedFile.set(file);
    this.uploadResult.set(null);
    this.uploadError.set(null);
  }

  upload(): void {
    const file = this.selectedFile();
    if (!file) return;
    this.uploading.set(true);
    this.uploadResult.set(null);
    this.uploadError.set(null);

    this.svc.importPriceList(file)
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe({
        next: res => {
          this.uploadResult.set(res.data);
          this.selectedFile.set(null);
          if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
          const msg = `Lista cargada: ${res.data.processed} precio(s) actualizados.`;
          this.snack.open(msg, 'OK', { duration: 5000 });
        },
        error: err => {
          const msg = err.error?.message || 'Error al cargar la lista de precios';
          this.uploadError.set(msg);
        },
      });
  }

  clearFile(): void {
    this.selectedFile.set(null);
    this.uploadResult.set(null);
    this.uploadError.set(null);
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
  }
}

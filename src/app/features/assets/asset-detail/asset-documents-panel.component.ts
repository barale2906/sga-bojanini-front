import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AssetsService } from '../assets.service';
import { AssetDocument } from '../assets.models';
import { DocumentUploadDialogComponent } from '../dialogs/document-upload-dialog.component';

/** Documentos del activo y soportes de sus mantenimientos (descarga autenticada). */
@Component({
  selector: 'app-asset-documents-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, MatTableModule, MatButtonModule, MatIconModule, MatTooltipModule, PermissionDirective],
  template: `
    <div class="panel-head">
      <span class="hint">Manuales, factura, garantía, registro INVIMA, certificados y soportes de mantenimiento.</span>
      @if (!readonly) {
        <button *sgaPermission="'activos_documentos.cargar'" mat-flat-button color="primary" (click)="upload()">
          <mat-icon>upload_file</mat-icon> Cargar documento
        </button>
      }
    </div>
    <div class="table-wrap mat-elevation-z1">
      <table mat-table [dataSource]="documents()">
        <ng-container matColumnDef="type">
          <th mat-header-cell *matHeaderCellDef>Tipo</th>
          <td mat-cell *matCellDef="let d">{{ d.document_type_label }}
            @if (d.maintenance_id) { <mat-icon class="tag-icon" matTooltip="Soporte de mantenimiento">build</mat-icon> }
          </td>
        </ng-container>
        <ng-container matColumnDef="title">
          <th mat-header-cell *matHeaderCellDef>Título</th>
          <td mat-cell *matCellDef="let d">{{ d.title }}<div class="sub">{{ d.original_name }} · {{ d.size / 1024 | number:'1.0-0' }} KB</div></td>
        </ng-container>
        <ng-container matColumnDef="dates">
          <th mat-header-cell *matHeaderCellDef>Emisión / vence</th>
          <td mat-cell *matCellDef="let d">
            {{ d.issued_at ? (d.issued_at | date:'dd/MM/yyyy':'UTC') : '—' }} /
            <span [class.expired]="isExpired(d)">{{ d.expires_at ? (d.expires_at | date:'dd/MM/yyyy':'UTC') : '—' }}</span>
          </td>
        </ng-container>
        <ng-container matColumnDef="uploaded">
          <th mat-header-cell *matHeaderCellDef>Cargado</th>
          <td mat-cell *matCellDef="let d">{{ d.created_at | date:'dd/MM/yyyy' }}<div class="sub">{{ d.uploaded_by?.name }}</div></td>
        </ng-container>
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let d" class="act">
            <button mat-icon-button matTooltip="Descargar" (click)="download(d)"><mat-icon>download</mat-icon></button>
            @if (!readonly) {
              <button *sgaPermission="'activos_documentos.eliminar'" mat-icon-button color="warn" matTooltip="Eliminar" (click)="remove(d)"><mat-icon>delete</mat-icon></button>
            }
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="cols"></tr>
        <tr mat-row *matRowDef="let row; columns: cols;"></tr>
        <tr class="mat-row" *matNoDataRow><td class="no-data" [attr.colspan]="cols.length">Sin documentos cargados</td></tr>
      </table>
    </div>
  `,
  styleUrl: './asset-detail.component.scss',
})
export class AssetDocumentsPanelComponent implements OnInit {
  private svc = inject(AssetsService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  @Input({ required: true }) assetId!: number;
  @Input() readonly = false;

  documents = signal<AssetDocument[]>([]);
  cols = ['type', 'title', 'dates', 'uploaded', 'actions'];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.svc.documents(this.assetId).subscribe({ next: res => this.documents.set(res.data) });
  }

  isExpired(doc: AssetDocument): boolean {
    return !!doc.expires_at && doc.expires_at < new Date().toISOString().substring(0, 10);
  }

  upload(): void {
    this.dialog.open(DocumentUploadDialogComponent, { data: { assetId: this.assetId }, width: '600px', maxWidth: '96vw' })
      .afterClosed().subscribe(doc => {
        if (!doc) return;
        this.snack.open('Documento cargado', 'OK', { duration: 3000 });
        this.load();
      });
  }

  download(doc: AssetDocument): void {
    this.svc.downloadDocument(doc).subscribe({
      error: err => this.snack.open(err.error?.message ?? 'No fue posible descargar el documento', 'OK', { duration: 4000 }),
    });
  }

  remove(doc: AssetDocument): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar documento', message: `¿Eliminar "${doc.title}"?`, confirmColor: 'warn', confirmText: 'Eliminar' },
      width: '420px',
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.svc.deleteDocument(doc.id).subscribe({
        next: () => { this.snack.open('Documento eliminado', 'OK', { duration: 3000 }); this.load(); },
        error: err => this.snack.open(err.error?.message ?? 'No fue posible eliminar', 'OK', { duration: 4000 }),
      });
    });
  }
}

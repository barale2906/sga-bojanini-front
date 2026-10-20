import { Component, ViewChild, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { SignersFormComponent } from '../../../shared/components/signers-form/signers-form.component';
import { AssetsService } from '../assets.service';
import { AssetTransfer } from '../assets.models';
import { signatureErrorMessages } from '../shared/signature-errors';

/** Confirma con firmas (entrega + recibe) un traslado pendiente. */
@Component({
  selector: 'app-asset-transfer-confirm-dialog',
  standalone: true,
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, FormErrorsComponent, SignersFormComponent],
  template: `
    <h2 mat-dialog-title class="dlg-title"><mat-icon>draw</mat-icon> Firmar {{ transfer.type_label.toLowerCase() }}</h2>
    <mat-dialog-content class="dlg-content">
      <div class="current-location">
        <mat-icon>swap_horiz</mat-icon>
        <span>
          <strong>{{ transfer.asset.code }} — {{ transfer.asset.name }}</strong><br>
          {{ transfer.from ?? '—' }} → {{ transfer.to ?? '—' }}
          @if (transfer.reason) { <br>Motivo: {{ transfer.reason }} }
          <br>Solicitado por {{ transfer.requested_by?.name }} el {{ transfer.created_at | date:'dd/MM/yyyy HH:mm' }}
        </span>
      </div>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <app-signers-form [initialReceivedMode]="transfer.to_place_id ? 'pin' : 'pad'"></app-signers-form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button mat-flat-button color="primary" (click)="confirm()" [disabled]="saving()">
        @if (saving()) { <mat-spinner diameter="16" class="inline-spinner"></mat-spinner> }
        <mat-icon>check_circle</mat-icon> Confirmar y firmar
      </button>
    </mat-dialog-actions>
  `,
  styleUrl: './asset-dialogs.scss',
})
export class AssetTransferConfirmDialogComponent {
  transfer: AssetTransfer = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AssetTransferConfirmDialogComponent, AssetTransfer | null>);
  private svc = inject(AssetsService);

  @ViewChild(SignersFormComponent) signersForm!: SignersFormComponent;

  saving = signal(false);
  errors = signal<string[]>([]);

  confirm(): void {
    if (this.saving() || !this.signersForm.ready) return;

    const signed = this.signersForm.collect();
    if (!signed.valid) {
      this.errors.set(signed.errors);
      return;
    }

    this.errors.set([]);
    this.saving.set(true);
    this.svc.confirmTransfer(this.transfer.id, signed.payload).subscribe({
      next: res => this.ref.close(res.data),
      error: err => {
        this.saving.set(false);
        if (err.status === 422 || err.status === 429) this.signersForm.resetPin();
        this.errors.set(signatureErrorMessages(err, 'No fue posible confirmar el traslado.'));
      },
    });
  }
}

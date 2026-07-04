import { Component, inject, signal, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { forkJoin } from 'rxjs';
import { InventoryService, Movement } from '../inventory.service';
import { AuthService } from '../../../core/services/auth.service';
import { MovementPdfSignature } from '../../../shared/services/movement-pdf.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { SignatureCapturePadComponent } from '../../../shared/components/signature-capture-pad/signature-capture-pad.component';

export interface MovementConfirmResult {
  confirmed:    true;
  delivered_by: MovementPdfSignature;
  received_by:  MovementPdfSignature;
}

export interface MovementConfirmDialogData {
  movements:     Pick<Movement, 'id' | 'product_name' | 'batch_lot_number' | 'quantity' | 'movement_type'>[];
  warehouseName: string;
  inventorySvc:  InventoryService;
}

const TYPE_LABELS: Record<string, string> = {
  exit:                  'Salida de Stock',
  transfer:              'Transferencia',
  adjustment:            'Ajuste de Inventario',
  return:                'Devolución a Proveedor',
  expiration_write_off:  'Baja por Vencimiento',
  loss:                  'Baja de Inventario',
};

@Component({
  selector: 'app-movement-confirm-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatDividerModule,
    FormErrorsComponent, SignatureCapturePadComponent,
  ],
  templateUrl: './movement-confirm-dialog.component.html',
  styleUrl:    './movement-confirm-dialog.component.scss',
})
export class MovementConfirmDialogComponent implements OnInit {
  data: MovementConfirmDialogData = inject(MAT_DIALOG_DATA);
  private ref     = inject(MatDialogRef<MovementConfirmDialogComponent>);
  private fb      = inject(FormBuilder);
  private authSvc = inject(AuthService);

  @ViewChild('deliveredPad') deliveredPad!: SignatureCapturePadComponent;
  @ViewChild('receivedPad')  receivedPad!:  SignatureCapturePadComponent;

  confirming = signal(false);
  cancelling = signal(false);
  errors     = signal<string[]>([]);
  confirmed  = signal(false);
  padTouched = signal(false);

  // Guardadas antes de que @if(!confirmed()) destruya los canvas del DOM
  private _capturedDeliveredB64 = '';
  private _capturedReceivedB64  = '';

  signerForm = this.fb.group({
    delivered_name:     ['', [Validators.required, Validators.maxLength(150)]],
    delivered_document: ['', [Validators.required, Validators.maxLength(50)]],
    received_name:      ['', [Validators.required, Validators.maxLength(150)]],
    received_document:  ['', [Validators.required, Validators.maxLength(50)]],
  });

  ngOnInit(): void {
    const user = this.authSvc.user();
    if (user?.name) {
      this.signerForm.patchValue({ delivered_name: user.name }, { emitEvent: false });
    }
  }

  get isMultiLot(): boolean { return this.data.movements.length > 1; }

  typeLabel(type: string): string { return TYPE_LABELS[type] || type; }

  confirm(): void {
    this.padTouched.set(true);
    if (this.signerForm.invalid || this.confirming()) return;

    if (this.deliveredPad.isEmpty()) {
      this.errors.set(['La firma de quien entrega es obligatoria.']);
      return;
    }
    if (this.receivedPad.isEmpty()) {
      this.errors.set(['La firma de quien recibe es obligatoria.']);
      return;
    }

    this.errors.set([]);
    this.confirming.set(true);

    // Capturar imágenes AHORA, mientras los canvas siguen en el DOM.
    // confirmed.set(true) los destruye vía @if(!confirmed()), por lo que
    // no se pueden leer después desde ViewChild.
    this._capturedDeliveredB64 = this.deliveredPad.getBase64();
    this._capturedReceivedB64  = this.receivedPad.getBase64();

    const v = this.signerForm.value;
    const payload = {
      delivered_by: {
        name:      v.delivered_name!,
        document:  v.delivered_document!,
        signature: this._capturedDeliveredB64,
      },
      received_by: {
        name:      v.received_name!,
        document:  v.received_document!,
        signature: this._capturedReceivedB64,
      },
    };

    forkJoin(
      this.data.movements.map(m => this.data.inventorySvc.confirmMovement(m.id, payload))
    ).subscribe({
      next: () => {
        this.confirming.set(false);
        this.confirmed.set(true);
      },
      error: err => {
        this.confirming.set(false);
        if (err.status === 422)
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        else if (err.status === 400)
          this.errors.set([err.error?.message || 'El movimiento ya fue confirmado anteriormente.']);
        else
          this.errors.set([err.error?.message || 'Error al confirmar el movimiento.']);
      },
    });
  }

  cancelMovements(): void {
    if (this.cancelling()) return;
    this.cancelling.set(true);
    forkJoin(
      this.data.movements.map(m => this.data.inventorySvc.cancelPendingMovement(m.id))
    ).subscribe({
      next:  () => { this.cancelling.set(false); this.ref.close({ cancelled: true }); },
      error: () => { this.cancelling.set(false); this.ref.close({ cancelled: true }); },
    });
  }

  closeConfirmed(): void {
    const v   = this.signerForm.value;
    const now = new Date().toISOString();
    const result: MovementConfirmResult = {
      confirmed:    true,
      delivered_by: {
        signer_name:     v.delivered_name!,
        signer_document: v.delivered_document!,
        signature_data:  this._capturedDeliveredB64,
        signed_at:       now,
      },
      received_by: {
        signer_name:     v.received_name!,
        signer_document: v.received_document!,
        signature_data:  this._capturedReceivedB64,
        signed_at:       now,
      },
    };
    this.ref.close(result);
  }
}

import { Component, inject, signal, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import {
  ConfirmMovementPayload,
  InventoryService,
  Movement,
  MovementSignatureRecord,
} from '../inventory.service';
import { AuthService } from '../../../core/services/auth.service';
import { MySignature, MySignatureService, SIGNATURE_PIN_LENGTH } from '../../../core/services/my-signature.service';
import { MovementPdfSignature } from '../../../shared/services/movement-pdf.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { SignatureCapturePadComponent } from '../../../shared/components/signature-capture-pad/signature-capture-pad.component';
import { SendDocumentEmailDialogComponent, SendDocumentEmailDialogData } from '../../../shared/components/send-document-email-dialog/send-document-email-dialog.component';

export interface MovementConfirmResult {
  confirmed:    true;
  delivered_by: MovementPdfSignature;
  received_by:  MovementPdfSignature;
}

export interface MovementConfirmDialogData {
  /** ID del movement_document (no del movimiento individual). */
  document_id:   number;
  movements:     Pick<Movement, 'id' | 'product_name' | 'batch_lot_number' | 'quantity' | 'movement_type'>[];
  warehouseName: string;
  inventorySvc:  InventoryService;
}

/** Cómo firma quien entrega: con su firma registrada o dibujando en el pad. */
type DeliveredMode = 'stored' | 'pad';

/** Cómo firma quien recibe: usuario registrado con PIN, o externo/sin registro en el pad. */
type ReceivedMode = 'pin' | 'pad';

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
    MatInputModule, MatButtonModule, MatButtonToggleModule, MatIconModule,
    MatProgressSpinnerModule, MatDividerModule,
    FormErrorsComponent, SignatureCapturePadComponent,
  ],
  templateUrl: './movement-confirm-dialog.component.html',
  styleUrl:    './movement-confirm-dialog.component.scss',
})
export class MovementConfirmDialogComponent implements OnInit {
  data: MovementConfirmDialogData = inject(MAT_DIALOG_DATA);
  private ref            = inject(MatDialogRef<MovementConfirmDialogComponent>);
  private fb             = inject(FormBuilder);
  private dialog         = inject(MatDialog);
  private mySignatureSvc = inject(MySignatureService);
  protected authSvc      = inject(AuthService);

  @ViewChild('deliveredPad') deliveredPad?: SignatureCapturePadComponent;
  @ViewChild('receivedPad')  receivedPad?:  SignatureCapturePadComponent;

  confirming       = signal(false);
  cancelling       = signal(false);
  errors           = signal<string[]>([]);
  confirmed        = signal(false);
  padTouched       = signal(false);
  showEmailPrompt  = signal(false);

  /** Firma registrada del usuario de la sesión (quien entrega). */
  mySignature        = signal<MySignature | null>(null);
  loadingMySignature = signal(true);
  deliveredMode      = signal<DeliveredMode>('pad');
  receivedMode       = signal<ReceivedMode>('pin');
  showPin            = signal(false);
  readonly pinLength = SIGNATURE_PIN_LENGTH;

  /** Firmas devueltas por el backend al confirmar (fuente para el PDF). */
  private _confirmedSignatures: MovementSignatureRecord[] = [];

  deliveredForm = this.fb.group({
    name:     ['', [Validators.required, Validators.maxLength(150)]],
    document: ['', [Validators.required, Validators.maxLength(50)]],
  });

  receivedForm = this.fb.group({
    name:     ['', [Validators.required, Validators.maxLength(150)]],
    document: ['', [Validators.required, Validators.maxLength(50)]],
  });

  pinCtrl = this.fb.control('', [Validators.required, Validators.pattern(new RegExp(`^\\d{${SIGNATURE_PIN_LENGTH}}$`))]);

  ngOnInit(): void {
    const user = this.authSvc.user();
    if (user?.name) {
      this.deliveredForm.patchValue({ name: user.name }, { emitEvent: false });
    }

    this.mySignatureSvc.get().subscribe({
      next: res => {
        this.mySignature.set(res.data.signature);
        this.deliveredMode.set(res.data.signature ? 'stored' : 'pad');
        this.loadingMySignature.set(false);
      },
      // Si no se puede consultar, se mantiene el flujo manual
      error: () => this.loadingMySignature.set(false),
    });
  }

  get isMultiLot(): boolean { return this.data.movements.length > 1; }

  typeLabel(type: string): string { return TYPE_LABELS[type] || type; }

  setDeliveredMode(mode: DeliveredMode): void {
    this.deliveredMode.set(mode);
    this.errors.set([]);
  }

  setReceivedMode(mode: ReceivedMode): void {
    this.receivedMode.set(mode);
    this.errors.set([]);
  }

  /** Solo permite dígitos en el campo PIN. */
  onPinInput(event: Event): void {
    const input  = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, SIGNATURE_PIN_LENGTH);
    if (digits !== input.value) {
      this.pinCtrl.setValue(digits);
    }
  }

  confirm(): void {
    if (this.confirming() || this.loadingMySignature()) return;
    this.padTouched.set(true);

    const payload = this.buildPayload();
    if (!payload) return;

    this.errors.set([]);
    this.confirming.set(true);

    this.data.inventorySvc.confirmMovement(this.data.document_id, payload).subscribe({
      next: res => {
        this._confirmedSignatures = res.data?.signatures ?? [];
        this.confirming.set(false);
        this.confirmed.set(true);
        if (this.authSvc.hasPermission('movimientos.enviar_correo')) {
          this.showEmailPrompt.set(true);
        }
      },
      error: err => {
        this.confirming.set(false);
        if (err.status === 422) {
          if (err.error?.errors?.['received_by.pin']) {
            this.pinCtrl.setValue('');
          }
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        } else if (err.status === 429) {
          this.pinCtrl.setValue('');
          this.errors.set(['Demasiados intentos de PIN fallidos. Espere 15 minutos o use la firma manual.']);
        } else if (err.status === 400) {
          this.errors.set([err.error?.message || 'El movimiento ya fue confirmado anteriormente.']);
        } else {
          this.errors.set([err.error?.message || 'Error al confirmar el movimiento.']);
        }
      },
    });
  }

  /** Valida según el modo de cada rol y arma el payload; null si hay errores. */
  private buildPayload(): ConfirmMovementPayload | null {
    const errors: string[] = [];
    let deliveredBy: ConfirmMovementPayload['delivered_by'];
    let receivedBy: ConfirmMovementPayload['received_by'] | null = null;

    if (this.deliveredMode() === 'pad') {
      this.deliveredForm.markAllAsTouched();
      if (this.deliveredForm.invalid) errors.push('Complete nombre y documento de quien entrega.');
      if (!this.deliveredPad || this.deliveredPad.isEmpty()) errors.push('La firma de quien entrega es obligatoria.');
      if (this.deliveredPad && this.deliveredForm.valid) {
        deliveredBy = {
          name:      this.deliveredForm.value.name!,
          document:  this.deliveredForm.value.document!,
          signature: this.deliveredPad.getBase64(),
        };
      }
    }

    if (this.receivedMode() === 'pin') {
      this.pinCtrl.markAsTouched();
      if (this.pinCtrl.invalid) {
        errors.push(`Quien recibe debe digitar su PIN de ${SIGNATURE_PIN_LENGTH} dígitos.`);
      } else {
        receivedBy = { pin: this.pinCtrl.value! };
      }
    } else {
      this.receivedForm.markAllAsTouched();
      if (this.receivedForm.invalid) errors.push('Complete nombre y documento de quien recibe.');
      if (!this.receivedPad || this.receivedPad.isEmpty()) errors.push('La firma de quien recibe es obligatoria.');
      if (this.receivedPad && this.receivedForm.valid) {
        receivedBy = {
          name:      this.receivedForm.value.name!,
          document:  this.receivedForm.value.document!,
          signature: this.receivedPad.getBase64(),
        };
      }
    }

    if (errors.length || !receivedBy) {
      this.errors.set(errors);
      return null;
    }

    return deliveredBy ? { delivered_by: deliveredBy, received_by: receivedBy } : { received_by: receivedBy };
  }

  cancelMovements(): void {
    if (this.cancelling()) return;
    this.cancelling.set(true);
    this.data.inventorySvc.cancelPendingMovement(this.data.document_id).subscribe({
      next:  () => { this.cancelling.set(false); this.ref.close({ cancelled: true }); },
      error: () => { this.cancelling.set(false); this.ref.close({ cancelled: true }); },
    });
  }

  dismissEmailPrompt(): void {
    this.showEmailPrompt.set(false);
    this.closeConfirmed();
  }

  openEmailDialog(): void {
    this.showEmailPrompt.set(false);
    const docNumber = `DOC-${this.data.document_id}`;
    this.dialog.open(SendDocumentEmailDialogComponent, {
      data: {
        document_id:     this.data.document_id,
        document_number: docNumber,
        inventorySvc:    this.data.inventorySvc,
      } satisfies SendDocumentEmailDialogData,
      width: '540px', maxWidth: '96vw', maxHeight: '90vh',
      disableClose: true,
    }).afterClosed().subscribe(() => this.closeConfirmed());
  }

  /**
   * Cierra devolviendo las firmas tal como quedaron en el backend: con firma
   * registrada o PIN el frontend no conoce de antemano nombre, documento ni imagen.
   */
  closeConfirmed(): void {
    const result: MovementConfirmResult = {
      confirmed:    true,
      delivered_by: this.toPdfSignature('delivered_by'),
      received_by:  this.toPdfSignature('received_by'),
    };
    this.ref.close(result);
  }

  private toPdfSignature(role: 'delivered_by' | 'received_by'): MovementPdfSignature {
    const sig = this._confirmedSignatures.find(s => s.role === role);
    return {
      signer_name:     sig?.signer_name ?? '',
      signer_document: sig?.signer_document ?? '',
      signature_data:  sig?.signature_data ?? '',
      signed_at:       sig?.signed_at ?? new Date().toISOString(),
    };
  }
}

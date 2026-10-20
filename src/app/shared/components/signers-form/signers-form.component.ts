import { Component, Input, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../../core/services/auth.service';
import { MySignature, MySignatureService, SIGNATURE_PIN_LENGTH } from '../../../core/services/my-signature.service';
import { SignatureCapturePadComponent } from '../signature-capture-pad/signature-capture-pad.component';

/** Firma capturada en el pad (externos o usuarios sin firma registrada). */
export interface PadSignerPayload {
  name: string;
  document: string;
  signature: string;
}

/**
 * Firmantes de un documento. Si se omite `delivered_by`, el backend usa la
 * firma registrada del usuario de la sesión.
 */
export interface SignersFormPayload {
  delivered_by?: PadSignerPayload;
  received_by: { pin: string } | PadSignerPayload;
}

export type SignersFormResult =
  | { valid: true; payload: SignersFormPayload }
  | { valid: false; errors: string[] };

/**
 * Captura de firmas de entrega y recibido con la metodología del sistema:
 *  - Quien entrega: firma registrada de la sesión ("Mi firma") o pad.
 *  - Quien recibe: usuario con PIN, o externo / sin registro en el pad.
 *
 * El componente no envía nada: el padre llama `collect()` y usa el payload
 * en su propia petición (confirmar traslado, registrar mantenimiento, …).
 */
@Component({
  selector: 'app-signers-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatButtonToggleModule, MatIconModule, MatProgressSpinnerModule, MatDividerModule,
    SignatureCapturePadComponent,
  ],
  templateUrl: './signers-form.component.html',
  styleUrl: './signers-form.component.scss',
})
export class SignersFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private mySignatureSvc = inject(MySignatureService);
  private authSvc = inject(AuthService);

  /** Etiqueta de quien entrega (p. ej. "Técnico que entrega"). */
  @Input() deliveredLabel = 'Quien entrega';

  /** Etiqueta de quien recibe. */
  @Input() receivedLabel = 'Quien recibe';

  /** Modo inicial de quien recibe (p. ej. 'pad' para un proveedor externo). */
  @Input() initialReceivedMode: 'pin' | 'pad' = 'pin';

  /** Fuerza firma en pad para quien entrega (p. ej. técnico externo). */
  @Input() deliveredByPad = false;

  @ViewChild('deliveredPad') deliveredPad?: SignatureCapturePadComponent;
  @ViewChild('receivedPad') receivedPad?: SignatureCapturePadComponent;

  readonly pinLength = SIGNATURE_PIN_LENGTH;

  mySignature = signal<MySignature | null>(null);
  loadingMySignature = signal(true);
  deliveredMode = signal<'stored' | 'pad'>('pad');
  receivedMode = signal<'pin' | 'pad'>('pin');
  showPin = signal(false);
  padTouched = signal(false);

  deliveredForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    document: ['', [Validators.required, Validators.maxLength(50)]],
  });

  receivedForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    document: ['', [Validators.required, Validators.maxLength(50)]],
  });

  pinCtrl = this.fb.control('', [Validators.required, Validators.pattern(new RegExp(`^\\d{${SIGNATURE_PIN_LENGTH}}$`))]);

  ngOnInit(): void {
    this.receivedMode.set(this.initialReceivedMode);

    const user = this.authSvc.user();
    if (user?.name && !this.deliveredByPad) {
      this.deliveredForm.patchValue({ name: user.name }, { emitEvent: false });
    }

    if (this.deliveredByPad) {
      this.loadingMySignature.set(false);
      return;
    }

    this.mySignatureSvc.get().subscribe({
      next: res => {
        this.mySignature.set(res.data.signature);
        this.deliveredMode.set(res.data.signature ? 'stored' : 'pad');
        this.loadingMySignature.set(false);
      },
      // Si no se puede consultar "Mi firma", se mantiene la firma manual.
      error: () => this.loadingMySignature.set(false),
    });
  }

  /** Listo para recolectar (ya se consultó la firma registrada). */
  get ready(): boolean {
    return !this.loadingMySignature();
  }

  setDeliveredMode(mode: 'stored' | 'pad'): void {
    this.deliveredMode.set(mode);
  }

  setReceivedMode(mode: 'pin' | 'pad'): void {
    this.receivedMode.set(mode);
  }

  /** Solo permite dígitos en el PIN. */
  onPinInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, SIGNATURE_PIN_LENGTH);
    if (digits !== input.value) this.pinCtrl.setValue(digits);
  }

  /** Limpia el PIN (tras un PIN inválido o demasiados intentos). */
  resetPin(): void {
    this.pinCtrl.setValue('');
  }

  /** Valida según el modo de cada rol y devuelve el payload o los errores. */
  collect(): SignersFormResult {
    this.padTouched.set(true);
    const errors: string[] = [];
    let deliveredBy: PadSignerPayload | undefined;
    let receivedBy: SignersFormPayload['received_by'] | null = null;

    if (this.deliveredMode() === 'pad') {
      this.deliveredForm.markAllAsTouched();
      if (this.deliveredForm.invalid) errors.push(`Complete nombre y documento de ${this.deliveredLabel.toLowerCase()}.`);
      if (!this.deliveredPad || this.deliveredPad.isEmpty()) errors.push(`La firma de ${this.deliveredLabel.toLowerCase()} es obligatoria.`);
      if (this.deliveredPad && this.deliveredForm.valid) {
        deliveredBy = {
          name: this.deliveredForm.value.name!,
          document: this.deliveredForm.value.document!,
          signature: this.deliveredPad.getBase64(),
        };
      }
    }

    if (this.receivedMode() === 'pin') {
      this.pinCtrl.markAsTouched();
      if (this.pinCtrl.invalid) {
        errors.push(`${this.receivedLabel} debe digitar su PIN de ${SIGNATURE_PIN_LENGTH} dígitos.`);
      } else {
        receivedBy = { pin: this.pinCtrl.value! };
      }
    } else {
      this.receivedForm.markAllAsTouched();
      if (this.receivedForm.invalid) errors.push(`Complete nombre y documento de ${this.receivedLabel.toLowerCase()}.`);
      if (!this.receivedPad || this.receivedPad.isEmpty()) errors.push(`La firma de ${this.receivedLabel.toLowerCase()} es obligatoria.`);
      if (this.receivedPad && this.receivedForm.valid) {
        receivedBy = {
          name: this.receivedForm.value.name!,
          document: this.receivedForm.value.document!,
          signature: this.receivedPad.getBase64(),
        };
      }
    }

    if (errors.length || !receivedBy) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      payload: deliveredBy ? { delivered_by: deliveredBy, received_by: receivedBy } : { received_by: receivedBy },
    };
  }
}

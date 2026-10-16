import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  DocumentTypeOption,
  MySignature,
  MySignatureService,
  SIGNATURE_PIN_LENGTH,
} from '../../../../core/services/my-signature.service';
import { FormErrorsComponent } from '../../../../shared/components/form-errors/form-errors.component';
import { SignatureCapturePadComponent } from '../../../../shared/components/signature-capture-pad/signature-capture-pad.component';

type Mode = 'view' | 'edit' | 'regenerate';

/**
 * "Mi firma": el usuario registra su documento y su firma una sola vez.
 *
 * - Quien entrega un movimiento usa esta firma sin volver a firmar.
 * - Quien recibe la aplica digitando su PIN de 3 dígitos (generado por el
 *   sistema y mostrado una única vez).
 *
 * Solo muestra la información del usuario autenticado.
 */
@Component({
  selector: 'app-my-signature',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule,
    FormErrorsComponent, SignatureCapturePadComponent,
  ],
  templateUrl: './my-signature.component.html',
  styleUrl:    './my-signature.component.scss',
})
export class MySignatureComponent implements OnInit {
  private svc      = inject(MySignatureService);
  private fb       = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  @ViewChild('pad') pad?: SignatureCapturePadComponent;

  loading       = signal(true);
  saving        = signal(false);
  mode          = signal<Mode>('view');
  signature     = signal<MySignature | null>(null);
  documentTypes = signal<DocumentTypeOption[]>([]);
  errors        = signal<string[]>([]);
  padTouched    = signal(false);
  showPassword  = signal(false);

  /** PIN recién generado: se muestra una sola vez y no se persiste. */
  revealedPin = signal<string | null>(null);
  pinVisible  = signal(false);
  readonly pinLength = SIGNATURE_PIN_LENGTH;
  readonly pinMask   = '•'.repeat(SIGNATURE_PIN_LENGTH);

  form = this.fb.group({
    document_type:    ['CC', [Validators.required]],
    document_number:  ['', [Validators.required, Validators.minLength(4), Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9]+$/)]],
    current_password: ['', [Validators.required]],
  });

  pinForm = this.fb.group({
    current_password: ['', [Validators.required]],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.svc.get().subscribe({
      next: res => {
        this.signature.set(res.data.signature);
        this.documentTypes.set(res.data.document_types);
        this.mode.set(res.data.signature ? 'view' : 'edit');
        this.loading.set(false);
      },
      error: () => {
        this.errors.set(['No fue posible cargar su firma.']);
        this.loading.set(false);
      },
    });
  }

  startEdit(): void {
    const current = this.signature();
    this.form.reset({
      document_type:    current?.document_type ?? 'CC',
      document_number:  current?.document_number ?? '',
      current_password: '',
    });
    this.errors.set([]);
    this.padTouched.set(false);
    this.mode.set('edit');
  }

  startRegenerate(): void {
    this.pinForm.reset();
    this.errors.set([]);
    this.mode.set('regenerate');
  }

  cancel(): void {
    this.errors.set([]);
    this.mode.set('view');
  }

  save(): void {
    this.padTouched.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving() || !this.pad) return;

    if (this.pad.isEmpty()) {
      this.errors.set(['Dibuje su firma en el recuadro.']);
      return;
    }

    const v = this.form.value;
    this.saving.set(true);
    this.errors.set([]);

    this.svc.save({
      current_password: v.current_password!,
      document_type:    v.document_type!,
      document_number:  v.document_number!.trim(),
      signature:        this.pad.getBase64(),
    }).subscribe({
      next: res => {
        this.saving.set(false);
        this.signature.set(res.data.signature);
        this.mode.set('view');
        if (res.data.pin) {
          this.revealPin(res.data.pin);
        }
        this.snackBar.open(res.message, 'Cerrar', { duration: 4000 });
      },
      error: err => this.handleError(err),
    });
  }

  regeneratePin(): void {
    this.pinForm.markAllAsTouched();
    if (this.pinForm.invalid || this.saving()) return;

    this.saving.set(true);
    this.errors.set([]);

    this.svc.regeneratePin(this.pinForm.value.current_password!).subscribe({
      next: res => {
        this.saving.set(false);
        this.signature.set(res.data.signature);
        this.mode.set('view');
        this.revealPin(res.data.pin!);
      },
      error: err => this.handleError(err),
    });
  }

  async copyPin(): Promise<void> {
    const pin = this.revealedPin();
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin);
      this.snackBar.open('PIN copiado', 'Cerrar', { duration: 2000 });
    } catch {
      this.snackBar.open('No fue posible copiar; anótelo manualmente.', 'Cerrar', { duration: 3000 });
    }
  }

  /** El usuario confirma que guardó el PIN: se borra de memoria. */
  dismissPin(): void {
    this.revealedPin.set(null);
    this.pinVisible.set(false);
  }

  private revealPin(pin: string): void {
    this.revealedPin.set(pin);
    this.pinVisible.set(true);
  }

  private handleError(err: { status: number; error?: { message?: string; errors?: Record<string, string[]> } }): void {
    this.saving.set(false);
    if (err.status === 422 && err.error?.errors) {
      this.errors.set(Object.values(err.error.errors).flat());
    } else if (err.status === 429) {
      this.errors.set(['Demasiados intentos. Espere un momento e intente de nuevo.']);
    } else {
      this.errors.set([err.error?.message || 'Ocurrió un error al guardar.']);
    }
  }
}

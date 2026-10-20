import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

export interface ReasonDialogData {
  title: string;
  message?: string;
  label?: string;
  confirmText?: string;
  required?: boolean;
}

/** Solicita un texto (motivo) antes de confirmar una acción. Cierra con el texto o con `null`. */
@Component({
  selector: 'app-reason-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.message) { <p class="message">{{ data.message }}</p> }
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>{{ data.label ?? 'Motivo' }}{{ required ? ' *' : '' }}</mat-label>
        <textarea matInput [formControl]="reason" rows="3" maxlength="1000"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Volver</button>
      <button mat-raised-button color="warn" [disabled]="reason.invalid" (click)="ref.close(reason.value?.trim() ?? '')">
        {{ data.confirmText ?? 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.w-full { width:100%; min-width:380px; } .message { color:#4a5568; margin:0 0 0.75rem; }`],
})
export class ReasonDialogComponent {
  data: ReasonDialogData = inject(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<ReasonDialogComponent, string | null>);

  required = this.data.required ?? true;
  reason = new FormControl('', this.required ? [Validators.required, Validators.maxLength(1000)] : [Validators.maxLength(1000)]);
}

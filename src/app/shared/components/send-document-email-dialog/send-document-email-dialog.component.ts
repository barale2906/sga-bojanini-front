import { Component, inject, signal, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatSnackBar } from '@angular/material/snack-bar';
import { COMMA, ENTER, SEMICOLON } from '@angular/cdk/keycodes';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { InventoryService, UserSearchResult } from '../../../features/inventory/inventory.service';
import { FormErrorsComponent } from '../form-errors/form-errors.component';

export interface SendDocumentEmailDialogData {
  document_id: number;
  document_number: string;
  inventorySvc: InventoryService;
}

@Component({
  selector: 'app-send-document-email-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatChipsModule, MatAutocompleteModule, FormErrorsComponent,
  ],
  templateUrl: './send-document-email-dialog.component.html',
  styleUrl: './send-document-email-dialog.component.scss',
})
export class SendDocumentEmailDialogComponent implements OnInit {
  data: SendDocumentEmailDialogData = inject(MAT_DIALOG_DATA);
  private ref   = inject(MatDialogRef<SendDocumentEmailDialogComponent>);
  private snack = inject(MatSnackBar);

  @ViewChild('emailInput') emailInputRef!: ElementRef<HTMLInputElement>;

  readonly separatorKeyCodes = [ENTER, COMMA, SEMICOLON] as const;

  recipients  = signal<string[]>([]);
  userResults = signal<UserSearchResult[]>([]);
  sending     = signal(false);
  errors      = signal<string[]>([]);

  inputCtrl = new FormControl('');

  private searchSubject = new Subject<string>();
  private emailValidator = Validators.email;

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term =>
        term.trim().length >= 2
          ? this.data.inventorySvc.searchUsers(term).pipe(catchError(() => of({ data: [] as UserSearchResult[], success: false, message: '' })))
          : of({ data: [] as UserSearchResult[], success: false, message: '' })
      ),
    ).subscribe(res => this.userResults.set(res.data ?? []));

    this.inputCtrl.valueChanges.subscribe(val => {
      if (typeof val === 'string') this.searchSubject.next(val);
    });
  }

  addFromInput(event: MatChipInputEvent): void {
    const value = (event.value ?? '').trim();
    if (value) {
      const ctrl = new FormControl(value, [Validators.email]);
      if (ctrl.valid) {
        this.addEmail(value);
        event.chipInput?.clear();
        this.inputCtrl.setValue('', { emitEvent: false });
        this.userResults.set([]);
      }
    }
  }

  selectUser(event: MatAutocompleteSelectedEvent): void {
    const user = event.option.value as UserSearchResult;
    this.addEmail(user.email);
    this.inputCtrl.setValue('', { emitEvent: false });
    this.userResults.set([]);
    if (this.emailInputRef) {
      this.emailInputRef.nativeElement.value = '';
    }
  }

  userDisplay(_user: UserSearchResult): string {
    return '';
  }

  private addEmail(email: string): void {
    const normalized = email.toLowerCase().trim();
    if (normalized && !this.recipients().includes(normalized)) {
      this.recipients.update(r => [...r, normalized]);
    }
  }

  removeRecipient(email: string): void {
    this.recipients.update(r => r.filter(e => e !== email));
  }

  send(): void {
    if (!this.recipients().length || this.sending()) return;
    this.errors.set([]);
    this.sending.set(true);

    this.data.inventorySvc.sendDocumentEmail(this.data.document_id, this.recipients()).subscribe({
      next: () => {
        this.sending.set(false);
        this.ref.close(true);
        this.snack.open('Correo en cola para envío', 'OK', { duration: 3500 });
      },
      error: err => {
        this.sending.set(false);
        if (err.status === 409) {
          this.errors.set(['El comprobante debe estar confirmado antes de enviarse.']);
        } else if (err.status === 422) {
          const msgs = Object.values(err.error?.errors || {}).flat() as string[];
          this.errors.set(msgs.length ? msgs : [err.error?.message || 'Error de validación.']);
        } else if (err.status === 403) {
          this.ref.close(false);
          this.snack.open('No tienes permiso para realizar esta acción.', 'OK', { duration: 3500 });
        } else {
          this.errors.set([err.error?.message || 'Error al enviar el correo. Intente nuevamente.']);
        }
      },
    });
  }
}

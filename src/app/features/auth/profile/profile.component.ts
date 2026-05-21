import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../../core/services/auth.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { CustomValidators } from '../../../shared/validators/custom-validators';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    PageHeaderComponent,
    FormErrorsComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  auth = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);

  saving = signal(false);
  showCurrent = signal(false);
  showNew = signal(false);
  showConfirm = signal(false);
  passwordErrors = signal<string[]>([]);
  fieldErrors = signal<Record<string, string[]>>({});

  // Selected tab: if route is /profile/password, open tab 1
  selectedTab = this.route.snapshot.url.some((s) => s.path === 'password') ? 1 : 0;

  passwordForm = this.fb.group(
    {
      current_password: ['', [Validators.required]],
      new_password: ['', [Validators.required, Validators.minLength(8), CustomValidators.strongPassword]],
      new_password_confirmation: ['', [Validators.required]],
    },
    { validators: CustomValidators.mustMatch('new_password', 'new_password_confirmation') }
  );

  onChangePassword(): void {
    if (this.passwordForm.invalid || this.saving()) return;

    this.saving.set(true);
    this.passwordErrors.set([]);
    this.fieldErrors.set({});

    const { current_password, new_password, new_password_confirmation } = this.passwordForm.value;

    this.auth
      .changePassword(current_password!, new_password!, new_password_confirmation!)
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.passwordForm.reset();
          this.snackBar.open('Contraseña actualizada exitosamente', 'Cerrar', {
            duration: 4000,
          });
        },
        error: (err) => {
          this.saving.set(false);
          if (err.status === 422 && err.error?.errors) {
            this.fieldErrors.set(err.error.errors);
            const msgs: string[] = [];
            Object.values(err.error.errors as Record<string, string[]>).forEach(
              (arr) => msgs.push(...arr)
            );
            this.passwordErrors.set(msgs);
          }
        },
      });
  }
}

import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export class CustomValidators {
  /** Verifica que dos campos tengan el mismo valor */
  static mustMatch(controlName: string, matchingControlName: string): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const control = group.get(controlName);
      const matchingControl = group.get(matchingControlName);

      if (!control || !matchingControl) return null;
      if (matchingControl.errors && !matchingControl.errors['mustMatch']) return null;

      if (control.value !== matchingControl.value) {
        matchingControl.setErrors({ mustMatch: true });
        return { mustMatch: true };
      } else {
        matchingControl.setErrors(null);
        return null;
      }
    };
  }

  /** Contraseña fuerte: mínimo 8 chars, una mayúscula, un número */
  static strongPassword(control: AbstractControl): ValidationErrors | null {
    const value: string = control.value || '';
    if (value.length < 8) return { strongPassword: 'Mínimo 8 caracteres' };
    if (!/[A-Z]/.test(value)) return { strongPassword: 'Debe incluir al menos una mayúscula' };
    if (!/[0-9]/.test(value)) return { strongPassword: 'Debe incluir al menos un número' };
    return null;
  }

  /** Solo números positivos */
  static positiveNumber(control: AbstractControl): ValidationErrors | null {
    const value = Number(control.value);
    if (isNaN(value) || value < 0) return { positiveNumber: true };
    return null;
  }
}

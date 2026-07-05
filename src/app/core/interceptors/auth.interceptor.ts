import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('sga_token');
  const auth = inject(AuthService);
  const snackBar = inject(MatSnackBar);

  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  }

  return next(req).pipe(
    catchError(err => {
      if (err.status === 401 && !req.url.includes('/auth/login')) {
        auth.clearSession();
      }
      if (err.status === 403) {
        snackBar.open(err.error?.message ?? 'Sin acceso', 'Cerrar', {
          duration: 5000,
          panelClass: ['snack-warn'],
        });
      }
      return throwError(() => err);
    })
  );
};

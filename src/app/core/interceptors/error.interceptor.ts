import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      switch (error.status) {
        case 401:
          localStorage.removeItem('sga_token');
          localStorage.removeItem('sga_user');
          router.navigate(['/login']);
          break;
        case 403:
          snackBar.open('No tienes permiso para esta acción', 'Cerrar', {
            duration: 5000,
            panelClass: ['snack-warn'],
          });
          break;
        case 404:
          snackBar.open(error.error?.message || 'Recurso no encontrado.', 'Cerrar', {
            duration: 5000,
            panelClass: ['snack-warn'],
          });
          break;
        case 409:
          snackBar.open(error.error?.message || 'Error de negocio', 'Cerrar', {
            duration: 5000,
            panelClass: ['snack-warn'],
          });
          break;
        case 422:
          // Los errores de validación se manejan en cada formulario individualmente
          break;
        case 429:
          snackBar.open('Demasiadas peticiones. Espera un momento.', 'Cerrar', {
            duration: 5000,
          });
          break;
        case 500:
          snackBar.open(
            'Error interno del servidor. Contacta al administrador.',
            'Cerrar',
            { duration: 6000, panelClass: ['snack-error'] }
          );
          break;
        case 0:
          snackBar.open('Sin conexión al servidor.', 'Cerrar', {
            duration: 5000,
          });
          break;
      }
      return throwError(() => error);
    })
  );
};

import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';

export const permissionGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  const required: string | string[] = route.data['permission'];

  if (!required) return true;

  const permissions = Array.isArray(required) ? required : [required];
  const hasPermission = auth.hasAnyPermission(permissions);

  if (!hasPermission) {
    snackBar.open('No tienes permiso para acceder a esta sección.', 'Cerrar', {
      duration: 5000,
      panelClass: ['snack-warn'],
    });
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};

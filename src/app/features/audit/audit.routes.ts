import { Routes } from '@angular/router';

export const auditRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./audit-page.component').then((m) => m.AuditPageComponent),
  },
];

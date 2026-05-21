import { Routes } from '@angular/router';
export const auditRoutes: Routes = [
  { path: '', loadComponent: () => import('./audit.component').then(m => m.AuditComponent) },
];

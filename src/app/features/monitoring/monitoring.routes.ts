import { Routes } from '@angular/router';
export const monitoringRoutes: Routes = [
  { path: '', loadComponent: () => import('./monitoring.component').then(m => m.MonitoringComponent) },
];

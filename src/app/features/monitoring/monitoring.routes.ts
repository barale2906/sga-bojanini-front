import { Routes } from '@angular/router';

export const monitoringRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./monitoring-page.component').then((m) => m.MonitoringPageComponent),
  },
];

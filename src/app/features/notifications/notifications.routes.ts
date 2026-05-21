import { Routes } from '@angular/router';
export const notificationsRoutes: Routes = [
  { path: '', loadComponent: () => import('./notifications.component').then(m => m.NotificationsComponent) },
];

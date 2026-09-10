import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

export const serviceOrdersRoutes: Routes = [
  {
    path: '',
    redirectTo: 'generar',
    pathMatch: 'full',
  },
  {
    path: 'generar',
    loadComponent: () =>
      import('./generate-order/service-order-form-page.component').then(
        (m) => m.ServiceOrderFormPageComponent
      ),
    canActivate: [permissionGuard],
    data: { title: 'Nueva Orden de Servicio', permission: 'ordenes_servicio.crear' },
  },
  {
    path: 'descuentos',
    loadComponent: () =>
      import('./discounts/discounts-page.component').then(
        (m) => m.DiscountsPageComponent
      ),
    canActivate: [permissionGuard],
    data: { title: 'Descuentos Pendientes', permission: 'ordenes_servicio.aprobar' },
  },
  {
    path: 'precios',
    loadComponent: () =>
      import('./price-lists/price-lists-page.component').then(
        (m) => m.PriceListsPageComponent
      ),
    canActivate: [permissionGuard],
    data: { title: 'Listas de Precios', permission: 'listas_precios.ver' },
  },
  {
    path: 'descuentos/aprobadores',
    loadComponent: () =>
      import('./discount-approvers/discount-approvers-page.component').then(
        (m) => m.DiscountApproversPageComponent
      ),
    canActivate: [permissionGuard],
    data: { title: 'Configuración de Aprobadores', permission: 'ordenes_servicio.aprobar' },
  },
];

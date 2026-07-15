import { Routes } from '@angular/router';

export const catalogRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./catalog-page.component').then((m) => m.CatalogPageComponent),
  },
  {
    path: 'products/:id',
    loadComponent: () =>
      import('./products/product-detail-page.component').then((m) => m.ProductDetailPageComponent),
    data: { permission: 'generic-products.ver' },
  },
];

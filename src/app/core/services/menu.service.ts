import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { MenuItem } from '../models/menu.model';

@Injectable({ providedIn: 'root' })
export class MenuService {
  private api = environment.apiUrl;
  private readonly STORAGE_KEY = 'sga_menu';

  private menuSignal = signal<MenuItem[]>([]);
  menu = this.menuSignal.asReadonly();

  private readonly ROUTE_MAP: Record<string, string> = {
    'dashboard': '/dashboard',
    // Almacén
    'warehouses.index': '/warehouses',
    'zones.index': '/warehouses',
    'locations.index': '/warehouses',
    // Catálogo
    'products.index': '/catalog',
    'categories.index': '/catalog',
    'units-of-measure.index': '/catalog',
    'product-classifications.index': '/catalog',
    'suppliers.index': '/catalog',
    // Inventario
    'stock.index': '/inventory',
    'batches.index': '/inventory',
    'movements.index': '/inventory',
    // Centros de Costo
    'cost-centers.index': '/cost-centers',
    'medical-services.index': '/cost-centers',
    // Compras
    'purchase-orders.index': '/purchasing',
    // Monitoreo
    'sensors.index': '/monitoring',
    'sensor-readings.index': '/monitoring',
    'alert-rules.index': '/monitoring',
    // Integraciones
    'consumptions.index': '/integrations',
    'integrations.index': '/integrations',
    // Reportes / Auditoría
    'reports.index': '/reports',
    'audit.index': '/audit',
    // Administración
    'users.index': '/users',
    'roles.index': '/roles',
  };

  constructor(private http: HttpClient) {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        this.menuSignal.set(JSON.parse(saved));
      } catch {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  loadMenu(): Observable<void> {
    return this.http.get<ApiResponse<MenuItem[]>>(`${this.api}/auth/menu`).pipe(
      tap((res) => {
        this.menuSignal.set(res.data);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(res.data));
      }),
      map(() => void 0)
    );
  }

  clearMenu(): void {
    this.menuSignal.set([]);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  resolveRoute(routeName: string | null): string | null {
    if (!routeName) return null;
    return this.ROUTE_MAP[routeName] ?? null;
  }

  findItem(key: string, items: MenuItem[] = this.menuSignal()): MenuItem | null {
    for (const item of items) {
      if (item.key === key) return item;
      if (item.children.length) {
        const found = this.findItem(key, item.children);
        if (found) return found;
      }
    }
    return null;
  }

  getActions(key: string): Record<string, boolean> {
    return this.findItem(key)?.actions ?? {};
  }
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, of, shareReplay, tap } from 'rxjs';
import { AssetsService } from './assets.service';
import { AssetFilterCatalogs } from './assets.models';

/**
 * Catálogos del módulo de activos (categorías, sedes/sitios, usuarios,
 * proveedores y enumeraciones) compartidos por páginas y diálogos.
 * Se cargan una vez y se refrescan tras cambios en categorías o ubicaciones.
 */
@Injectable({ providedIn: 'root' })
export class AssetCatalogStore {
  private svc = inject(AssetsService);
  private inflight?: Observable<AssetFilterCatalogs>;

  readonly catalogs = signal<AssetFilterCatalogs | null>(null);

  readonly categories = computed(() => this.catalogs()?.categories ?? []);
  readonly sites = computed(() => this.catalogs()?.sites ?? []);
  readonly users = computed(() => this.catalogs()?.users ?? []);
  readonly suppliers = computed(() => this.catalogs()?.suppliers ?? []);

  load(force = false): Observable<AssetFilterCatalogs> {
    const cached = this.catalogs();
    if (cached && !force) return of(cached);
    if (this.inflight && !force) return this.inflight;

    this.inflight = this.svc.filters().pipe(
      map(res => res.data),
      tap(data => {
        this.catalogs.set(data);
        this.inflight = undefined;
      }),
      shareReplay(1),
    );

    return this.inflight;
  }

  refresh(): void {
    this.load(true).subscribe();
  }

  placesOf(siteId: number | null | undefined): { id: number; name: string }[] {
    return this.sites().find(s => s.id === siteId)?.places ?? [];
  }

  siteOfPlace(placeId: number | null | undefined): number | null {
    if (!placeId) return null;
    return this.sites().find(s => s.places.some(p => p.id === placeId))?.id ?? null;
  }

  requiresMaintenance(categoryId: number | null | undefined): boolean {
    return this.categories().find(c => c.id === categoryId)?.requires_maintenance ?? false;
  }
}

import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { AssetCatalogStore } from '../asset-catalog.store';
import { AssetPlace, AssetSite } from '../assets.models';
import { AssetPlaceDialogComponent, AssetSiteDialogComponent } from '../dialogs/asset-catalog-dialogs.component';

/**
 * Selección de ubicación en dos pasos: Sede → Sitio. El valor (id del sitio)
 * se escribe en `placeControl`; la sede es solo un filtro visual.
 * Quien tenga `activos_catalogos.crear` puede crear sede o sitio sin salir del formulario.
 */
@Component({
  selector: 'app-site-place-picker',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule, MatButtonModule, MatIconModule, MatTooltipModule, PermissionDirective],
  template: `
    <div class="picker">
      <mat-form-field appearance="outline">
        <mat-label>Sede{{ required ? ' *' : '' }}</mat-label>
        <mat-select [value]="siteId()" (selectionChange)="onSite($event.value)">
          @for (s of store.sites(); track s.id) {
            <mat-option [value]="s.id">{{ s.name }}</mat-option>
          }
        </mat-select>
        <button *sgaPermission="'activos_catalogos.crear'" mat-icon-button matSuffix type="button"
                matTooltip="Nueva sede" (click)="$event.stopPropagation(); createSite()">
          <mat-icon>add</mat-icon>
        </button>
        @if (!store.sites().length) {
          <mat-hint>No hay sedes registradas. Créela con el botón +</mat-hint>
        }
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Sitio{{ required ? ' *' : '' }}</mat-label>
        <mat-select [formControl]="placeControl">
          @for (p of store.placesOf(siteId()); track p.id) {
            <mat-option [value]="p.id" [disabled]="p.id === excludePlaceId">{{ p.name }}</mat-option>
          }
        </mat-select>
        @if (siteId()) {
          <button *sgaPermission="'activos_catalogos.crear'" mat-icon-button matSuffix type="button"
                  matTooltip="Nuevo sitio en esta sede" (click)="$event.stopPropagation(); createPlace()">
            <mat-icon>add</mat-icon>
          </button>
        }
        @if (!siteId()) {
          <mat-hint>Seleccione primero la sede</mat-hint>
        } @else if (!store.placesOf(siteId()).length) {
          <mat-hint>La sede no tiene sitios activos. Créelo con el botón +</mat-hint>
        }
      </mat-form-field>
    </div>
  `,
  styles: [`.picker { display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; } @media (max-width:600px) { .picker { grid-template-columns:1fr; } }`],
})
export class SitePlacePickerComponent implements OnInit {
  store = inject(AssetCatalogStore);
  private dialog = inject(MatDialog);

  @Input({ required: true }) placeControl!: FormControl<number | null>;
  @Input() required = true;
  /** Sitio actual (no seleccionable como destino). */
  @Input() excludePlaceId: number | null = null;

  siteId = signal<number | null>(null);

  ngOnInit(): void {
    this.siteId.set(this.store.siteOfPlace(this.placeControl.value));
  }

  onSite(siteId: number): void {
    this.siteId.set(siteId);
    this.placeControl.setValue(null);
    this.placeControl.markAsTouched();
  }

  createSite(): void {
    this.dialog.open(AssetSiteDialogComponent, { data: null, width: '480px' })
      .afterClosed().subscribe((site: AssetSite | null) => {
        if (!site) return;
        this.store.load(true).subscribe(() => this.onSite(site.id));
      });
  }

  createPlace(): void {
    const current = this.store.sites().find(s => s.id === this.siteId());
    if (!current) return;
    const site: AssetSite = { id: current.id, name: current.name, address: null, is_active: true };
    this.dialog.open(AssetPlaceDialogComponent, { data: { site, place: null }, width: '480px' })
      .afterClosed().subscribe((place: AssetPlace | null) => {
        if (!place) return;
        this.store.load(true).subscribe(() => {
          this.placeControl.setValue(place.id);
          this.placeControl.markAsTouched();
        });
      });
  }
}

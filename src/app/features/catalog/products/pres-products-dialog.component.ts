import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { Router } from '@angular/router';
import { ProductPresentation, Product } from '../catalog.service';

export interface PresProductsDialogData {
  presentation: ProductPresentation;
  products: Product[];
  loading: boolean;
}

@Component({
  selector: 'app-pres-products-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatChipsModule],
  template: `
<h2 mat-dialog-title style="display:flex;align-items:center;gap:0.5rem;padding-bottom:0.25rem">
  <mat-icon style="color:#3182ce">inventory_2</mat-icon>
  Productos que usan este empaque
</h2>

<mat-dialog-content style="min-width:420px;max-width:580px">
  <div style="margin-bottom:0.75rem;padding:0.6rem 0.85rem;background:#EBF8FF;border:1px solid #BEE3F8;border-radius:8px">
    <div style="font-weight:700;font-size:0.92rem">{{ data.presentation.name }}</div>
    <div style="font-size:0.78rem;color:#4a5568;margin-top:0.1rem">
      <code style="background:#e2e8f0;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.78rem">{{ data.presentation.code }}</code>
      &nbsp;·&nbsp; Factor × {{ data.presentation.factor_to_base }}
    </div>
  </div>

  @if (data.loading) {
    <div style="display:flex;align-items:center;gap:0.6rem;color:#718096;padding:1rem 0;font-size:0.85rem">
      <span style="width:16px;height:16px;border:2px solid #3182ce;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.7s linear infinite"></span>
      Buscando productos asignados…
    </div>
  } @else if (data.products.length === 0) {
    <div style="text-align:center;padding:1.5rem 0;color:#a0aec0">
      <mat-icon style="font-size:2rem;height:2rem;width:2rem;display:block;margin:0 auto 0.5rem">link_off</mat-icon>
      <div style="font-size:0.85rem">Este empaque no está asignado a ningún producto aún.</div>
    </div>
  } @else {
    <div style="font-size:0.78rem;color:#718096;margin-bottom:0.5rem">
      {{ data.products.length }} producto(s) utilizan este empaque:
    </div>
    <div style="display:flex;flex-direction:column;gap:0.4rem;max-height:300px;overflow-y:auto">
      @for (p of data.products; track p.id) {
        <div class="prod-row" (click)="goToProduct(p)">
          <mat-icon style="font-size:1rem;height:1rem;width:1rem;color:#3182ce;flex-shrink:0">inventory_2</mat-icon>
          <div style="flex:1;min-width:0">
            <code style="font-size:0.78rem;background:#e2e8f0;padding:0.1rem 0.3rem;border-radius:3px">{{ p.code }}</code>
            <span style="margin-left:0.35rem;font-size:0.88rem">{{ p.name }}</span>
          </div>
          <span class="type-chip" [style.background]="p.product_type === 'kit' ? '#e9d8fd' : '#c6f6d5'"
                [style.color]="p.product_type === 'kit' ? '#553c9a' : '#276749'">
            {{ p.product_type === 'kit' ? '🧩 Kit' : '📦 Simple' }}
          </span>
          <mat-icon style="font-size:0.85rem;height:0.85rem;width:0.85rem;color:#a0aec0">open_in_new</mat-icon>
        </div>
      }
    </div>
  }
</mat-dialog-content>

<mat-dialog-actions align="end" style="padding:0.5rem 1.5rem">
  <button mat-button [mat-dialog-close]="false">Cerrar</button>
</mat-dialog-actions>
  `,
  styles: [`
    :host { display:block; }
    .prod-row {
      display:flex; align-items:center; gap:0.5rem;
      padding:0.5rem 0.75rem; border-radius:8px;
      background:#f7fafc; border:1px solid #e2e8f0;
      cursor:pointer; transition:background 0.15s;
      &:hover { background:#EBF8FF; border-color:#BEE3F8; }
    }
    .type-chip {
      font-size:0.72rem; padding:0.1rem 0.4rem; border-radius:4px;
      font-weight:600; white-space:nowrap; flex-shrink:0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class PresProductsDialogComponent {
  data: PresProductsDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<PresProductsDialogComponent>);
  private router = inject(Router);

  goToProduct(p: Product): void {
    this.ref.close();
    this.router.navigate(['/catalog/products', p.id]);
  }
}

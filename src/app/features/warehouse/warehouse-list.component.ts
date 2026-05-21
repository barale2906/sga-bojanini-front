import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-warehouse-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, PageHeaderComponent],
  template: `
    <app-page-header title="Almacenes" subtitle="Gestión de almacenes, zonas y ubicaciones" icon="warehouse"></app-page-header>
    <div class="placeholder">
      <mat-icon>warehouse</mat-icon>
      <h2>Módulo en construcción</h2>
      <p>Fase 2 — Almacenes, Zonas y Ubicaciones</p>
      <p class="hint">Se implementará próximamente siguiendo el plan frontend.md</p>
    </div>
  `,
  styles: [`.placeholder { text-align:center; padding:4rem; color:#718096; } mat-icon { font-size:4rem; width:4rem; height:4rem; margin-bottom:1rem; } h2 { color:#2d3748; } .hint { font-size:0.875rem; color:#a0aec0; }`],
})
export class WarehouseListComponent {}

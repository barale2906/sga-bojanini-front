import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header title="Reportes" subtitle="Generación y descarga de reportes del sistema" icon="bar_chart"></app-page-header>
    <div class="placeholder">
      <mat-icon>bar_chart</mat-icon>
      <h2>Módulo en construcción</h2>
      <p>Fase 9 — Dashboard y Reportes (PDF/Excel/CSV)</p>
    </div>
  `,
  styles: ['.placeholder { text-align:center; padding:4rem; color:#718096; } mat-icon { font-size:4rem; width:4rem; height:4rem; margin-bottom:1rem; } h2 { color:#2d3748; }'],
})
export class ReportsComponent {}

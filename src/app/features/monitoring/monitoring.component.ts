import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header title="Monitoring" subtitle="Módulo en construcción" icon="construction"></app-page-header>
    <div class="placeholder">
      <mat-icon>construction</mat-icon>
      <h2>En desarrollo</h2>
      <p>Este módulo se implementará en fases posteriores.</p>
    </div>
  `,
  styles: [`.placeholder { text-align:center; padding:4rem; color:#718096; } mat-icon { font-size:4rem; width:4rem; height:4rem; margin-bottom:1rem; } h2 { color:#2d3748; }`],
})
export class MonitoringComponent {}

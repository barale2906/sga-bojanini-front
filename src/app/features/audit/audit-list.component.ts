import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-audit-list',
  standalone: true,
  imports: [CommonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header title="Auditoría" subtitle="Registro de todas las acciones en el sistema" icon="history"></app-page-header>
    <div class="placeholder">
      <mat-icon>history</mat-icon>
      <h2>Módulo en construcción</h2>
      <p>Fase 7 — Auditoría completa con filtros y exportación</p>
    </div>
  `,
  styles: [`.placeholder { text-align:center; padding:4rem; color:#718096; } mat-icon { font-size:4rem; width:4rem; height:4rem; margin-bottom:1rem; } h2 { color:#2d3748; }`],
})
export class AuditListComponent {}

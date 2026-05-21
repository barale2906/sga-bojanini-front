import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';

@Component({
  selector: 'app-audit-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, DateFormatPipe],
  template: `
    <h2 mat-dialog-title>Detalle de Auditoría #{{ data.id }}</h2>
    <mat-dialog-content class="detail">
      <div class="info-grid">
        <div><label>Usuario</label><p>{{ data.user_name }}</p></div>
        <div><label>Acción</label><p><strong>{{ data.action }}</strong></p></div>
        <div><label>Módulo</label><p>{{ data.auditable_type }} #{{ data.auditable_id }}</p></div>
        <div><label>IP</label><p><code>{{ data.ip_address }}</code></p></div>
        <div><label>Fecha</label><p>{{ data.created_at | dateFormat:'datetime' }}</p></div>
      </div>
      @if (data.old_values) {
        <h3>Valores anteriores</h3>
        <pre class="json-block">{{ data.old_values | json }}</pre>
      }
      @if (data.new_values) {
        <h3>Valores nuevos</h3>
        <pre class="json-block">{{ data.new_values | json }}</pre>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="null">Cerrar</button></mat-dialog-actions>
  `,
  styles: ['.detail{max-height:65vh;overflow-y:auto;} .info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem;label{font-size:0.7rem;color:#718096;font-weight:600;text-transform:uppercase;} p{margin:0.2rem 0 0;font-size:0.875rem;}} h3{font-size:0.875rem;font-weight:600;margin:1rem 0 0.4rem;} .json-block{background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:0.75rem;font-size:0.8rem;overflow-x:auto;white-space:pre-wrap;}'],
})
export class AuditDetailDialogComponent {
  data = inject(MAT_DIALOG_DATA);
}

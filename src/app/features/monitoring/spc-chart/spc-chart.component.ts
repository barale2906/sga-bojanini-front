import { Component, Input, OnChanges, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SensorStats, Sensor } from '../monitoring.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-spc-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-wrapper">
      <!-- Leyenda explicativa de las líneas -->
      <div class="chart-legend-info">
        <span class="legend-item legend-alarm">
          <span class="line-sample line-alarm"></span>
          Límite de Control (LCS / LCI) — zona de alarma
        </span>
        <span class="legend-item legend-warning">
          <span class="line-sample line-warning"></span>
          Límite de Advertencia (LAS / LAI) — zona de alerta
        </span>
        <span class="legend-item legend-mean">
          <span class="line-sample line-mean"></span>
          Promedio (Media del proceso)
        </span>
        <span class="legend-item">
          <span class="dot dot-ok"></span> OK &nbsp;
          <span class="dot dot-warn"></span> Advertencia &nbsp;
          <span class="dot dot-alarm"></span> Alarma
        </span>
      </div>

      <div class="chart-container">
        <canvas #chartCanvas></canvas>
      </div>

      <!-- Tabla de referencia de límites -->
      @if (stats) {
        <div class="limits-table">
          <table>
            <thead>
              <tr>
                <th>Límite</th>
                <th>Sigla</th>
                <th>Valor</th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody>
              <tr class="row-alarm">
                <td><strong>Límite de Control Superior</strong></td>
                <td><code>LCS</code></td>
                <td><strong>{{ stats.ucl | number:'1.2-2' }} {{ sensor?.unit }}</strong></td>
                <td>Por encima → proceso fuera de control ⛔</td>
              </tr>
              <tr class="row-warning">
                <td><strong>Límite de Advertencia Superior</strong></td>
                <td><code>LAS</code></td>
                <td>{{ stats.uwl | number:'1.2-2' }} {{ sensor?.unit }}</td>
                <td>Entre LAS y LCS → zona de alerta ⚠️</td>
              </tr>
              <tr class="row-mean">
                <td><strong>Media del Proceso</strong></td>
                <td><code>X̄</code></td>
                <td>{{ stats.mean | number:'1.2-2' }} {{ sensor?.unit }}</td>
                <td>Promedio de todas las lecturas ✅</td>
              </tr>
              <tr class="row-warning">
                <td><strong>Límite de Advertencia Inferior</strong></td>
                <td><code>LAI</code></td>
                <td>{{ stats.lwl | number:'1.2-2' }} {{ sensor?.unit }}</td>
                <td>Entre LCI y LAI → zona de alerta ⚠️</td>
              </tr>
              <tr class="row-alarm">
                <td><strong>Límite de Control Inferior</strong></td>
                <td><code>LCI</code></td>
                <td><strong>{{ stats.lcl | number:'1.2-2' }} {{ sensor?.unit }}</strong></td>
                <td>Por debajo → proceso fuera de control ⛔</td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .chart-wrapper {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    /* Leyenda explicativa superior */
    .chart-legend-info {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.5rem;
      padding: 0.75rem 1rem;
      background: #f7fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.8rem;
      color: #4a5568;
    }
    .legend-item { display: flex; align-items: center; gap: 0.4rem; }
    .line-sample {
      display: inline-block; width: 28px; height: 3px; border-radius: 2px;
    }
    .line-alarm   { background: #e53e3e; border-top: 2px dashed #e53e3e; }
    .line-warning { background: #dd6b20; border-top: 1px dashed #dd6b20; }
    .line-mean    { background: #38a169; }
    .dot {
      display: inline-block; width: 10px; height: 10px; border-radius: 50%;
    }
    .dot-ok    { background: #38a169; }
    .dot-warn  { background: #dd6b20; }
    .dot-alarm { background: #e53e3e; }

    /* Gráfico */
    .chart-container {
      background: #fff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      padding: 1rem;
      height: 380px;
    }

    /* Tabla de límites */
    .limits-table {
      overflow-x: auto;
    }
    .limits-table table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.825rem;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    .limits-table th {
      background: #2d3748;
      color: #fff;
      padding: 0.5rem 0.75rem;
      text-align: left;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .limits-table td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid #edf2f7;
      vertical-align: middle;
    }
    .limits-table code {
      background: #edf2f7;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-family: monospace;
      font-size: 0.8rem;
      color: #4a5568;
    }
    .row-alarm  td { border-left: 4px solid #e53e3e; background: #fff5f5; }
    .row-warning td { border-left: 4px solid #dd6b20; background: #fffaf0; }
    .row-mean   td { border-left: 4px solid #38a169; background: #f0fff4; }
  `],
})
export class SpcChartComponent implements OnChanges, AfterViewInit {
  @Input() stats!: SensorStats;
  @Input() sensor!: Sensor;
  @ViewChild('chartCanvas') canvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  ngAfterViewInit(): void { this.buildChart(); }
  ngOnChanges(): void { if (this.canvas) this.buildChart(); }

  buildChart(): void {
    if (!this.stats || !this.canvas) return;
    if (this.chart) { this.chart.destroy(); }

    const labels = this.stats.readings.map(r => r.recorded_at.substring(0, 16));
    const values = this.stats.readings.map(r => r.value);
    const n = this.stats.readings.length;
    const unit = this.sensor?.unit || '';

    const colorPoints = this.stats.readings.map(r =>
      r.status === 'alarm' ? '#e53e3e' : r.status === 'warning' ? '#dd6b20' : '#38a169'
    );

    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `Lecturas (${unit})`,
            data: values,
            borderColor: '#3182ce',
            backgroundColor: 'transparent',
            pointBackgroundColor: colorPoints,
            pointBorderColor: colorPoints,
            pointRadius: 5,
            pointHoverRadius: 7,
            tension: 0.1,
            order: 1,
          },
          {
            label: `LCS — Límite de Control Superior (${this.stats.ucl.toFixed(2)} ${unit})`,
            data: new Array(n).fill(this.stats.ucl),
            borderColor: '#e53e3e',
            borderDash: [8, 4],
            pointRadius: 0,
            borderWidth: 2.5,
            fill: false,
            order: 2,
          },
          {
            label: `LAS — Límite de Advertencia Superior (${this.stats.uwl.toFixed(2)} ${unit})`,
            data: new Array(n).fill(this.stats.uwl),
            borderColor: '#dd6b20',
            borderDash: [4, 4],
            pointRadius: 0,
            borderWidth: 1.5,
            fill: false,
            order: 3,
          },
          {
            label: `X̄ — Media del Proceso (${this.stats.mean.toFixed(2)} ${unit})`,
            data: new Array(n).fill(this.stats.mean),
            borderColor: '#38a169',
            pointRadius: 0,
            borderWidth: 2,
            fill: false,
            order: 4,
          },
          {
            label: `LAI — Límite de Advertencia Inferior (${this.stats.lwl.toFixed(2)} ${unit})`,
            data: new Array(n).fill(this.stats.lwl),
            borderColor: '#dd6b20',
            borderDash: [4, 4],
            pointRadius: 0,
            borderWidth: 1.5,
            fill: false,
            order: 5,
          },
          {
            label: `LCI — Límite de Control Inferior (${this.stats.lcl.toFixed(2)} ${unit})`,
            data: new Array(n).fill(this.stats.lcl),
            borderColor: '#e53e3e',
            borderDash: [8, 4],
            pointRadius: 0,
            borderWidth: 2.5,
            fill: false,
            order: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 20,
              padding: 12,
              font: { size: 11 },
            },
          },
          title: {
            display: true,
            text: [
              `Gráfico de Control Estadístico — ${this.sensor?.name || ''}`,
              `${this.stats.total_readings} lecturas analizadas | Cp: ${this.stats.cp.toFixed(2)} | Cpk: ${this.stats.cpk.toFixed(2)}`,
            ],
            font: { size: 13 },
            padding: { bottom: 12 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y;
                if (val == null) return '';
                if (ctx.dataset.label?.startsWith('Lecturas')) {
                  const status = this.getReadingStatus(val);
                  return ` ${val.toFixed(2)} ${unit}  ${status}`;
                }
                return ` ${ctx.dataset.label?.split('—')[0].trim()}: ${val.toFixed(2)} ${unit}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 10,
              maxRotation: 45,
              font: { size: 10 },
            },
            grid: { color: '#f0f0f0' },
          },
          y: {
            ticks: {
              font: { size: 10 },
              callback: (val) => `${Number(val).toFixed(1)} ${unit}`,
            },
            grid: { color: '#f0f0f0' },
          },
        },
      },
    });
  }

  private getReadingStatus(value: number): string {
    if (value > this.stats.ucl || value < this.stats.lcl) return '⛔ ALARMA';
    if (value > this.stats.uwl || value < this.stats.lwl) return '⚠️ Advertencia';
    return '✅ Normal';
  }
}

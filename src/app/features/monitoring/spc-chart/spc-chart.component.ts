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
    <div class="chart-container">
      <canvas #chartCanvas></canvas>
    </div>
  `,
  styles: ['.chart-container { background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 1rem; height: 400px; }'],
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

    const colorPoints = this.stats.readings.map(r =>
      r.status === 'alarm' ? '#e53e3e' : r.status === 'warning' ? '#dd6b20' : '#38a169'
    );

    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Lecturas', data: values, borderColor: '#3182ce', backgroundColor: 'transparent', pointBackgroundColor: colorPoints, pointRadius: 5, tension: 0.1 },
          { label: 'UCL', data: new Array(n).fill(this.stats.ucl), borderColor: '#e53e3e', borderDash: [6, 3], pointRadius: 0, borderWidth: 2, fill: false },
          { label: 'UWL', data: new Array(n).fill(this.stats.uwl), borderColor: '#dd6b20', borderDash: [3, 3], pointRadius: 0, borderWidth: 1, fill: false },
          { label: 'Media', data: new Array(n).fill(this.stats.mean), borderColor: '#38a169', pointRadius: 0, borderWidth: 2, fill: false },
          { label: 'LWL', data: new Array(n).fill(this.stats.lwl), borderColor: '#dd6b20', borderDash: [3, 3], pointRadius: 0, borderWidth: 1, fill: false },
          { label: 'LCL', data: new Array(n).fill(this.stats.lcl), borderColor: '#e53e3e', borderDash: [6, 3], pointRadius: 0, borderWidth: 2, fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' }, title: { display: true, text: `Gráfico de Control — ${this.sensor?.name || ''}` } },
        scales: { x: { ticks: { maxTicksLimit: 12, maxRotation: 45 } } },
      },
    });
  }
}

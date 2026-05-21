import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    @if (loading) {
      <div class="spinner-overlay" [class.inline]="inline">
        <mat-spinner [diameter]="diameter" color="primary"></mat-spinner>
        @if (message) {
          <p class="spinner-message">{{ message }}</p>
        }
      </div>
    }
  `,
  styles: [`
    .spinner-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      gap: 1rem;
    }
    .spinner-overlay:not(.inline) {
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,0.7);
      z-index: 10;
    }
    .spinner-message {
      color: #666;
      font-size: 0.875rem;
      margin: 0;
    }
  `],
})
export class LoadingSpinnerComponent {
  @Input() loading = false;
  @Input() message = '';
  @Input() diameter = 48;
  @Input() inline = false;
}

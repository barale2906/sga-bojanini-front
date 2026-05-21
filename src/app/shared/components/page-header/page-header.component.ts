import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="page-header">
      <div class="page-header__left">
        @if (icon) {
          <mat-icon class="page-header__icon">{{ icon }}</mat-icon>
        }
        <div>
          <h1 class="page-header__title">{{ title }}</h1>
          @if (subtitle) {
            <p class="page-header__subtitle">{{ subtitle }}</p>
          }
        </div>
      </div>
      <div class="page-header__actions">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e2e8f0;

      &__left {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      &__icon {
        font-size: 2rem;
        width: 2rem;
        height: 2rem;
        color: #C02F86;
      }

      &__title {
        font-size: 1.5rem;
        font-weight: 700;
        color: #1a202c;
        margin: 0;
        line-height: 1.2;
      }

      &__subtitle {
        font-size: 0.875rem;
        color: #718096;
        margin: 0.25rem 0 0 0;
      }

      &__actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
    }
  `],
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() icon = '';
}

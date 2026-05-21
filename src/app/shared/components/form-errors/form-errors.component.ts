import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-form-errors',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (errors && errors.length > 0) {
      <div class="form-errors">
        <mat-icon>error_outline</mat-icon>
        <ul>
          @for (error of errors; track error) {
            <li>{{ error }}</li>
          }
        </ul>
      </div>
    }
  `,
  styles: [`
    .form-errors {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      background: #fff5f5;
      border: 1px solid #fed7d7;
      border-radius: 6px;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      color: #c53030;

      mat-icon {
        flex-shrink: 0;
        font-size: 1.25rem;
        width: 1.25rem;
        height: 1.25rem;
        margin-top: 0.1rem;
      }

      ul {
        margin: 0;
        padding: 0 0 0 1rem;
        font-size: 0.875rem;
        line-height: 1.5;
      }
    }
  `],
})
export class FormErrorsComponent {
  @Input() errors: string[] = [];
}

import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { AssetsService } from '../assets.service';
import { AssetComment } from '../assets.models';

/** Comentarios acumulables del equipo: se agregan, no se editan ni eliminan. */
@Component({
  selector: 'app-asset-comments-panel',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, PermissionDirective],
  template: `
    <div class="panel">
      <h3><mat-icon>forum</mat-icon> Comentarios del equipo</h3>
      @if (!readonly) {
        <div class="new-comment" *sgaPermission="'activos.comentar'">
          <mat-form-field appearance="outline" class="grow">
            <mat-label>Agregar comentario</mat-label>
            <textarea matInput [formControl]="text" rows="2" maxlength="2000"></textarea>
          </mat-form-field>
          <button mat-flat-button color="primary" [disabled]="text.invalid || saving()" (click)="add()"><mat-icon>send</mat-icon></button>
        </div>
      }
      <div class="timeline">
        @for (c of comments(); track c.id) {
          <div class="comment">
            <div class="meta"><strong>{{ c.user?.name }}</strong> · {{ c.created_at | date:'dd/MM/yyyy HH:mm' }}</div>
            <div class="body">{{ c.comment }}</div>
          </div>
        } @empty {
          <p class="empty">Aún no hay comentarios.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .panel h3 { display:flex; align-items:center; gap:0.4rem; margin:0 0 0.75rem; color:#2d3748; font-size:1rem; }
    .panel h3 mat-icon { color:#C02F86; }
    .new-comment { display:flex; gap:0.5rem; align-items:flex-start; }
    .grow { flex:1; }
    .timeline { display:flex; flex-direction:column; gap:0.5rem; max-height:420px; overflow:auto; }
    .comment { border-left:3px solid #C02F86; background:#f7fafc; padding:0.5rem 0.75rem; border-radius:0 6px 6px 0; }
    .meta { font-size:0.75rem; color:#718096; margin-bottom:0.2rem; }
    .body { white-space:pre-wrap; color:#2d3748; font-size:0.88rem; }
    .empty { color:#a0aec0; font-size:0.85rem; }
  `],
})
export class AssetCommentsPanelComponent implements OnInit {
  private svc = inject(AssetsService);
  private snack = inject(MatSnackBar);

  @Input({ required: true }) assetId!: number;
  @Input() readonly = false;

  comments = signal<AssetComment[]>([]);
  saving = signal(false);
  text = new FormControl('', [Validators.required, Validators.maxLength(2000)]);

  ngOnInit(): void {
    this.svc.comments(this.assetId).subscribe({ next: res => this.comments.set(res.data) });
  }

  add(): void {
    const comment = this.text.value?.trim();
    if (!comment || this.saving()) return;
    this.saving.set(true);
    this.svc.addComment(this.assetId, comment).subscribe({
      next: res => {
        this.comments.update(list => [res.data, ...list]);
        this.text.reset('');
        this.saving.set(false);
      },
      error: err => {
        this.saving.set(false);
        this.snack.open(err.error?.message ?? 'No fue posible guardar el comentario', 'OK', { duration: 4000 });
      },
    });
  }
}

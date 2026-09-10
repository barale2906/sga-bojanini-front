import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs/operators';
import { UserService } from '../../auth/users/user.service';
import { User } from '../../../core/models/user.model';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

const APPROVER_PERMISSION = 'ordenes_servicio.aprobar';

@Component({
  selector: 'app-discount-approvers-page',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, MatIconModule, MatTableModule,
    MatChipsModule, MatTooltipModule,
    PageHeaderComponent, LoadingSpinnerComponent,
  ],
  templateUrl: './discount-approvers-page.component.html',
  styleUrl: './discount-approvers-page.component.scss',
})
export class DiscountApproversPageComponent implements OnInit {
  private userSvc  = inject(UserService);
  private snack    = inject(MatSnackBar);
  protected router = inject(Router);

  loading   = signal(true);
  allUsers  = signal<User[]>([]);

  approvers = computed(() =>
    this.allUsers().filter(u => u.permissions?.includes(APPROVER_PERMISSION))
  );

  cols = ['name', 'email', 'roles', 'status', 'actions'];

  ngOnInit(): void {
    this.userSvc.getAll({ per_page: 200, is_active: '' })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: r => this.allUsers.set((r as any).data ?? []),
        error: () => this.snack.open('Error al cargar los usuarios', 'OK', { duration: 4000 }),
      });
  }

  editUser(user: User): void {
    this.router.navigate(['/users', user.id, 'edit']);
  }

  goBack(): void {
    this.router.navigate(['/service-orders/descuentos']);
  }

  roleLabels(user: User): string {
    return user.roles.map(r => r.name).join(', ') || '—';
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { UserService } from './user.service';
import { User } from '../../../core/models/user.model';
import { PaginationMeta } from '../../../core/models/api-response.model';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatChipsModule,
    MatTooltipModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    PermissionDirective,
    DateFormatPipe,
  ],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss',
})
export class UserListComponent implements OnInit {
  private userService = inject(UserService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  users = signal<User[]>([]);
  meta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  loading = signal(false);

  displayedColumns = ['actions', 'name', 'email', 'roles', 'is_active', 'created_at'];

  filters = this.fb.group({
    search: [''],
    is_active: [''],
  });

  ngOnInit(): void {
    this.loadUsers();

    this.filters.get('search')?.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => this.loadUsers(1));

    this.filters.get('is_active')?.valueChanges
      .subscribe(() => this.loadUsers(1));
  }

  loadUsers(page = 1): void {
    this.loading.set(true);
    const { search, is_active } = this.filters.value;

    this.userService.getAll({
      search: search || undefined,
      is_active: is_active !== '' ? is_active! : undefined,
      per_page: this.meta().per_page,
      page,
    }).subscribe({
      next: (res) => {
        this.users.set(res.data ?? []);
        this.meta.set(res.meta);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onPageChange(event: PageEvent): void {
    this.meta.update(m => ({ ...m, per_page: event.pageSize }));
    this.loadUsers(event.pageIndex + 1);
  }

  confirmDelete(user: User): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar usuario',
        message: `¿Estás seguro de eliminar a "${user.name}"? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        confirmColor: 'warn',
      },
      width: '420px',
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.userService.delete(user.id).subscribe({
          next: () => {
            this.snackBar.open('Usuario eliminado', 'Cerrar', { duration: 3000 });
            this.loadUsers(this.meta().current_page);
          },
        });
      }
    });
  }

  getRoleNames(user: User): string {
    return user.roles.map((r) => r.name).join(', ') || '—';
  }
}

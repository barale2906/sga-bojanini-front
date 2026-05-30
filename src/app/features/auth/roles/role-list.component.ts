import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RoleService, Role } from './role.service';
import { RoleFormDialogComponent } from './role-form-dialog.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    PageHeaderComponent,
    LoadingSpinnerComponent,
    PermissionDirective,
  ],
  templateUrl: './role-list.component.html',
  styleUrl: './role-list.component.scss',
})
export class RoleListComponent implements OnInit {
  private roleService = inject(RoleService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  roles = signal<Role[]>([]);
  loading = signal(false);
  displayedColumns = ['actions', 'name', 'permissions_count', 'users_count'];

  ngOnInit(): void {
    this.loadRoles();
  }

  loadRoles(): void {
    this.loading.set(true);
    this.roleService.getAll().subscribe({
      next: (res) => {
        this.roles.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openForm(role?: Role): void {
    const ref = this.dialog.open(RoleFormDialogComponent, {
      data: role || null,
      width: '90vw',
      maxWidth: '90vw',
      maxHeight: '90vh',
    });

    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.snackBar.open(role ? 'Rol actualizado' : 'Rol creado', 'Cerrar', {
          duration: 3000,
        });
        this.loadRoles();
      }
    });
  }

  confirmDelete(role: Role): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar rol',
        message: `¿Eliminar el rol "${role.name}"? ${role.users_count > 0 ? `⚠️ Tiene ${role.users_count} usuario(s) asignado(s).` : ''}`,
        confirmText: 'Eliminar',
        confirmColor: 'warn',
      },
      width: '420px',
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.roleService.delete(role.id).subscribe({
          next: () => {
            this.snackBar.open('Rol eliminado', 'Cerrar', { duration: 3000 });
            this.loadRoles();
          },
          error: (err) => {
            if (err.status === 409) {
              this.snackBar.open(
                err.error?.message || 'No se puede eliminar este rol',
                'Cerrar',
                { duration: 5000, panelClass: ['snack-warn'] }
              );
            }
          },
        });
      }
    });
  }
}

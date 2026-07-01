import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { UserService } from './user.service';
import { RoleService } from '../roles/role.service';
import { WarehouseService, Warehouse } from '../../warehouse/warehouse.service';
import { AuthService } from '../../../core/services/auth.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    PageHeaderComponent,
    FormErrorsComponent,
    PermissionDirective,
  ],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.scss',
})
export class UserFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);
  private roleService = inject(RoleService);
  private warehouseService = inject(WarehouseService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  isEdit = signal(false);
  userId = signal<number | null>(null);
  loading = signal(false);
  saving = signal(false);
  validationErrors = signal<string[]>([]);
  fieldErrors = signal<Record<string, string[]>>({});
  roles = signal<{ id: number; name: string; permissions: string[] }[]>([]);
  warehouses = signal<Warehouse[]>([]);
  showPassword = signal(false);

  canAssignWarehouses = this.authService.hasPermission('almacenes.asignar');

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.minLength(8)]],
    phone: ['', [Validators.maxLength(20)]],
    is_active: [true],
    role_ids: [[] as number[]],
    warehouse_ids: [[] as number[]],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.userId.set(Number(id));
      this.loadUser(Number(id));
    }
    this.loadRoles();

    if (this.canAssignWarehouses) {
      this.loadWarehouses();
      if (id) {
        this.loadAssignedWarehouses(Number(id));
      }
    }

  }

  loadUser(id: number): void {
    this.loading.set(true);
    this.userService.getById(id).subscribe({
      next: (res) => {
        const u = res.data;
        this.form.patchValue({
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          is_active: u.is_active,
          role_ids: u.roles.map((r) => r.id),
        });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadRoles(): void {
    this.roleService.getAll().subscribe({
      next: (res) => this.roles.set(res.data),
      error: () => {},
    });
  }

  loadWarehouses(): void {
    this.warehouseService.getWarehouses().subscribe({
      next: (res) => this.warehouses.set(res.data ?? []),
      error: () => {},
    });
  }

  loadAssignedWarehouses(id: number): void {
    this.userService.getWarehouses(id).subscribe({
      next: (res) => this.form.patchValue({ warehouse_ids: (res.data ?? []).map((w) => w.id) }),
      error: () => {},
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.validationErrors.set([]);
    this.fieldErrors.set({});

    const value = this.form.value;
    const payload: Record<string, unknown> = {
      name: value.name,
      email: value.email,
      phone: value.phone || undefined,
      is_active: value.is_active,
      role_ids: value.role_ids || [],
    };

    if (value.password) {
      payload['password'] = value.password;
    }

    const request$ = this.isEdit()
      ? this.userService.update(this.userId()!, payload as any)
      : this.userService.create(payload as any);

    const warehouseIds = value.warehouse_ids;

    request$
      .pipe(
        switchMap((res) => {
          const id = this.isEdit() ? this.userId()! : res.data.id;
          if (!this.canAssignWarehouses || !warehouseIds) return of(id);
          return this.userService.assignWarehouses(id, warehouseIds).pipe(map(() => id));
        })
      )
      .subscribe({
        next: () => {
          this.snackBar.open(
            this.isEdit() ? 'Usuario actualizado' : 'Usuario creado',
            'Cerrar',
            { duration: 3000 }
          );
          this.router.navigate(['/users']);
        },
        error: (err) => {
          this.saving.set(false);
          if (err.status === 422 && err.error?.errors) {
            this.fieldErrors.set(err.error.errors);
            const msgs: string[] = [];
            Object.values(err.error.errors as Record<string, string[]>).forEach(
              (arr) => msgs.push(...arr)
            );
            this.validationErrors.set(msgs);
          }
        },
      });
  }
}

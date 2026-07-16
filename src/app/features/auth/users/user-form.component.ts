import { Component, inject, signal, computed, OnInit } from '@angular/core';
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
import { MatStepperModule } from '@angular/material/stepper';
import { MatDividerModule } from '@angular/material/divider';
import { of, forkJoin } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { UserService } from './user.service';
import { RoleService } from '../roles/role.service';
import { WarehouseService, Warehouse } from '../../warehouse/warehouse.service';
import { MonitoringService, Sensor } from '../../monitoring/monitoring.service';
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
    MatStepperModule,
    MatDividerModule,
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
  private monitoringService = inject(MonitoringService);
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
  sensors = signal<Sensor[]>([]);
  showPassword = signal(false);

  canAssignWarehouses = computed(() => this.authService.hasPermission('almacenes.asignar'));
  canAssignSensors = computed(() => this.authService.hasPermission('sensores.asignar'));

  // Paso 1: datos básicos (obligatorios)
  step1 = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.minLength(8)]],
    phone: ['', [Validators.maxLength(20)]],
    is_active: [true],
    role_ids: [[] as number[]],
  });

  // Paso 2: asignación de recursos (opcional)
  step2 = this.fb.group({
    warehouse_ids: [[] as number[]],
    sensor_ids: [[] as number[]],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.loadRoles();

    if (id) {
      this.isEdit.set(true);
      this.userId.set(Number(id));
      this.loadUser(Number(id));
    }

    if (this.canAssignWarehouses()) {
      this.warehouseService.getWarehouses().subscribe({
        next: (res) => this.warehouses.set(res.data ?? []),
        error: () => {},
      });
      if (id) {
        this.userService.getWarehouses(Number(id)).subscribe({
          next: (res) => this.step2.patchValue({ warehouse_ids: (res.data ?? []).map((w) => w.id) }),
          error: () => {},
        });
      }
    }

    if (this.canAssignSensors()) {
      this.monitoringService.getSensors({ is_active: 'true' }).subscribe({
        next: (res) => this.sensors.set(res.data ?? []),
        error: () => {},
      });
      if (id) {
        this.userService.getSensors(Number(id)).subscribe({
          next: (res) => this.step2.patchValue({ sensor_ids: (res.data ?? []).map((s) => s.id) }),
          error: () => {},
        });
      }
    }
  }

  loadUser(id: number): void {
    this.loading.set(true);
    this.userService.getById(id).subscribe({
      next: (res) => {
        const u = res.data;
        this.step1.patchValue({
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

  onSubmit(): void {
    if (this.step1.invalid || this.saving()) return;

    this.saving.set(true);
    this.validationErrors.set([]);
    this.fieldErrors.set({});

    const v1 = this.step1.value;
    const payload: Record<string, unknown> = {
      name: v1.name,
      email: v1.email,
      phone: v1.phone || undefined,
      is_active: v1.is_active,
      role_ids: v1.role_ids || [],
    };
    if (v1.password) payload['password'] = v1.password;

    const request$ = this.isEdit()
      ? this.userService.update(this.userId()!, payload as any)
      : this.userService.create(payload as any);

    const warehouseIds = this.step2.value.warehouse_ids ?? [];
    const sensorIds = this.step2.value.sensor_ids ?? [];

    request$
      .pipe(
        switchMap((res) => {
          const uid = this.isEdit() ? this.userId()! : res.data.id;
          const calls: Array<ReturnType<typeof of>> = [];

          if (this.canAssignWarehouses()) {
            calls.push(this.userService.assignWarehouses(uid, warehouseIds) as any);
          }
          if (this.canAssignSensors()) {
            calls.push(this.userService.assignSensors(uid, sensorIds) as any);
          }

          return calls.length ? forkJoin(calls).pipe(map(() => uid)) : of(uid);
        })
      )
      .subscribe({
        next: () => {
          this.snackBar.open(
            this.isEdit() ? 'Usuario actualizado' : 'Usuario creado',
            'Cerrar',
            { duration: 3000 }
          );
          this.router.navigate(['/admin']);
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

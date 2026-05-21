import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { RoleService, Role, Permission, PermissionsGrouped } from './role.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

const MODULE_LABELS: Record<string, string> = {
  users: 'Usuarios',
  roles: 'Roles',
  warehouses: 'Almacenes',
  zones: 'Zonas',
  locations: 'Ubicaciones',
  products: 'Productos',
  suppliers: 'Proveedores',
  batches: 'Lotes',
  stock: 'Stock',
  movements: 'Movimientos',
  purchase_orders: 'Órdenes de Compra',
  sensors: 'Sensores',
  readings: 'Lecturas',
  alert_rules: 'Reglas de Alerta',
  audit: 'Auditoría',
  reports: 'Reportes',
  integrations: 'Integraciones',
  consumptions: 'Consumos',
  dashboard: 'Dashboard',
  notifications: 'Notificaciones',
};

@Component({
  selector: 'app-role-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatIconModule,
    FormErrorsComponent,
  ],
  templateUrl: './role-form-dialog.component.html',
  styleUrl: './role-form-dialog.component.scss',
})
export class RoleFormDialogComponent implements OnInit {
  data: Role | null = inject(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<RoleFormDialogComponent>);
  private fb = inject(FormBuilder);
  private roleService = inject(RoleService);

  loading = signal(false);
  saving = signal(false);
  validationErrors = signal<string[]>([]);
  permissionsGrouped = signal<PermissionsGrouped>({});
  selectedPermissions = signal<Set<number>>(new Set());

  moduleLabels = MODULE_LABELS;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
  });

  get moduleNames(): string[] {
    return Object.keys(this.permissionsGrouped());
  }

  ngOnInit(): void {
    if (this.data) {
      this.form.patchValue({ name: this.data.name });
    }
    this.loadPermissions();
  }

  loadPermissions(): void {
    this.loading.set(true);
    this.roleService.getPermissions().subscribe({
      next: (res) => {
        this.permissionsGrouped.set(res.data);
        if (this.data?.permissions) {
          const allPerms = Object.values(res.data).flat();
          const ids = new Set(
            allPerms
              .filter((p) => this.data!.permissions.includes(p.name))
              .map((p) => p.id)
          );
          this.selectedPermissions.set(ids);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  togglePermission(perm: Permission): void {
    const set = new Set(this.selectedPermissions());
    if (set.has(perm.id)) {
      set.delete(perm.id);
    } else {
      set.add(perm.id);
    }
    this.selectedPermissions.set(set);
  }

  toggleModule(module: string): void {
    const perms = this.permissionsGrouped()[module];
    const set = new Set(this.selectedPermissions());
    const allSelected = perms.every((p) => set.has(p.id));
    if (allSelected) {
      perms.forEach((p) => set.delete(p.id));
    } else {
      perms.forEach((p) => set.add(p.id));
    }
    this.selectedPermissions.set(set);
  }

  isModuleSelected(module: string): boolean {
    const perms = this.permissionsGrouped()[module];
    return perms?.every((p) => this.selectedPermissions().has(p.id)) ?? false;
  }

  isModuleIndeterminate(module: string): boolean {
    const perms = this.permissionsGrouped()[module];
    const someSelected = perms?.some((p) => this.selectedPermissions().has(p.id)) ?? false;
    return someSelected && !this.isModuleSelected(module);
  }

  getPermissionLabel(name: string): string {
    const parts = name.split('.');
    return parts[parts.length - 1].replace(/_/g, ' ');
  }

  onSubmit(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.validationErrors.set([]);

    const payload = {
      name: this.form.value.name!,
      permission_ids: Array.from(this.selectedPermissions()),
    };

    const request$ = this.data
      ? this.roleService.update(this.data.id, payload)
      : this.roleService.create(payload);

    request$.subscribe({
      next: () => {
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        if (err.status === 422 && err.error?.errors) {
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

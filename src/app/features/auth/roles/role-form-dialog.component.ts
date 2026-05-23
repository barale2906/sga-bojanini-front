import { Component, inject, signal, computed, OnInit } from '@angular/core';
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { RoleService, Role, Permission, PermissionsGrouped } from './role.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

const MODULE_LABELS: Record<string, string> = {
  usuarios: 'Usuarios',
  roles: 'Roles',
  almacenes: 'Almacenes',
  zonas: 'Zonas',
  ubicaciones: 'Ubicaciones',
  productos: 'Productos',
  proveedores: 'Proveedores',
  lotes: 'Lotes',
  stock: 'Stock',
  movimientos: 'Movimientos',
  ordenes_compra: 'Órdenes de Compra',
  sensores: 'Sensores',
  lecturas: 'Lecturas',
  reglas_alerta: 'Reglas de Alerta',
  auditoria: 'Auditoría',
  reportes: 'Reportes',
  integraciones: 'Integraciones',
  consumos: 'Consumos',
  tablero: 'Dashboard',
  notificaciones: 'Notificaciones',
};

const ACTION_LABELS: Record<string, string> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  importar: 'Importar',
  exportar: 'Exportar',
  entrada: 'Entrada',
  salida: 'Salida',
  transferir: 'Transferir',
  ajuste: 'Ajuste',
  devolucion: 'Devolución',
  baja: 'Baja',
  aprobar: 'Aprobar',
  enviar: 'Enviar',
  recibir: 'Recibir',
  configurar: 'Configurar',
};

const ACTION_ORDER = [
  'ver', 'crear', 'editar', 'eliminar', 'importar', 'exportar',
  'entrada', 'salida', 'transferir', 'ajuste', 'devolucion', 'baja',
  'aprobar', 'enviar', 'recibir', 'configurar',
];

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
    MatTooltipModule,
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
  actionLabels = ACTION_LABELS;

  /** Mapa nombre→Permission para lookup O(1) en la plantilla */
  permissionsMap = computed(() => {
    const map = new Map<string, Permission>();
    Object.values(this.permissionsGrouped()).flat().forEach(p => map.set(p.name, p));
    return map;
  });

  /** Columnas de acciones ordenadas y deduplicadas */
  allActions = computed(() => {
    const found = new Set<string>();
    Object.values(this.permissionsGrouped()).flat().forEach(p => {
      const action = p.name.split('.').pop()!;
      found.add(action);
    });
    return ACTION_ORDER.filter(a => found.has(a));
  });

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

  /** Devuelve el Permission para la celda [módulo × acción], o null si no existe */
  getPermForCell(module: string, action: string): Permission | null {
    return this.permissionsMap().get(`${module}.${action}`) ?? null;
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

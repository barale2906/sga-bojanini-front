import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route?: string;
  permission?: string | string[];
  children?: NavItem[];
  expanded?: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatListModule, MatIconModule, MatTooltipModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  @Input() collapsed = false;

  auth = inject(AuthService);
  router = inject(Router);

  navItems: NavItem[] = [
    {
      label: 'Dashboard',
      icon: 'dashboard',
      route: '/dashboard',
      permission: 'dashboard.ver',
    },
    {
      label: 'Almacenes',
      icon: 'warehouse',
      route: '/warehouses',
      permission: 'almacenes.ver',
    },
    {
      label: 'Catálogo',
      icon: 'inventory_2',
      route: '/catalog',
      permission: 'productos.ver',
    },
    {
      label: 'Inventario',
      icon: 'layers',
      route: '/inventory',
      permission: 'stock.ver',
    },
    {
      label: 'Compras',
      icon: 'shopping_cart',
      route: '/purchasing',
      permission: 'ordenes_compra.ver',
    },
    {
      label: 'Monitoreo',
      icon: 'thermostat',
      route: '/monitoring',
      permission: 'sensores.ver',
    },
    {
      label: 'Integraciones',
      icon: 'integration_instructions',
      route: '/integrations',
      permission: 'integraciones.ver',
    },
    {
      label: 'Reportes',
      icon: 'bar_chart',
      route: '/reports',
      permission: 'reportes.ver',
    },
    {
      label: 'Auditoría',
      icon: 'history',
      route: '/audit',
      permission: 'auditoria.ver',
    },
    {
      label: 'Usuarios',
      icon: 'people',
      route: '/users',
      permission: 'usuarios.ver',
    },
    {
      label: 'Roles',
      icon: 'manage_accounts',
      route: '/roles',
      permission: 'roles.ver',
    },
  ];

  visibleItems: NavItem[] = [];

  ngOnInit(): void {
    this.visibleItems = this.navItems.filter((item) => {
      if (!item.permission) return true;
      const perms = Array.isArray(item.permission) ? item.permission : [item.permission];
      return this.auth.hasAnyPermission(perms);
    });
  }

  isActive(route: string): boolean {
    return this.router.isActive(route, {
      paths: 'subset',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
  }
}

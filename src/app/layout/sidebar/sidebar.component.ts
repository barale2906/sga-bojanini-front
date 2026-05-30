import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { MenuService } from '../../core/services/menu.service';
import { MenuItem } from '../../core/models/menu.model';

const ICON_MAP: Record<string, string> = {
  'layout-dashboard': 'dashboard',
  'building-2': 'warehouse',
  'grid-2x2': 'grid_view',
  'map-pin': 'place',
  'book-open': 'menu_book',
  'package': 'inventory_2',
  'tag': 'label',
  'ruler': 'straighten',
  'layers': 'layers',
  'truck': 'local_shipping',
  'warehouse': 'warehouse',
  'boxes': 'inventory',
  'calendar-range': 'date_range',
  'arrow-left-right': 'swap_horiz',
  'landmark': 'account_balance',
  'stethoscope': 'medical_services',
  'shopping-cart': 'shopping_cart',
  'file-text': 'description',
  'activity': 'timeline',
  'thermometer': 'thermostat',
  'bell': 'notifications',
  'plug': 'power',
  'heart-pulse': 'monitor_heart',
  'bar-chart-2': 'bar_chart',
  'shield-check': 'verified_user',
  'settings': 'settings',
  'users': 'people',
  'shield': 'security',
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatTooltipModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  @Input() collapsed = false;

  auth = inject(AuthService);
  router = inject(Router);
  menuService = inject(MenuService);

  expandedGroups = new Set<string>();

  ngOnInit(): void {
    for (const item of this.menuService.menu()) {
      if (item.children.length > 0 && this.isGroupActive(item)) {
        this.expandedGroups.add(item.key);
      }
    }
  }

  resolveIcon(lucideIcon: string): string {
    return ICON_MAP[lucideIcon] ?? 'circle';
  }

  resolveRoute(routeName: string | null): string | null {
    return this.menuService.resolveRoute(routeName);
  }

  isLeafActive(item: MenuItem): boolean {
    const path = this.resolveRoute(item.route);
    return path ? this.isActive(path) : false;
  }

  isGroupActive(item: MenuItem): boolean {
    return item.children.some((child) => {
      const path = this.resolveRoute(child.route);
      return path ? this.isActive(path) : false;
    });
  }

  getFirstChildRoute(item: MenuItem): string | null {
    for (const child of item.children) {
      const path = this.resolveRoute(child.route);
      if (path) return path;
    }
    return null;
  }

  onGroupClick(item: MenuItem): void {
    if (this.collapsed) {
      const route = this.getFirstChildRoute(item);
      if (route) this.router.navigate([route]);
    } else {
      this.toggleGroup(item.key);
    }
  }

  toggleGroup(key: string): void {
    if (this.expandedGroups.has(key)) {
      this.expandedGroups.delete(key);
    } else {
      this.expandedGroups.add(key);
    }
  }

  isExpanded(key: string): boolean {
    return this.expandedGroups.has(key);
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

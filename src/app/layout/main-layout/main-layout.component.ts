import { Component, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, HeaderComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  sidebarCollapsed = signal(true);

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  expandSidebar(): void {
    this.sidebarCollapsed.set(false);
  }

  /** Clic fuera del sidebar (y del botón de hamburguesa) lo vuelve a comprimir. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.sidebarCollapsed()) return;
    const target = event.target as HTMLElement;
    if (target.closest('.sidebar') || target.closest('.header__toggle')) return;
    this.sidebarCollapsed.set(true);
  }
}

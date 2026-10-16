import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { filter } from 'rxjs';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';

/** Ancho máximo en el que el sidebar se comporta como cajón superpuesto (celular / tablet vertical). */
export const MOBILE_BREAKPOINT = '(max-width: 768px)';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, HeaderComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  private breakpoints = inject(BreakpointObserver);

  sidebarCollapsed = signal(true);

  /**
   * En celular el sidebar no ocupa espacio: comprimido queda oculto y
   * expandido se muestra encima del contenido.
   */
  isMobile = signal(this.breakpoints.isMatched(MOBILE_BREAKPOINT));

  constructor() {
    const destroyRef = inject(DestroyRef);

    this.breakpoints.observe(MOBILE_BREAKPOINT)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((state) => {
        this.isMobile.set(state.matches);
        if (state.matches) this.sidebarCollapsed.set(true);
      });

    // En celular, al elegir una opción del menú se cierra para dejar ver la consulta
    inject(Router).events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        if (this.isMobile()) this.sidebarCollapsed.set(true);
      });
  }

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

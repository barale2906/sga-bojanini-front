import { Component, EventEmitter, Output, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService, SgaNotification } from '../../core/services/notification.service';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatBadgeModule,
    MatDividerModule,
    DateFormatPipe,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Output() toggleSidebar = new EventEmitter<void>();

  auth = inject(AuthService);
  notifService = inject(NotificationService);

  recentNotifications: SgaNotification[] = [];

  ngOnInit(): void {
    this.notifService.startPolling();
  }

  ngOnDestroy(): void {
    this.notifService.stopPolling();
  }

  loadRecentNotifications(): void {
    this.notifService.getNotifications(1, false).subscribe({
      next: (res) => (this.recentNotifications = res.data.slice(0, 5)),
      error: () => {},
    });
  }

  markAsRead(id: string): void {
    this.notifService.markAsRead(id).subscribe();
  }

  logout(): void {
    this.auth.logout();
  }
}

import { Component, EventEmitter, Output, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService, SgaNotification } from '../../core/services/notification.service';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { ReportsService } from '../../features/reports/reports.service';

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
  private reportsSvc = inject(ReportsService);
  private snack = inject(MatSnackBar);

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

  isReportReady(notif: SgaNotification): boolean {
    return notif.data?.['type'] === 'report_ready';
  }

  downloadReport(notif: SgaNotification): void {
    const exportId = notif.data?.['export_id'] as string | undefined;
    if (!exportId) return;
    this.reportsSvc.downloadExport(exportId).subscribe({
      error: () => this.snack.open('No se pudo descargar el reporte, puede haber expirado.', 'Cerrar', { duration: 5000 }),
    });
  }

  logout(): void {
    this.auth.logout();
  }
}

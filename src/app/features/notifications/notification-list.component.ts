import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { NotificationService, SgaNotification } from '../../core/services/notification.service';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { PaginationMeta } from '../../core/models/api-response.model';
import { ReportsService } from '../reports/reports.service';

@Component({
  selector: 'app-notification-list',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatPaginatorModule,
    MatSlideToggleModule,
    MatTooltipModule,
    PageHeaderComponent,
    DateFormatPipe,
  ],
  templateUrl: './notification-list.component.html',
  styleUrl: './notification-list.component.scss',
})
export class NotificationListComponent implements OnInit {
  private notifService = inject(NotificationService);
  private reportsSvc = inject(ReportsService);
  private snackBar = inject(MatSnackBar);

  notifications = signal<SgaNotification[]>([]);
  meta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  loading = signal(false);
  unreadOnly = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(page = 1): void {
    this.loading.set(true);
    this.notifService.getNotifications(page, this.unreadOnly()).subscribe({
      next: (res) => {
        this.notifications.set(res.data);
        this.meta.set(res.meta);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  markAsRead(id: string): void {
    this.notifService.markAsRead(id).subscribe({
      next: () => this.load(this.meta().current_page),
    });
  }

  markAllAsRead(): void {
    this.notifService.markAllAsRead().subscribe({
      next: () => {
        this.snackBar.open('Todas las notificaciones marcadas como leídas', 'Cerrar', { duration: 3000 });
        this.load(1);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    this.load(event.pageIndex + 1);
  }

  getSeverityClass(severity: string): string {
    return `severity-${severity}`;
  }

  isReportReady(notif: SgaNotification): boolean {
    return notif.data?.['type'] === 'report_ready';
  }

  downloadReport(notif: SgaNotification): void {
    const exportId = notif.data?.['export_id'] as string | undefined;
    if (!exportId) return;
    this.reportsSvc.downloadExport(exportId).subscribe({
      error: () => this.snackBar.open('No se pudo descargar el reporte, puede haber expirado.', 'Cerrar', { duration: 5000 }),
    });
  }
}

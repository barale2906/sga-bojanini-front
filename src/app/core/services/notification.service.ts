import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../models/api-response.model';

export interface SgaNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  read_at: string | null;
  created_at: string;
  data: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = environment.apiUrl;
  private unreadCountSignal = signal(0);
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  count = this.unreadCountSignal.asReadonly();

  constructor(private http: HttpClient) {}

  startPolling(): void {
    this.fetchUnreadCount();
    if (!this.pollingInterval) {
      this.pollingInterval = setInterval(() => this.fetchUnreadCount(), 30_000);
    }
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private fetchUnreadCount(): void {
    this.http
      .get<ApiResponse<{ count: number }>>(`${this.api}/notifications/unread-count`)
      .subscribe({
        next: (res) => this.unreadCountSignal.set(res.data.count),
        error: () => {},
      });
  }

  getNotifications(
    page = 1,
    unreadOnly = false
  ): Observable<PaginatedResponse<SgaNotification>> {
    const params: Record<string, unknown> = { page, per_page: 25 };
    if (unreadOnly) params['unread_only'] = true;
    return this.http.get<PaginatedResponse<SgaNotification>>(
      `${this.api}/notifications`,
      { params: params as Record<string, string> }
    );
  }

  markAsRead(id: string): Observable<ApiResponse<null>> {
    return this.http
      .put<ApiResponse<null>>(`${this.api}/notifications/${id}/read`, {})
      .pipe(
        tap(() => this.unreadCountSignal.update((c) => Math.max(0, c - 1)))
      );
  }

  markAllAsRead(): Observable<ApiResponse<null>> {
    return this.http
      .post<ApiResponse<null>>(`${this.api}/notifications/read-all`, {})
      .pipe(tap(() => this.unreadCountSignal.set(0)));
  }
}

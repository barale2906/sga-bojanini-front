import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { User, LoginResponse } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = environment.apiUrl;
  private currentUser = signal<User | null>(null);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  // Signals públicos (solo lectura)
  user = this.currentUser.asReadonly();
  isLoggedIn = computed(() => !!this.currentUser());
  userName = computed(() => this.currentUser()?.name ?? '');

  constructor(private http: HttpClient, private router: Router) {
    const saved = localStorage.getItem('sga_user');
    if (saved) {
      try {
        this.currentUser.set(JSON.parse(saved));
        this.startTokenRefresh();
      } catch {
        this.clearSession();
      }
    }
  }

  login(email: string, password: string): Observable<ApiResponse<LoginResponse>> {
    return this.http
      .post<ApiResponse<LoginResponse>>(`${this.api}/auth/login`, {
        email,
        password,
        device_name: 'angular-web',
      })
      .pipe(
        tap((res) => {
          localStorage.setItem('sga_token', res.data.token);
          localStorage.setItem('sga_user', JSON.stringify(res.data.user));
          this.currentUser.set(res.data.user);
          this.startTokenRefresh();
        })
      );
  }

  logout(): void {
    this.http.post(`${this.api}/auth/logout`, {}).subscribe();
    this.clearSession();
  }

  clearSession(): void {
    localStorage.removeItem('sga_token');
    localStorage.removeItem('sga_user');
    this.currentUser.set(null);
    this.stopTokenRefresh();
    this.router.navigate(['/login']);
  }

  getMe(): Observable<ApiResponse<User>> {
    return this.http.get<ApiResponse<User>>(`${this.api}/auth/me`).pipe(
      tap((res) => {
        localStorage.setItem('sga_user', JSON.stringify(res.data));
        this.currentUser.set(res.data);
      })
    );
  }

  refreshToken(): Observable<ApiResponse<{ token: string }>> {
    return this.http
      .post<ApiResponse<{ token: string }>>(`${this.api}/auth/refresh`, {})
      .pipe(
        tap((res) => {
          localStorage.setItem('sga_token', res.data.token);
        })
      );
  }

  changePassword(
    currentPassword: string,
    newPassword: string,
    confirmation: string
  ): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.api}/auth/password`, {
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirmation: confirmation,
    });
  }

  hasPermission(permission: string): boolean {
    return this.currentUser()?.permissions?.includes(permission) ?? false;
  }

  hasRole(role: string): boolean {
    return this.currentUser()?.roles?.some((r) => r.name === role) ?? false;
  }

  hasAnyPermission(permissions: string[]): boolean {
    return permissions.some((p) => this.hasPermission(p));
  }

  getToken(): string | null {
    return localStorage.getItem('sga_token');
  }

  private startTokenRefresh(): void {
    this.stopTokenRefresh();
    this.refreshInterval = setInterval(() => {
      this.refreshToken().subscribe();
    }, 30 * 60 * 1000);
  }

  private stopTokenRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

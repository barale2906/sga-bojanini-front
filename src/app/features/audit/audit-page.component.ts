import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaginationMeta } from '../../core/models/api-response.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { PermissionDirective } from '../../shared/directives/permission.directive';
import { DateFormatPipe } from '../../shared/pipes/date-format.pipe';
import { AuditDetailDialogComponent } from './audit-detail-dialog.component';
import { saveAs } from 'file-saver';

interface AuditLog {
  id: number; user_id: number; user_name: string; action: string;
  auditable_type: string; auditable_id: number; old_values: any; new_values: any;
  ip_address: string; user_agent: string; created_at: string;
}

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTableModule, MatPaginatorModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatTooltipModule, PageHeaderComponent, LoadingSpinnerComponent,
    PermissionDirective, DateFormatPipe,
  ],
  templateUrl: './audit-page.component.html',
  styleUrl: './audit-page.component.scss',
})
export class AuditPageComponent implements OnInit {
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private api = environment.apiUrl;

  logs = signal<AuditLog[]>([]);
  meta = signal<PaginationMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  loading = signal(false);
  exporting = signal(false);

  cols = ['actions', 'user_name', 'action', 'auditable_type', 'auditable_id', 'ip_address', 'created_at'];
  filters = this.fb.group({ action: [''], auditable_type: [''], date_from: [''], date_to: [''] });

  ngOnInit(): void {
    this.load();
    this.filters.get('action')!.valueChanges.subscribe(() => this.load(1));
    this.filters.get('auditable_type')!.valueChanges.subscribe(() => this.load(1));
    this.filters.get('date_from')!.valueChanges.pipe(debounceTime(400)).subscribe(() => this.load(1));
    this.filters.get('date_to')!.valueChanges.pipe(debounceTime(400)).subscribe(() => this.load(1));
  }

  load(page = 1): void {
    this.loading.set(true);
    const { action, auditable_type, date_from, date_to } = this.filters.value;
    let p = new HttpParams().set('per_page', String(this.meta().per_page)).set('page', String(page));
    if (action) p = p.set('action', action);
    if (auditable_type) p = p.set('auditable_type', auditable_type);
    if (date_from) p = p.set('date_from', date_from);
    if (date_to) p = p.set('date_to', date_to);
    this.http.get<any>(`${this.api}/audit-logs`, { params: p }).subscribe({
      next: r => { this.logs.set(r.data?.items ?? []); this.meta.set(r.data?.meta ?? this.meta()); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  viewDetail(log: AuditLog): void {
    this.dialog.open(AuditDetailDialogComponent, { data: log, width: '700px', maxHeight: '90vh' });
  }

  export(format: 'excel' | 'csv'): void {
    this.exporting.set(true);
    const { action, auditable_type, date_from, date_to } = this.filters.value;
    let p = new HttpParams().set('format', format);
    if (action) p = p.set('action', action);
    if (date_from) p = p.set('date_from', date_from);
    if (date_to) p = p.set('date_to', date_to);
    this.http.get(`${this.api}/audit-logs/export`, { params: p, responseType: 'blob' }).subscribe({
      next: blob => {
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, '0');
        const dateStr = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
        saveAs(blob, `auditoria_${dateStr}.${format === 'excel' ? 'xlsx' : 'csv'}`);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  onPage(e: PageEvent): void { this.meta.update(m => ({ ...m, per_page: e.pageSize })); this.load(e.pageIndex + 1); }
  getActionClass(action: string): string { const m: Record<string, string> = { create: 'a-create', update: 'a-update', delete: 'a-delete', access: 'a-access' }; return m[action] || ''; }
}

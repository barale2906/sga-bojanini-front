import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { WarehouseService, Warehouse } from '../warehouse.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionDirective } from '../../../shared/directives/permission.directive';
import { WarehouseDetailFormComponent } from './warehouse-detail-form.component';

type PageView = 'list' | 'form';

@Component({
  selector: 'app-warehouse-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTableModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatTooltipModule,
    PageHeaderComponent, LoadingSpinnerComponent, PermissionDirective,
    WarehouseDetailFormComponent,
  ],
  templateUrl: './warehouse-page.component.html',
  styleUrl: './warehouse-page.component.scss',
})
export class WarehousePageComponent implements OnInit {
  private svc    = inject(WarehouseService);
  private dialog = inject(MatDialog);
  private snack  = inject(MatSnackBar);
  private fb     = inject(FormBuilder);

  warehouses = signal<Warehouse[]>([]);
  loading    = signal(false);

  view               = signal<PageView>('list');
  editingWarehouseId = signal<number | null>(null); // null = create

  whCols    = ['actions', 'name', 'address', 'is_active'];
  whFilters = this.fb.group({ search: [''], is_active: [''] });

  ngOnInit(): void {
    this.loadWarehouses();
    this.whFilters.get('search')!.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => this.loadWarehouses());
    this.whFilters.get('is_active')!.valueChanges
      .subscribe(() => this.loadWarehouses());
  }

  loadWarehouses(): void {
    this.loading.set(true);
    const { search, is_active } = this.whFilters.value;
    this.svc.getWarehouses({ search: search || undefined, is_active: is_active || undefined }).subscribe({
      next: r => { this.warehouses.set(r.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.editingWarehouseId.set(null);
    this.view.set('form');
  }

  openDetail(wh: Warehouse): void {
    this.editingWarehouseId.set(wh.id);
    this.view.set('form');
  }

  onSaved(): void {
    this.view.set('list');
    this.loadWarehouses();
  }

  onBack(): void {
    this.view.set('list');
  }

  deleteWarehouse(wh: Warehouse): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Eliminar almacén', message: `¿Eliminar "${wh.name}" y todas sus zonas y ubicaciones?`, confirmColor: 'warn' },
      width: '420px',
    }).afterClosed().subscribe(ok => {
      if (ok) this.svc.deleteWarehouse(wh.id).subscribe({
        next: () => { this.snack.open('Almacén eliminado', 'OK', { duration: 3000 }); this.loadWarehouses(); },
        error: () => this.snack.open('Error al eliminar el almacén', 'OK', { duration: 3000 }),
      });
    });
  }
}

import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { WarehouseService, Zone, Warehouse } from '../warehouse.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-zone-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatSlideToggleModule, MatProgressSpinnerModule, FormErrorsComponent],
  template: `
    <h2 mat-dialog-title>{{ data.zone ? 'Editar Zona' : 'Nueva Zona' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Almacén *</mat-label>
          <mat-select formControlName="warehouse_id">
            @for (w of data.warehouses; track w.id) { <mat-option [value]="w.id">{{ w.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <div class="two-col">
          <mat-form-field appearance="outline"><mat-label>Nombre *</mat-label><input matInput formControlName="name" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Código *</mat-label><input matInput formControlName="code" placeholder="ZR-01" /></mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Tipo *</mat-label>
          <mat-select formControlName="type">
            <mat-option value="ambient">Ambiente</mat-option>
            <mat-option value="cold">Refrigerado</mat-option>
            <mat-option value="frozen">Congelado</mat-option>
            <mat-option value="controlled">Controlado</mat-option>
          </mat-select>
        </mat-form-field>
        <div class="two-col">
          <mat-form-field appearance="outline"><mat-label>Temp. mín (°C)</mat-label><input matInput type="number" formControlName="temp_min" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Temp. máx (°C)</mat-label><input matInput type="number" formControlName="temp_max" /></mat-form-field>
        </div>
        <div class="two-col">
          <mat-form-field appearance="outline"><mat-label>Humedad mín (%)</mat-label><input matInput type="number" formControlName="humidity_min" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Humedad máx (%)</mat-label><input matInput type="number" formControlName="humidity_max" /></mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="w-full"><mat-label>Descripción</mat-label><textarea matInput formControlName="description" rows="2"></textarea></mat-form-field>
        <mat-slide-toggle formControlName="is_active" color="primary">{{ form.get('is_active')?.value ? 'Activa' : 'Inactiva' }}</mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18"></mat-spinner> } {{ data.zone ? 'Guardar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.dialog-form { display:flex; flex-direction:column; gap:0.25rem; padding:0.5rem 0; } .w-full { width:100%; } .two-col { display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; }'],
})
export class ZoneFormDialogComponent implements OnInit {
  data: { zone: Zone | null; warehouses: Warehouse[] } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ZoneFormDialogComponent>);
  private svc = inject(WarehouseService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);

  form = this.fb.group({
    warehouse_id: [null as number | null, Validators.required],
    name: ['', Validators.required],
    code: ['', Validators.required],
    type: ['ambient', Validators.required],
    temp_min: [null as number | null],
    temp_max: [null as number | null],
    humidity_min: [null as number | null],
    humidity_max: [null as number | null],
    description: [''],
    is_active: [true],
  });

  ngOnInit(): void {
    if (this.data.zone) this.form.patchValue(this.data.zone as any);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const req$ = this.data.zone
      ? this.svc.updateZone(this.data.zone.id, this.form.value as any)
      : this.svc.createZone(this.form.value as any);
    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
      },
    });
  }
}

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
import { WarehouseService, Location, Zone } from '../warehouse.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-location-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatSlideToggleModule, MatProgressSpinnerModule, FormErrorsComponent],
  template: `
    <h2 mat-dialog-title>{{ data.location ? 'Editar Ubicación' : 'Nueva Ubicación' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Zona *</mat-label>
          <mat-select formControlName="zone_id">
            @for (z of data.zones; track z.id) { <mat-option [value]="z.id">{{ z.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <div class="two-col">
          <mat-form-field appearance="outline"><mat-label>Nombre *</mat-label><input matInput formControlName="name" placeholder="Estante A1" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Código *</mat-label><input matInput formControlName="code" placeholder="EA-01" /></mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="w-full"><mat-label>Capacidad</mat-label><input matInput type="number" formControlName="capacity" /></mat-form-field>
        <mat-form-field appearance="outline" class="w-full"><mat-label>Descripción</mat-label><textarea matInput formControlName="description" rows="2"></textarea></mat-form-field>
        <mat-slide-toggle formControlName="is_active" color="primary">{{ form.get('is_active')?.value ? 'Activa' : 'Inactiva' }}</mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18"></mat-spinner> } {{ data.location ? 'Guardar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.dialog-form { display:flex; flex-direction:column; gap:0.25rem; padding:0.5rem 0; } .w-full { width:100%; } .two-col { display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; }'],
})
export class LocationFormDialogComponent implements OnInit {
  data: { location: Location | null; zones: Zone[] } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<LocationFormDialogComponent>);
  private svc = inject(WarehouseService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);

  form = this.fb.group({
    zone_id: [null as number | null, Validators.required],
    name: ['', Validators.required],
    code: ['', Validators.required],
    capacity: [null as number | null],
    description: [''],
    is_active: [true],
  });

  ngOnInit(): void {
    if (this.data.location) this.form.patchValue(this.data.location as any);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const req$ = this.data.location
      ? this.svc.updateLocation(this.data.location.id, this.form.value as any)
      : this.svc.createLocation(this.form.value as any);
    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
      },
    });
  }
}

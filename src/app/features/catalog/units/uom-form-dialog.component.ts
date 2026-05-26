import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CatalogService, UnitOfMeasure } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-uom-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatSlideToggleModule, MatProgressSpinnerModule, FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar Unidad' : 'Nueva Unidad de Medida' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Nombre *</mat-label>
          <input matInput formControlName="name" placeholder="Unidad, Caja, Paquete..." />
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
            <mat-error>El nombre es requerido</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Abreviatura *</mat-label>
          <input matInput formControlName="abbreviation" placeholder="UND, CJ, PQ..." style="text-transform:uppercase" maxlength="10" />
          <mat-hint>Máximo 10 caracteres, debe ser única</mat-hint>
          @if (form.get('abbreviation')?.hasError('required') && form.get('abbreviation')?.touched) {
            <mat-error>La abreviatura es requerida</mat-error>
          }
          @if (fe()['abbreviation']) { <mat-error>{{ fe()['abbreviation'][0] }}</mat-error> }
        </mat-form-field>

        <mat-slide-toggle formControlName="is_base" color="accent" style="margin-top:0.5rem">
          Unidad base del sistema
        </mat-slide-toggle>

        @if (data) {
          <mat-slide-toggle formControlName="is_active" color="primary" style="margin-top:0.75rem">
            {{ form.get('is_active')?.value ? 'Activa' : 'Inactiva' }}
          </mat-slide-toggle>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner> }
        {{ data ? 'Guardar cambios' : 'Crear unidad' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.dialog-form { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem 0; min-width:380px; } .w-full { width:100%; }`],
})
export class UomFormDialogComponent implements OnInit {
  data: UnitOfMeasure | null = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<UomFormDialogComponent>);
  private svc = inject(CatalogService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  fe = signal<Record<string, string[]>>({});

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    abbreviation: ['', [Validators.required, Validators.maxLength(10)]],
    is_base: [false],
    is_active: [true],
  });

  ngOnInit(): void {
    if (this.data) this.form.patchValue(this.data as any);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const req$ = this.data
      ? this.svc.updateUnit(this.data.id, this.form.value as any)
      : this.svc.createUnit(this.form.value as any);

    req$.subscribe({
      next: () => this.ref.close(true),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          this.fe.set(err.error?.errors || {});
          this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
        } else {
          this.errors.set([err.error?.message || 'Error al guardar']);
        }
      },
    });
  }
}

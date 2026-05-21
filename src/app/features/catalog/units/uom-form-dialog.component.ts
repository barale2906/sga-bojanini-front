import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CatalogService, UnitOfMeasure } from '../catalog.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-uom-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatProgressSpinnerModule, FormErrorsComponent],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Editar Unidad' : 'Nueva Unidad de Medida' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="df">
        <mat-form-field appearance="outline" class="w"><mat-label>Nombre *</mat-label><input matInput formControlName="name" placeholder="Unidad" /></mat-form-field>
        <mat-form-field appearance="outline" class="w"><mat-label>Abreviatura *</mat-label><input matInput formControlName="abbreviation" placeholder="und" /></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18"></mat-spinner> } {{ data ? 'Guardar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.df{display:flex;flex-direction:column;gap:0.25rem;padding:0.5rem 0;}.w{width:100%;}'],
})
export class UomFormDialogComponent implements OnInit {
  data: UnitOfMeasure | null = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<UomFormDialogComponent>);
  private svc = inject(CatalogService); private fb = inject(FormBuilder);
  saving = signal(false); errors = signal<string[]>([]);
  form = this.fb.group({ name: ['', Validators.required], abbreviation: ['', Validators.required] });
  ngOnInit(): void { if (this.data) this.form.patchValue(this.data); }
  save(): void {
    if (this.form.invalid || this.saving()) return; this.saving.set(true);
    const req$ = this.data ? this.svc.updateUnit(this.data.id, this.form.value as any) : this.svc.createUnit(this.form.value as any);
    req$.subscribe({ next: () => this.ref.close(true), error: err => { this.saving.set(false); if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]); } });
  }
}

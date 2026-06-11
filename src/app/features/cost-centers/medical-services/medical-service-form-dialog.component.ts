import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MedicalServicesService, MedicalService } from '../../inventory/medical-services.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

export interface MedicalServiceDialogData {
  service: MedicalService | null;
  services: MedicalService[];
  defaultType: 'service' | 'procedure';
}

@Component({
  selector: 'app-medical-service-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatSlideToggleModule, MatProgressSpinnerModule,
    FormErrorsComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.service ? 'Editar' : 'Nuevo' }} {{ form.get('type')?.value === 'service' ? 'Servicio' : 'Procedimiento' }}</h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>
      <form [formGroup]="form" class="dialog-form">

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Tipo *</mat-label>
          <mat-select formControlName="type">
            <mat-option value="service">Servicio</mat-option>
            <mat-option value="procedure">Procedimiento</mat-option>
          </mat-select>
        </mat-form-field>

        @if (form.get('type')?.value === 'procedure') {
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Servicio padre *</mat-label>
            <mat-select formControlName="parent_id">
              @for (svc of data.services; track svc.id) {
                <mat-option [value]="svc.id">{{ svc.code }} — {{ svc.name }}</mat-option>
              }
            </mat-select>
            @if (form.get('parent_id')?.hasError('required') && form.get('parent_id')?.touched) {
              <mat-error>Selecciona el servicio padre</mat-error>
            }
            @if (fe()['parent_id']) { <mat-error>{{ fe()['parent_id'][0] }}</mat-error> }
          </mat-form-field>
        }

        <div class="row">
          <mat-form-field appearance="outline" class="w-third">
            <mat-label>Código *</mat-label>
            <input matInput formControlName="code" maxlength="20" style="text-transform:uppercase" />
            @if (form.get('code')?.hasError('required') && form.get('code')?.touched) {
              <mat-error>Requerido</mat-error>
            }
            @if (fe()['code']) { <mat-error>{{ fe()['code'][0] }}</mat-error> }
          </mat-form-field>

          <mat-form-field appearance="outline" class="w-twothirds">
            <mat-label>Nombre *</mat-label>
            <input matInput formControlName="name" maxlength="100" />
            @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
              <mat-error>Requerido</mat-error>
            }
            @if (fe()['name']) { <mat-error>{{ fe()['name'][0] }}</mat-error> }
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Descripción</mat-label>
          <textarea matInput formControlName="description" rows="2" maxlength="500" placeholder="Opcional"></textarea>
          @if (fe()['description']) { <mat-error>{{ fe()['description'][0] }}</mat-error> }
        </mat-form-field>

        <mat-slide-toggle formControlName="is_active" color="primary">
          {{ form.get('is_active')?.value ? 'Activo' : 'Inactivo' }}
        </mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) { <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner> }
        {{ data.service ? 'Guardar cambios' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem 0; min-width:480px; }
    .w-full { width:100%; }
    .row { display:flex; gap:0.75rem; }
    .w-third { width:100%; flex:1; }
    .w-twothirds { width:100%; flex:2; }
  `],
})
export class MedicalServiceFormDialogComponent implements OnInit {
  data: MedicalServiceDialogData = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MedicalServiceFormDialogComponent>);
  private svc = inject(MedicalServicesService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  errors = signal<string[]>([]);
  fe = signal<Record<string, string[]>>({});

  form = this.fb.group({
    type: ['service' as 'service' | 'procedure', [Validators.required]],
    parent_id: [null as number | null],
    code: ['', [Validators.required, Validators.maxLength(20)]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: [''],
    is_active: [true],
  });

  ngOnInit(): void {
    const service = this.data.service;
    if (service) {
      this.form.patchValue({
        type: service.type,
        parent_id: service.parent_id,
        code: service.code,
        name: service.name,
        description: service.description ?? '',
        is_active: service.is_active,
      });
      this.form.get('type')!.disable();
    } else {
      this.form.get('type')!.setValue(this.data.defaultType);
    }

    this._syncParentValidator(this.form.get('type')!.value!);
    this.form.get('type')!.valueChanges.subscribe(type => this._syncParentValidator(type!));
  }

  private _syncParentValidator(type: 'service' | 'procedure'): void {
    const parentCtrl = this.form.get('parent_id')!;
    if (type === 'procedure') {
      parentCtrl.setValidators([Validators.required]);
    } else {
      parentCtrl.clearValidators();
      parentCtrl.setValue(null);
    }
    parentCtrl.updateValueAndValidity();
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.errors.set([]);
    this.fe.set({});
    this.saving.set(true);

    const v = this.form.getRawValue();
    const payload = {
      type: v.type!,
      parent_id: v.type === 'procedure' ? v.parent_id : null,
      code: v.code!.toUpperCase(),
      name: v.name!,
      description: v.description || null,
      is_active: v.is_active!,
    };

    const req$ = this.data.service
      ? this.svc.updateMedicalService(this.data.service.id, payload)
      : this.svc.createMedicalService(payload);

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

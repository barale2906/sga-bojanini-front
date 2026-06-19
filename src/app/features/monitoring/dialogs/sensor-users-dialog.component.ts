import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { MonitoringService, Sensor } from '../monitoring.service';
import { UserService } from '../../auth/users/user.service';
import { User } from '../../../core/models/user.model';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-sensor-users-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, FormErrorsComponent],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>group</mat-icon>
      Usuarios con acceso — {{ data.sensor.name }}
    </h2>
    <mat-dialog-content>
      <app-form-errors [errors]="errors()"></app-form-errors>

      @if (loading()) {
        <div class="loading-center"><mat-spinner diameter="36"></mat-spinner></div>
      } @else {
        <form [formGroup]="form" class="df">
          <mat-form-field appearance="outline" class="w">
            <mat-label>Usuarios</mat-label>
            <mat-select formControlName="user_ids" multiple>
              @for (user of users(); track user.id) {
                <mat-option [value]="user.id">{{ user.name }} ({{ user.email }})</mat-option>
              }
            </mat-select>
            <mat-hint>Usuarios que tendrán acceso a este equipo de monitoreo</mat-hint>
          </mat-form-field>
        </form>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="loading() || saving()">
        @if (saving()) { <mat-spinner diameter="18"></mat-spinner> } Guardar
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `.df { display:flex; flex-direction:column; gap:0.25rem; padding:0.5rem 0; }
     .w { width:100%; }
     .loading-center { display:flex; justify-content:center; padding:1.5rem; }
     h2 mat-icon { vertical-align:middle; margin-right:0.5rem; }`,
  ],
})
export class SensorUsersDialogComponent implements OnInit {
  data: { sensor: Sensor } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SensorUsersDialogComponent>);
  private fb = inject(FormBuilder);
  private monitoringService = inject(MonitoringService);
  private userService = inject(UserService);

  loading = signal(false);
  saving = signal(false);
  errors = signal<string[]>([]);
  users = signal<User[]>([]);

  private currentUserIds: number[] = [];

  form = this.fb.group({ user_ids: [[] as number[]] });

  ngOnInit(): void {
    this.loading.set(true);
    forkJoin({
      catalog: this.userService.getAll({ per_page: 1000 }),
      assigned: this.monitoringService.getSensorUsers(this.data.sensor.id),
    }).subscribe({
      next: ({ catalog, assigned }) => {
        this.users.set(catalog.data ?? []);
        this.currentUserIds = (assigned.data ?? []).map((u) => u.id);
        this.form.patchValue({ user_ids: this.currentUserIds });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  save(): void {
    if (this.saving()) return;

    const selectedIds = this.form.value.user_ids ?? [];
    const sensorId = this.data.sensor.id;
    const added = selectedIds.filter((id) => !this.currentUserIds.includes(id));
    const removed = this.currentUserIds.filter((id) => !selectedIds.includes(id));
    const affectedIds = [...added, ...removed];

    if (affectedIds.length === 0) {
      this.ref.close(false);
      return;
    }

    this.saving.set(true);
    const requests = affectedIds.map((userId) =>
      this.userService.getSensors(userId).pipe(
        switchMap((res) => {
          const sensorIds = new Set((res.data ?? []).map((s) => s.id));
          if (added.includes(userId)) sensorIds.add(sensorId);
          if (removed.includes(userId)) sensorIds.delete(sensorId);
          return this.userService.assignSensors(userId, Array.from(sensorIds));
        })
      )
    );

    forkJoin(requests).subscribe({
      next: () => this.ref.close(true),
      error: () => {
        this.saving.set(false);
        this.errors.set(['No se pudo actualizar el acceso de uno o más usuarios.']);
      },
    });
  }
}

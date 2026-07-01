import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PurchasingService, ApprovalFlow } from '../purchasing.service';
import { RoleService, Role } from '../../auth/roles/role.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-approval-flow-form-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatCheckboxModule, MatDividerModule, MatTooltipModule, FormErrorsComponent,
  ],
  templateUrl: './approval-flow-form-dialog.component.html',
  styleUrl: './approval-flow-form-dialog.component.scss',
})
export class ApprovalFlowFormDialogComponent implements OnInit {
  data: { flow: ApprovalFlow | null; purchasingSvc: PurchasingService } = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ApprovalFlowFormDialogComponent>);
  private fb = inject(FormBuilder);
  private roleSvc = inject(RoleService);

  saving = signal(false);
  errors = signal<string[]>([]);
  roles = signal<Role[]>([]);

  form = this.fb.group({
    name: [this.data.flow?.name ?? '', [Validators.required, Validators.minLength(3)]],
    is_active: [this.data.flow?.is_active ?? true],
    amount_gte: [this.data.flow?.conditions?.amount_gte ?? null as number | null],
    steps: this.fb.array(
      (this.data.flow?.steps ?? []).map(s => this.buildStep(s.role_id, s.is_required))
    ),
  });

  get stepsArray(): FormArray { return this.form.get('steps') as FormArray; }
  get isEdit(): boolean { return !!this.data.flow; }

  ngOnInit(): void {
    this.roleSvc.getAll().subscribe({ next: r => this.roles.set(r.data ?? []), error: () => {} });
    if (!this.isEdit) this.addStep();
  }

  private buildStep(role_id: number | null = null, is_required = true) {
    return this.fb.group({ role_id: [role_id, Validators.required], is_required: [is_required] });
  }

  addStep(): void { this.stepsArray.push(this.buildStep()); }

  removeStep(i: number): void { this.stepsArray.removeAt(i); }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const val = this.form.value;
    const payload = {
      name: val.name,
      entity_type: 'purchase_order',
      is_active: val.is_active,
      conditions: val.amount_gte != null ? { amount_gte: val.amount_gte } : null,
      steps: (val.steps ?? []).map((s: any, i: number) => ({
        step_order: i + 1,
        role_id: s.role_id,
        is_required: s.is_required,
      })),
    };
    const req$ = this.isEdit
      ? this.data.purchasingSvc.updateApprovalFlow(this.data.flow!.id, payload)
      : this.data.purchasingSvc.createApprovalFlow(payload);
    req$.subscribe({
      next: r => { this.saving.set(false); this.ref.close(r.data); },
      error: err => {
        this.saving.set(false);
        const e = err.error;
        if (e?.errors) this.errors.set(Object.values(e.errors).flat() as string[]);
        else this.errors.set([e?.message || 'Error al guardar el flujo']);
      },
    });
  }
}

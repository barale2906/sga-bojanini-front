import { Component, ViewChild, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { concatMap, from, last } from 'rxjs';
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { SignersFormComponent } from '../../../shared/components/signers-form/signers-form.component';
import { AuthService } from '../../../core/services/auth.service';
import { AssetMaintenanceService } from '../asset-maintenance.service';
import { AssetsService } from '../assets.service';
import { AssetCatalogStore } from '../asset-catalog.store';
import {
  AssetDocumentType, AssetMaintenance, CompleteMaintenancePayload, MaintenanceResult, PerformedByType, toApiDateTime,
} from '../assets.models';
import { signatureErrorMessages } from '../shared/signature-errors';

interface PendingAttachment {
  file: File;
  document_type: AssetDocumentType;
  title: string;
}

/**
 * Registra la ejecución de un mantenimiento. Obligatorio: fecha, quién lo
 * ejecutó (técnico interno o proveedor + técnico externo), actividades y
 * resultado. Los soportes y las firmas son opcionales.
 */
@Component({
  selector: 'app-maintenance-complete-dialog',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatSlideToggleModule, MatProgressSpinnerModule,
    FormErrorsComponent, SignersFormComponent,
  ],
  templateUrl: './maintenance-complete-dialog.component.html',
  styleUrl: './asset-dialogs.scss',
})
export class MaintenanceCompleteDialogComponent {
  maintenance: AssetMaintenance = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<MaintenanceCompleteDialogComponent, AssetMaintenance | null>);
  private svc = inject(AssetMaintenanceService);
  private assetsSvc = inject(AssetsService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  store = inject(AssetCatalogStore);

  @ViewChild(SignersFormComponent) signersForm?: SignersFormComponent;

  readonly today = new Date();
  readonly canUpload = this.auth.hasPermission('activos_documentos.cargar');

  saving = signal(false);
  errors = signal<string[]>([]);
  attachments = signal<PendingAttachment[]>([]);

  form = this.fb.group({
    performed_date: [new Date(), Validators.required],
    performed_time: [this.currentTime(), [Validators.required, Validators.pattern(/^\d{2}:\d{2}$/)]],
    performed_by_type: [(this.maintenance.performed_by_type ?? 'internal') as PerformedByType, Validators.required],
    technician_id: [this.maintenance.technician?.id ?? (this.auth.user()?.id as number | undefined) ?? null],
    supplier_id: [this.maintenance.supplier?.id ?? null as number | null],
    external_technician_name: [''],
    activities_performed: ['', Validators.required],
    findings: [''],
    recommendations: [''],
    result: ['operational' as MaintenanceResult, Validators.required],
    cost: [null as number | null, Validators.min(0)],
    parts: this.fb.array<ReturnType<MaintenanceCompleteDialogComponent['partGroup']>>([]),
    sign: [false],
  });

  constructor() {
    this.store.load().subscribe();
    this.form.controls.performed_by_type.valueChanges.subscribe(() => this.applyPerformerRules());
    this.applyPerformerRules();
  }

  get parts(): FormArray {
    return this.form.controls.parts;
  }

  partGroup() {
    return this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(150)]],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      cost: [null as number | null, Validators.min(0)],
    });
  }

  addPart(): void {
    this.form.controls.parts.push(this.partGroup());
  }

  removePart(index: number): void {
    this.form.controls.parts.removeAt(index);
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.attachments.update(list => [
      ...list,
      ...files.map(file => ({
        file,
        document_type: (file.type.startsWith('image/') ? 'photo' : 'service_report') as AssetDocumentType,
        title: file.name.replace(/\.[^.]+$/, ''),
      })),
    ]);
    input.value = '';
  }

  removeAttachment(index: number): void {
    this.attachments.update(list => list.filter((_, i) => i !== index));
  }

  setAttachmentType(index: number, type: AssetDocumentType): void {
    this.attachments.update(list => list.map((a, i) => (i === index ? { ...a, document_type: type } : a)));
  }

  /** Técnico interno = usuario; externo = proveedor + nombre del técnico (obligatorios). */
  private applyPerformerRules(): void {
    const external = this.form.controls.performed_by_type.value === 'external';
    const c = this.form.controls;
    c.technician_id.setValidators(external ? null : Validators.required);
    c.supplier_id.setValidators(external ? Validators.required : null);
    c.external_technician_name.setValidators(external ? [Validators.required, Validators.maxLength(150)] : null);
    [c.technician_id, c.supplier_id, c.external_technician_name].forEach(ctrl => ctrl.updateValueAndValidity({ emitEvent: false }));
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.errors.set([]);

    const v = this.form.getRawValue();
    const [hours, minutes] = v.performed_time!.split(':').map(Number);
    const performedAt = new Date(v.performed_date!);
    performedAt.setHours(hours, minutes, 0, 0);

    if (performedAt > new Date()) {
      this.errors.set(['La fecha de ejecución no puede ser futura.']);
      return;
    }

    const external = v.performed_by_type === 'external';
    const payload: CompleteMaintenancePayload = {
      performed_at: toApiDateTime(performedAt),
      performed_by_type: v.performed_by_type!,
      technician_id: external ? null : v.technician_id,
      supplier_id: external ? v.supplier_id : null,
      external_technician_name: external ? v.external_technician_name : null,
      activities_performed: v.activities_performed!.trim(),
      findings: v.findings || null,
      recommendations: v.recommendations || null,
      result: v.result!,
      cost: v.cost ?? null,
      parts_replaced: v.parts.map(p => ({ name: p.name!, quantity: Number(p.quantity), cost: p.cost ?? null })),
    };

    if (v.sign) {
      if (!this.signersForm?.ready) return;
      const signed = this.signersForm.collect();
      if (!signed.valid) {
        this.errors.set(signed.errors);
        return;
      }
      Object.assign(payload, signed.payload);
    }

    this.saving.set(true);
    this.svc.complete(this.maintenance.id, payload).subscribe({
      next: res => this.uploadAttachments(res.data),
      error: err => {
        this.saving.set(false);
        if (err.status === 422 || err.status === 429) this.signersForm?.resetPin();
        this.errors.set(signatureErrorMessages(err, 'No fue posible registrar el mantenimiento.'));
      },
    });
  }

  /** Los soportes se cargan después de registrar; si alguno falla, el registro ya quedó guardado. */
  private uploadAttachments(done: AssetMaintenance): void {
    const pending = this.attachments();
    if (!pending.length) {
      this.ref.close(done);
      return;
    }

    from(pending).pipe(
      concatMap(a => this.assetsSvc.uploadDocument(done.asset.id, { ...a, maintenance_id: done.id })),
      last(),
    ).subscribe({
      next: () => this.ref.close(done),
      error: err => {
        this.saving.set(false);
        this.errors.set([
          'El mantenimiento quedó registrado, pero no se pudieron cargar todos los soportes. Cárguelos desde la ficha del activo.',
          err.error?.message ?? '',
        ].filter(Boolean));
        setTimeout(() => this.ref.close(done), 4000);
      },
    });
  }

  private currentTime(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}

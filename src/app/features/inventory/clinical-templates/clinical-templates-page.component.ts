import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { finalize } from 'rxjs';
import {
  MedicalServicesService, ClinicalTemplate, MedicalServiceNode,
} from '../medical-services.service';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';

@Component({
  selector: 'app-clinical-templates-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatProgressSpinnerModule, MatTooltipModule,
    MatSlideToggleModule, MatDividerModule,
    RichTextEditorComponent, FormErrorsComponent,
  ],
  templateUrl: './clinical-templates-page.component.html',
  styleUrl:    './clinical-templates-page.component.scss',
})
export class ClinicalTemplatesPageComponent implements OnInit {
  private medSvc = inject(MedicalServicesService);
  private fb     = inject(FormBuilder);

  templates       = signal<ClinicalTemplate[]>([]);
  servicesTree    = signal<MedicalServiceNode[]>([]);
  loading         = signal(false);
  loadingTree     = signal(false);
  saving          = signal(false);
  deleting        = signal<number | null>(null);
  errors          = signal<string[]>([]);
  successMsg      = signal<string | null>(null);

  editingId       = signal<number | null>(null);
  showForm        = signal(false);

  allServices     = signal<{ id: number; label: string }[]>([]);

  form = this.fb.group({
    medical_service_id: [null as number | null, Validators.required],
    title:              ['', [Validators.required, Validators.maxLength(200)]],
    content:            ['', Validators.required],
    is_active:          [true],
  });

  ngOnInit(): void {
    this._loadTemplates();
    this._loadServicesFlat();
  }

  private _loadTemplates(): void {
    this.loading.set(true);
    this.medSvc.getClinicalTemplates()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({ next: r => this.templates.set(r.data), error: () => {} });
  }

  private _loadServicesFlat(): void {
    this.loadingTree.set(true);
    this.medSvc.getTree(false)
      .pipe(finalize(() => this.loadingTree.set(false)))
      .subscribe({
        next: r => {
          const flat: { id: number; label: string }[] = [];
          for (const svc of r.data) {
            flat.push({ id: svc.id, label: `${svc.code} — ${svc.name} (Servicio)` });
            for (const proc of svc.children ?? []) {
              flat.push({ id: proc.id, label: `  ${proc.code} — ${proc.name} (Procedimiento)` });
            }
          }
          this.allServices.set(flat);
        },
        error: () => {},
      });
  }

  openCreateForm(): void {
    this.editingId.set(null);
    this.form.reset({ is_active: true });
    this.form.get('medical_service_id')!.enable();
    this.errors.set([]);
    this.successMsg.set(null);
    this.showForm.set(true);
  }

  openEditForm(t: ClinicalTemplate): void {
    this.editingId.set(t.id);
    this.form.patchValue({
      medical_service_id: t.medical_service_id,
      title:   t.title,
      content: t.content,
      is_active: t.is_active,
    });
    this.form.get('medical_service_id')!.disable();
    this.errors.set([]);
    this.successMsg.set(null);
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
    this.errors.set([]);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    if (!this._htmlHasText(v.content)) {
      this.errors.set(['El contenido de la plantilla no puede estar vacío.']);
      return;
    }

    this.saving.set(true);
    this.errors.set([]);
    this.successMsg.set(null);

    const id = this.editingId();
    const obs = id
      ? this.medSvc.updateClinicalTemplate(id, { title: v.title!, content: v.content!, is_active: v.is_active ?? true })
      : this.medSvc.createClinicalTemplate({ medical_service_id: v.medical_service_id!, title: v.title!, content: v.content! });

    obs.pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: r => {
          this.successMsg.set(id ? 'Plantilla actualizada.' : 'Plantilla creada exitosamente.');
          this.showForm.set(false);
          this.editingId.set(null);
          this._loadTemplates();
        },
        error: err => {
          if (err.status === 422) this.errors.set(Object.values(err.error?.errors || {}).flat() as string[]);
          else this.errors.set([err.error?.message || 'Error al guardar la plantilla.']);
        },
      });
  }

  delete(t: ClinicalTemplate): void {
    if (!confirm(`¿Eliminar la plantilla "${t.title}"? Esta acción no se puede deshacer.`)) return;
    this.deleting.set(t.id);
    this.medSvc.deleteClinicalTemplate(t.id)
      .pipe(finalize(() => this.deleting.set(null)))
      .subscribe({
        next: () => {
          this.successMsg.set('Plantilla eliminada.');
          this._loadTemplates();
        },
        error: err => this.errors.set([err.error?.message || 'Error al eliminar la plantilla.']),
      });
  }

  _htmlHasText(html: string | null | undefined): boolean {
    if (!html) return false;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent ?? '').trim().length > 0;
  }

  get isEditing(): boolean { return this.editingId() !== null; }
}

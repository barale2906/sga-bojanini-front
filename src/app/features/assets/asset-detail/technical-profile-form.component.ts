import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../../core/services/auth.service';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { AssetsService } from '../assets.service';
import { AssetTechnicalProfile, AssetType } from '../assets.models';

const TEXT_FIELDS = [
  'manufacturer', 'country_of_origin', 'acquisition_mode', 'accessories', 'usage_recommendations',
  'invima_registry', 'risk_class', 'biomedical_class', 'power_source', 'voltage', 'current', 'power', 'frequency',
  'operating_conditions', 'processor', 'ram', 'storage', 'operating_system', 'ip_address', 'mac_address', 'hostname',
] as const;

/**
 * Hoja de vida técnica. Muestra la sección biomédica o de cómputo según el
 * tipo del equipo; especificaciones y licencias son listas dinámicas.
 */
@Component({
  selector: 'app-technical-profile-form',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatSlideToggleModule, FormErrorsComponent,
  ],
  templateUrl: './technical-profile-form.component.html',
  styleUrl: './asset-detail.component.scss',
})
export class TechnicalProfileFormComponent implements OnInit {
  private svc = inject(AssetsService);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);

  @Input({ required: true }) assetId!: number;
  @Input({ required: true }) assetType!: AssetType;
  @Input() readonly = false;

  saving = signal(false);
  errors = signal<string[]>([]);
  updatedAt = signal<string | null>(null);

  form: FormGroup = this.fb.group({
    ...Object.fromEntries(TEXT_FIELDS.map(f => [f, ['']])),
    manufacture_year: [null as number | null, [Validators.min(1900), Validators.max(2100)]],
    useful_life_years: [null as number | null, [Validators.min(1), Validators.max(100)]],
    requires_calibration: [false],
    specs: this.fb.array<FormGroup>([]),
    licenses: this.fb.array<FormGroup>([]),
  });

  get specs(): FormArray<FormGroup> { return this.form.get('specs') as FormArray<FormGroup>; }
  get licenses(): FormArray<FormGroup> { return this.form.get('licenses') as FormArray<FormGroup>; }

  get canEdit(): boolean {
    return !this.readonly && this.auth.hasPermission('activos.editar');
  }

  ngOnInit(): void {
    if (!this.canEdit) this.form.disable();
    this.svc.getTechnicalProfile(this.assetId).subscribe({ next: res => res.data && this.patch(res.data) });
  }

  addSpec(key = '', value = ''): void {
    this.specs.push(this.fb.group({ key: [key, Validators.required], value: [value] }));
    if (!this.canEdit) this.specs.disable();
  }

  addLicense(license: { name?: string; key?: string | null; expires_at?: string | null } = {}): void {
    this.licenses.push(this.fb.group({
      name: [license.name ?? '', Validators.required],
      key: [license.key ?? ''],
      expires_at: [license.expires_at ?? ''],
    }));
    if (!this.canEdit) this.licenses.disable();
  }

  private patch(profile: AssetTechnicalProfile): void {
    this.form.patchValue({
      ...Object.fromEntries(TEXT_FIELDS.map(f => [f, profile[f] ?? ''])),
      manufacture_year: profile.manufacture_year,
      useful_life_years: profile.useful_life_years,
      requires_calibration: profile.requires_calibration,
    });
    Object.entries(profile.technical_specs ?? {}).forEach(([k, v]) => this.addSpec(k, v));
    (profile.licenses ?? []).forEach(l => this.addLicense(l));
    this.updatedAt.set(profile.updated_at ?? null);
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.errors.set([]);

    const v = this.form.getRawValue();
    const payload: Partial<AssetTechnicalProfile> = {
      ...Object.fromEntries(TEXT_FIELDS.map(f => [f, v[f] || null])),
      manufacture_year: v.manufacture_year || null,
      useful_life_years: v.useful_life_years || null,
      requires_calibration: !!v.requires_calibration,
      technical_specs: Object.fromEntries((v.specs as { key: string; value: string }[]).filter(s => s.key).map(s => [s.key, s.value])),
      licenses: (v.licenses as { name: string; key: string; expires_at: string }[])
        .filter(l => l.name)
        .map(l => ({ name: l.name, key: l.key || null, expires_at: l.expires_at || null })),
    };

    this.svc.saveTechnicalProfile(this.assetId, payload).subscribe({
      next: res => {
        this.saving.set(false);
        this.updatedAt.set(res.data.updated_at ?? null);
        this.snack.open('Hoja de vida guardada', 'OK', { duration: 3000 });
      },
      error: err => {
        this.saving.set(false);
        this.errors.set(err.status === 422
          ? Object.values(err.error?.errors ?? {}).flat() as string[]
          : [err.error?.message ?? 'No fue posible guardar la hoja de vida.']);
      },
    });
  }
}

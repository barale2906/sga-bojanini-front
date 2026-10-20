import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { EsDateAdapter, ES_DATE_FORMATS } from '../../../shared/adapters/es-date.adapter';
import { FormErrorsComponent } from '../../../shared/components/form-errors/form-errors.component';
import { SignersFormComponent } from '../../../shared/components/signers-form/signers-form.component';
import { AuthService } from '../../../core/services/auth.service';
import { AssetsService } from '../assets.service';
import { AssetCatalogStore } from '../asset-catalog.store';
import {
  Asset, AssetStatus, AssetTransfer, AssetTransferPayload, resolveTransferType, toApiDate,
} from '../assets.models';
import { SitePlacePickerComponent } from '../shared/site-place-picker.component';
import { signatureErrorMessages } from '../shared/signature-errors';

type RequestableType = AssetTransferPayload['type'];

/**
 * Registra un traslado. La firma es obligatoria solo si el activo sale del
 * edificio (otra sede, reparación externa, préstamo o baja): puede firmarse
 * en el momento o dejarse pendiente. En traslados internos y retornos la
 * firma es opcional.
 */
@Component({
  selector: 'app-asset-transfer-dialog',
  standalone: true,
  providers: [
    { provide: DateAdapter, useClass: EsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_DATE_FORMATS },
  ],
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatSlideToggleModule, MatProgressSpinnerModule,
    FormErrorsComponent, SignersFormComponent, SitePlacePickerComponent,
  ],
  templateUrl: './asset-transfer-dialog.component.html',
  styleUrl: './asset-dialogs.scss',
})
export class AssetTransferDialogComponent implements OnInit {
  asset: Asset = inject(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AssetTransferDialogComponent, AssetTransfer | null>);
  private svc = inject(AssetsService);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  store = inject(AssetCatalogStore);

  @ViewChild(SignersFormComponent) signersForm?: SignersFormComponent;

  readonly today = new Date();
  saving = signal(false);
  errors = signal<string[]>([]);

  form = this.fb.group({
    type: [(this.asset.location.is_off_premises ? 'return' : 'relocation') as RequestableType, Validators.required],
    to_place_id: [null as number | null],
    to_responsible_id: [null as number | null],
    external_destination: [''],
    supplier_id: [null as number | null],
    expected_return_date: [null as Date | null],
    resulting_status: ['operational' as AssetStatus | null],
    reason: [''],
    sign_now: [false],
  });

  private type = toSignal(this.form.controls.type.valueChanges, { initialValue: this.form.controls.type.value });
  private targetPlace = toSignal(this.form.controls.to_place_id.valueChanges, { initialValue: null as number | null });

  /** Tipos disponibles según dónde está el activo y los permisos del usuario. */
  readonly types = computed(() => {
    const all = this.store.catalogs()?.transfer_types ?? [];
    const offPremises = this.asset.location.is_off_premises;
    const canRetire = this.auth.hasPermission('activos.dar_baja');

    return all.filter(t => {
      if (t.value === 'retirement') return canRetire;
      if (t.value === 'return') return offPremises;
      return !offPremises;
    });
  });

  /** Tipo real (relocation entre sedes = site_transfer) y si exige firma. */
  readonly resolved = computed(() => resolveTransferType(
    this.type() ?? 'relocation',
    this.asset.location.site_id,
    this.store.siteOfPlace(this.targetPlace()),
  ));

  readonly needsPlace = computed(() => this.type() === 'relocation' || this.type() === 'return');
  readonly goesOut = computed(() => ['external_repair', 'loan', 'retirement'].includes(this.type() ?? ''));

  ngOnInit(): void {
    this.store.load().subscribe();
    this.form.controls.type.valueChanges.subscribe(() => this.applyTypeRules());
    this.form.controls.to_place_id.valueChanges.subscribe(() => this.syncSignNow());
    this.applyTypeRules();
  }

  /** Por defecto se firma de una vez cuando la firma es obligatoria. */
  private syncSignNow(): void {
    this.form.controls.sign_now.setValue(this.resolved().requiresSignature, { emitEvent: false });
  }

  /** Obligatoriedad de campos por tipo (espejo de las reglas del backend). */
  private applyTypeRules(): void {
    const type = this.form.controls.type.value;
    const c = this.form.controls;

    c.external_destination.setValidators(type === 'external_repair' || type === 'loan' ? [Validators.required, Validators.maxLength(200)] : [Validators.maxLength(200)]);
    c.reason.setValidators(type === 'retirement' ? [Validators.required, Validators.maxLength(1000)] : [Validators.maxLength(1000)]);
    c.to_place_id.setValidators(type === 'return' ? [Validators.required] : []);

    Object.values(c).forEach(control => control.updateValueAndValidity({ emitEvent: false }));
    this.syncSignNow();
  }

  canSubmit(): boolean {
    if (this.form.invalid || this.saving()) return false;
    const v = this.form.value;
    if (v.type === 'relocation' && !v.to_place_id && !v.to_responsible_id) return false;
    return true;
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.errors.set([]);

    const v = this.form.getRawValue();
    const payload: AssetTransferPayload = {
      type: v.type!,
      to_place_id: this.needsPlace() ? v.to_place_id : null,
      to_responsible_id: v.type === 'relocation' || v.type === 'return' ? v.to_responsible_id : null,
      external_destination: this.goesOut() ? (v.external_destination || null) : null,
      supplier_id: v.type === 'external_repair' ? v.supplier_id : null,
      expected_return_date: v.type === 'external_repair' || v.type === 'loan' ? toApiDate(v.expected_return_date) : null,
      resulting_status: v.type === 'return' ? v.resulting_status : null,
      reason: v.reason || null,
    };

    if (v.sign_now) {
      if (!this.signersForm?.ready) return;
      const signed = this.signersForm.collect();
      if (!signed.valid) {
        this.errors.set(signed.errors);
        return;
      }
      Object.assign(payload, signed.payload);
    }

    this.saving.set(true);
    this.svc.requestTransfer(this.asset.id, payload).subscribe({
      next: res => this.ref.close(res.data),
      error: err => {
        this.saving.set(false);
        if (err.status === 422 && err.error?.errors?.['received_by.pin']) this.signersForm?.resetPin();
        if (err.status === 429) this.signersForm?.resetPin();
        this.errors.set(signatureErrorMessages(err, 'No fue posible registrar el traslado.'));
      },
    });
  }
}

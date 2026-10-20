import { SignersFormPayload } from '../../shared/components/signers-form/signers-form.component';

/**
 * Modelos del módulo de Activos (equipos biomédicos, de cómputo y bienes generales).
 * Contrato de API: backend `docs/frontend-activos.md`.
 */

export type AssetType = 'biomedical' | 'computing' | 'general';
export type AssetStatus = 'operational' | 'maintenance' | 'out_of_service' | 'available' | 'retired';
export type AssetTransferType = 'relocation' | 'site_transfer' | 'external_repair' | 'loan' | 'return' | 'retirement';
export type AssetTransferStatus = 'pending_signature' | 'confirmed' | 'cancelled';
export type MaintenanceType = 'preventive' | 'calibration' | 'metrological_verification' | 'inspection' | 'corrective';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type MaintenanceResult = 'operational' | 'operational_with_restrictions' | 'out_of_service';
export type PerformedByType = 'internal' | 'external';
export type FrequencyUnit = 'days' | 'months';
export type AssetDocumentType =
  | 'manual' | 'invoice' | 'warranty' | 'invima' | 'calibration_certificate'
  | 'service_report' | 'photo' | 'protocol' | 'other';

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

export interface UserRef {
  id: number;
  name: string;
}

// ── Catálogos ───────────────────────────────────────────────────────────────

export interface AssetCategory {
  id: number;
  code: string;
  name: string;
  asset_type: AssetType;
  asset_type_label: string;
  requires_maintenance: boolean;
  description: string | null;
  is_active: boolean;
}

export interface AssetPlace {
  id: number;
  site_id: number;
  name: string;
  is_active: boolean;
  assets_count?: number;
}

export interface AssetSite {
  id: number;
  name: string;
  address: string | null;
  is_active: boolean;
  places?: AssetPlace[];
}

export interface AssetFilterCatalogs {
  categories: { id: number; code: string; name: string; asset_type: AssetType; requires_maintenance: boolean }[];
  sites: { id: number; name: string; places: { id: number; name: string }[] }[];
  /** Usuarios activos (responsables y técnicos internos). */
  users: UserRef[];
  suppliers: { id: number; name: string; tax_id: string | null }[];
  asset_types: Option<AssetType>[];
  statuses: Option<AssetStatus>[];
  settable_statuses: Option<AssetStatus>[];
  transfer_types: (Option<AssetTransferType> & { requires_signature: boolean })[];
  maintenance_types: Option<MaintenanceType>[];
  plannable_types: Option<MaintenanceType>[];
  maintenance_status: Option<MaintenanceStatus>[];
  maintenance_results: Option<MaintenanceResult>[];
  document_types: Option<AssetDocumentType>[];
}

// ── Activo ──────────────────────────────────────────────────────────────────

export interface AssetLocation {
  is_off_premises: boolean;
  off_premises_location: string | null;
  place_id: number | null;
  place_name: string | null;
  site_id: number | null;
  site_name: string | null;
}

export interface AssetTechnicalProfile {
  asset_id?: number;
  manufacturer: string | null;
  country_of_origin: string | null;
  manufacture_year: number | null;
  useful_life_years: number | null;
  acquisition_mode: string | null;
  technical_specs: Record<string, string> | null;
  accessories: string | null;
  usage_recommendations: string | null;
  invima_registry: string | null;
  risk_class: string | null;
  biomedical_class: string | null;
  power_source: string | null;
  voltage: string | null;
  current: string | null;
  power: string | null;
  frequency: string | null;
  requires_calibration: boolean;
  operating_conditions: string | null;
  processor: string | null;
  ram: string | null;
  storage: string | null;
  operating_system: string | null;
  ip_address: string | null;
  mac_address: string | null;
  hostname: string | null;
  licenses: { name: string; key?: string | null; expires_at?: string | null }[] | null;
  updated_at?: string | null;
}

export interface Asset {
  id: number;
  code: string;
  name: string;
  description: string | null;
  category: { id: number; code: string; name: string } | null;
  asset_type: AssetType | null;
  asset_type_label: string | null;
  requires_maintenance: boolean | null;
  status: AssetStatus;
  status_label: string;
  location: AssetLocation;
  responsible: UserRef | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  acquisition_date: string | null;
  acquisition_value: string | null;
  supplier: { id: number; name: string; tax_id: string | null } | null;
  supplier_id: number | null;
  invoice_number: string | null;
  warranty_until: string | null;
  retired_at: string | null;
  retirement_reason: string | null;
  notes: string | null;
  next_maintenance: {
    id: number; type: MaintenanceType; type_label: string; status: MaintenanceStatus;
    scheduled_date: string; is_overdue: boolean;
  } | null;
  pending_transfer: { id: number; type: AssetTransferType; type_label: string } | null;
  technical_profile: AssetTechnicalProfile | null;
  counts?: { comments: number; documents: number; maintenance_plans: number };
  created_by: UserRef | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AssetFilters {
  search?: string;
  category_id?: number | null;
  asset_type?: AssetType | '';
  site_id?: number | null;
  place_id?: number | null;
  status?: AssetStatus | '';
  responsible_id?: number | null;
  is_off_premises?: boolean | null;
  include_retired?: boolean;
  warranty_expiring_days?: number | null;
  maintenance_overdue?: boolean;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface AssetPayload {
  name: string;
  category_id: number;
  place_id?: number;
  responsible_id?: number | null;
  status?: AssetStatus | null;
  comment?: string | null;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  acquisition_date?: string | null;
  acquisition_value?: number | null;
  supplier_id?: number | null;
  invoice_number?: string | null;
  warranty_until?: string | null;
  notes?: string | null;
}

export interface AssetStatistics {
  total: number;
  by_status: Record<AssetStatus, number>;
  by_type: Partial<Record<AssetType, number>>;
  by_site: { site_id: number | null; site: string; total: number }[];
  off_premises: number;
  total_value: number;
  pending_transfers: number;
  maintenance: { overdue: number; upcoming: number; in_progress: number };
}

export interface AssetComment {
  id: number;
  comment: string;
  user: UserRef | null;
  created_at: string;
}

export interface AssetLocationSegment {
  id: number;
  place_id: number | null;
  location: string;
  is_off_premises: boolean;
  from_date: string;
  to_date: string | null;
  is_current: boolean;
  transfer_id: number | null;
  transfer_type: AssetTransferType | null;
  transfer_label: string | null;
  assigned_by: UserRef | null;
}

export interface AssetMovement {
  id: number;
  type: string;
  type_label: string;
  from_status: AssetStatus | null;
  from_status_label: string | null;
  to_status: AssetStatus | null;
  to_status_label: string | null;
  description: string | null;
  transfer_id: number | null;
  maintenance_id: number | null;
  user: UserRef | null;
  created_at: string;
}

// ── Firmas (misma metodología que inventario) ───────────────────────────────

/** `delivered_by` se omite para usar la firma registrada de la sesión. */
export type SignersPayload = SignersFormPayload;

export interface AssetSignature {
  role: 'delivered_by' | 'received_by';
  method: 'stored' | 'pin' | 'pad';
  signer_name: string;
  signer_document: string;
  signed_at: string;
}

// ── Traslados ───────────────────────────────────────────────────────────────

export interface AssetTransfer {
  id: number;
  asset: { id: number; code?: string; name?: string };
  type: AssetTransferType;
  type_label: string;
  status: AssetTransferStatus;
  status_label: string;
  requires_signature: boolean;
  from: string | null;
  to: string | null;
  from_place_id: number | null;
  to_place_id: number | null;
  external_destination: string | null;
  supplier: { id: number; name: string } | null;
  from_responsible: UserRef | null;
  to_responsible: UserRef | null;
  expected_return_date: string | null;
  resulting_status: AssetStatus | null;
  reason: string | null;
  requested_by: UserRef | null;
  confirmed_at: string | null;
  cancel_reason: string | null;
  signatures: AssetSignature[];
  created_at: string;
}

export interface AssetTransferPayload extends Partial<SignersPayload> {
  type: Exclude<AssetTransferType, 'site_transfer'>;
  to_place_id?: number | null;
  to_responsible_id?: number | null;
  external_destination?: string | null;
  supplier_id?: number | null;
  expected_return_date?: string | null;
  resulting_status?: AssetStatus | null;
  reason?: string | null;
}

// ── Mantenimiento ───────────────────────────────────────────────────────────

export interface MaintenancePlan {
  id: number;
  asset_id: number;
  maintenance_type: MaintenanceType;
  maintenance_type_label: string;
  frequency_value: number;
  frequency_unit: FrequencyUnit;
  frequency_label: string;
  start_date: string;
  performed_by_type: PerformedByType;
  performed_by_type_label: string;
  technician: UserRef | null;
  supplier: { id: number; name: string } | null;
  notes: string | null;
  is_active: boolean;
  next_date: string | null;
}

export interface MaintenancePlanPayload {
  maintenance_type: MaintenanceType;
  frequency_value: number;
  frequency_unit: FrequencyUnit;
  start_date: string;
  performed_by_type: PerformedByType;
  technician_id?: number | null;
  supplier_id?: number | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface MaintenancePart {
  name: string;
  quantity: number;
  cost?: number | null;
}

export interface AssetMaintenance {
  id: number;
  asset: { id: number; code?: string; name?: string; asset_type?: AssetType | null; location?: string | null };
  plan_id: number | null;
  maintenance_type: MaintenanceType;
  maintenance_type_label: string;
  status: MaintenanceStatus;
  status_label: string;
  is_overdue: boolean;
  scheduled_date: string;
  started_at: string | null;
  performed_at: string | null;
  performed_by_type: PerformedByType | null;
  performed_by_type_label: string | null;
  technician: UserRef | null;
  supplier: { id: number; name: string } | null;
  external_technician_name: string | null;
  reported_failure: string | null;
  activities_performed: string | null;
  findings: string | null;
  recommendations: string | null;
  parts_replaced: MaintenancePart[];
  cost: string | null;
  result: MaintenanceResult | null;
  result_label: string | null;
  registered_by: UserRef | null;
  cancel_reason: string | null;
  documents_count?: number;
  documents?: AssetDocument[];
  signatures?: AssetSignature[];
  created_at: string;
}

export interface MaintenanceFilters {
  from?: string;
  to?: string;
  status?: MaintenanceStatus | '';
  maintenance_type?: MaintenanceType | '';
  asset_id?: number | null;
  site_id?: number | null;
  asset_type?: AssetType | '';
  overdue?: boolean;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface ScheduleMaintenancePayload {
  maintenance_type: MaintenanceType;
  scheduled_date: string;
  reported_failure?: string | null;
  performed_by_type?: PerformedByType | null;
  technician_id?: number | null;
  supplier_id?: number | null;
}

export interface CompleteMaintenancePayload extends Partial<SignersPayload> {
  performed_at: string;
  performed_by_type: PerformedByType;
  technician_id?: number | null;
  supplier_id?: number | null;
  external_technician_name?: string | null;
  activities_performed: string;
  findings?: string | null;
  recommendations?: string | null;
  result: MaintenanceResult;
  parts_replaced?: MaintenancePart[];
  cost?: number | null;
}

// ── Documentos ──────────────────────────────────────────────────────────────

export interface AssetDocument {
  id: number;
  asset_id: number;
  maintenance_id: number | null;
  document_type: AssetDocumentType;
  document_type_label: string;
  title: string;
  original_name: string;
  mime_type: string;
  size: number;
  issued_at: string | null;
  expires_at: string | null;
  uploaded_by: UserRef | null;
  created_at: string;
}

export interface AssetDocumentUpload {
  file: File;
  document_type: AssetDocumentType;
  title: string;
  maintenance_id?: number | null;
  issued_at?: string | null;
  expires_at?: string | null;
}

// ── Importación ─────────────────────────────────────────────────────────────

export interface ImportRowError {
  sheet: string;
  row: number;
  errors: Record<string, string[]>;
}

export interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: ImportRowError[];
}

export interface AssetImportResult {
  total: number;
  created: number;
  failed: number;
  errors: ImportRowError[];
  related_catalogs: { categories: ImportSummary; places: ImportSummary };
  technical_profiles: ImportSummary;
}

// ── Presentación ────────────────────────────────────────────────────────────

export type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';

/**
 * Color del chip de estado del activo. Se indexa por `string` porque en las
 * plantillas de `mat-table` las filas llegan sin tipo.
 */
export const ASSET_STATUS_TONE: Readonly<Record<string, StatusTone>> = {
  operational: 'ok',
  maintenance: 'warn',
  out_of_service: 'bad',
  available: 'info',
  retired: 'muted',
} satisfies Record<AssetStatus, StatusTone>;

export const MAINTENANCE_STATUS_TONE: Readonly<Record<string, StatusTone>> = {
  scheduled: 'info',
  in_progress: 'warn',
  completed: 'ok',
  cancelled: 'muted',
} satisfies Record<MaintenanceStatus, StatusTone>;

/** Tipos de traslado que sacan el activo del edificio y exigen firma. */
export const SIGNATURE_REQUIRED_TYPES: AssetTransferType[] = ['site_transfer', 'external_repair', 'loan', 'retirement'];

/** Fecha local `YYYY-MM-DD` (sin desfase de zona horaria). */
export function toApiDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date.substring(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Fecha y hora local `YYYY-MM-DD HH:mm:ss`. */
export function toApiDateTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${toApiDate(date)} ${h}:${min}:00`;
}

/** Quita claves vacías ('' / null / undefined) para enviar como query params. */
export function compactParams(filters: object): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === '' || value === null || value === undefined || value === false) continue;
    params[key] = value === true ? '1' : String(value);
  }
  return params;
}

/** Determina el tipo real del traslado y si exige firma (relocation entre sedes = site_transfer). */
export function resolveTransferType(
  requested: AssetTransferPayload['type'],
  currentSiteId: number | null,
  targetSiteId: number | null,
): { type: AssetTransferType; requiresSignature: boolean } {
  const type: AssetTransferType =
    requested === 'relocation' && currentSiteId !== null && targetSiteId !== null && currentSiteId !== targetSiteId
      ? 'site_transfer'
      : requested;

  return { type, requiresSignature: SIGNATURE_REQUIRED_TYPES.includes(type) };
}

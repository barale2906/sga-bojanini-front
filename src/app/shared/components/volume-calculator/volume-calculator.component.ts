import { Component, forwardRef, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

/**
 * Calculadora de volumen reutilizable (Alto × Ancho × Largo = cm³).
 *
 * Implementa ControlValueAccessor → usar directamente como:
 *   <app-volume-calculator formControlName="volume_cm3" />
 *
 * El valor emitido al formulario es el volumen en cm³.
 * Si las dims están incompletas el formulario conserva su último valor.
 */
@Component({
  selector: 'app-volume-calculator',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => VolumeCalculatorComponent),
      multi: true,
    },
  ],
  template: `
    <div class="vc-wrap">

      <!-- Título -->
      <div class="vc-head">
        <mat-icon>straighten</mat-icon>
        <span>Volumen por unidad</span>
        <span class="vc-sub">(cm³)</span>
      </div>

      <!-- Fila Alto -->
      <div class="vc-row">
        <span class="vc-lbl">Alto</span>
        <input class="vc-in" type="number" min="0" step="0.1" placeholder="—"
               [value]="altoStr()"
               (input)="onInput('alto', $event)"
               (blur)="onTouched()"
               [disabled]="_disabled()" />
        <span class="vc-unit">cm</span>
      </div>

      <!-- Fila Ancho -->
      <div class="vc-row">
        <span class="vc-lbl">Ancho</span>
        <input class="vc-in" type="number" min="0" step="0.1" placeholder="—"
               [value]="anchoStr()"
               (input)="onInput('ancho', $event)"
               (blur)="onTouched()"
               [disabled]="_disabled()" />
        <span class="vc-unit">cm</span>
      </div>

      <!-- Fila Largo -->
      <div class="vc-row">
        <span class="vc-lbl">Largo</span>
        <input class="vc-in" type="number" min="0" step="0.1" placeholder="—"
               [value]="largoStr()"
               (input)="onInput('largo', $event)"
               (blur)="onTouched()"
               [disabled]="_disabled()" />
        <span class="vc-unit">cm</span>
      </div>

      <!-- Separador -->
      <div class="vc-sep"></div>

      <!-- Resultado — campo que refleja lo que se guarda en el formulario -->
      <div class="vc-row vc-row--result">
        <span class="vc-lbl vc-lbl--eq">=</span>
        <input class="vc-in vc-in--result" type="text" readonly
               [value]="displayValue()"
               placeholder="—"
               [class.vc-in--ok]="effectiveValue() != null"
               [class.vc-in--pending]="anyFilled() && !allFilled()" />
        <span class="vc-unit">cm³</span>
        @if (anyFilled()) {
          <button type="button" class="vc-btn-clear"
                  (click)="clearDims()"
                  title="Limpiar dimensiones">✕</button>
        }
      </div>

      <!-- Pista contextual -->
      <div class="vc-hint">
        @if (!anyFilled() && effectiveValue() == null) { Opcional · deja vacío si no aplica }
        @if (!anyFilled() && effectiveValue() != null) { Valor guardado · ingresa las 3 dims para recalcular }
        @if (anyFilled() && !allFilled()) { Completa las 3 dimensiones }
        @if (allFilled()) { Alto × Ancho × Largo }
      </div>

    </div>
  `,
  styles: [`
    /* ── Contenedor ──────────────────────────────────────────────── */
    .vc-wrap {
      background: #e0e0e0;          /* gris claro ~75% blanco */
      border: 1px solid #c8c8c8;
      border-radius: 8px;
      padding: 0.55rem 0.7rem 0.45rem;
      display: flex;
      flex-direction: column;
      gap: 0.28rem;
    }

    /* ── Encabezado ──────────────────────────────────────────────── */
    .vc-head {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      margin-bottom: 0.18rem;

      mat-icon {
        font-size: 0.95rem;
        height: 0.95rem;
        width: 0.95rem;
        color: #555;
        flex-shrink: 0;
      }

      span:first-of-type {
        font-size: 0.72rem;
        font-weight: 700;
        color: #444;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
    }

    .vc-sub {
      font-size: 0.7rem;
      color: #888;
      font-weight: 400 !important;
      text-transform: none !important;
      letter-spacing: 0 !important;
    }

    /* ── Filas de dimensión ──────────────────────────────────────── */
    .vc-row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .vc-lbl {
      font-size: 0.72rem;
      color: #666;
      min-width: 36px;
      text-align: right;
      flex-shrink: 0;
    }

    .vc-lbl--eq {
      font-size: 1rem;
      font-weight: 700;
      color: #444;
    }

    /* Input angosto — suficiente para 3 dígitos + decimales */
    .vc-in {
      width: 68px;
      border: 1px solid #b0b0b0;
      border-radius: 5px;
      padding: 0.22rem 0.4rem;
      font-size: 0.82rem;
      text-align: right;
      background: #fff;
      color: #2d3748;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      flex-shrink: 0;

      /* ocultar flechas de tipo number */
      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      -moz-appearance: textfield;

      &:focus {
        border-color: #3182ce;
        box-shadow: 0 0 0 2px rgba(49, 130, 206, 0.22);
      }

      &:disabled {
        background: #f0f0f0;
        color: #aaa;
        cursor: not-allowed;
      }
    }

    /* Campo resultado */
    .vc-in--result {
      width: 90px;
      background: #f0f0f0;
      border-color: #c0c0c0;
      cursor: default;
      font-weight: 600;
      color: #888;
    }

    .vc-in--ok {
      background: #d4edda !important;
      border-color: #82c88e !important;
      color: #1a5c2a !important;
    }

    .vc-in--pending {
      background: #fff8e1 !important;
      border-color: #f6cc5c !important;
      color: #7a5800 !important;
    }

    .vc-unit {
      font-size: 0.7rem;
      color: #888;
      flex-shrink: 0;
    }

    /* ── Botón limpiar ───────────────────────────────────────────── */
    .vc-btn-clear {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 0.65rem;
      color: #999;
      padding: 0.1rem 0.25rem;
      border-radius: 3px;
      line-height: 1;
      transition: color 0.12s, background 0.12s;
      flex-shrink: 0;

      &:hover {
        color: #c53030;
        background: #fed7d7;
      }
    }

    /* ── Separador ───────────────────────────────────────────────── */
    .vc-sep {
      height: 1px;
      background: #c0c0c0;
      margin: 0.15rem 0;
    }

    /* ── Pista de ayuda ──────────────────────────────────────────── */
    .vc-hint {
      font-size: 0.67rem;
      color: #999;
      min-height: 0.85rem;
    }
  `],
})
export class VolumeCalculatorComponent implements ControlValueAccessor {

  // ── Dimensiones internas ─────────────────────────────────────────────────
  private _alto  = signal<number | null>(null);
  private _ancho = signal<number | null>(null);
  private _largo = signal<number | null>(null);

  /** Valor que llegó vía writeValue (modo edición) */
  _storedValue = signal<number | null>(null);

  _disabled = signal(false);

  // ── Computed ─────────────────────────────────────────────────────────────
  anyFilled = computed(() =>
    this._alto() != null || this._ancho() != null || this._largo() != null
  );

  allFilled = computed(() =>
    this._alto()  != null && this._alto()!  > 0 &&
    this._ancho() != null && this._ancho()! > 0 &&
    this._largo() != null && this._largo()! > 0
  );

  volume = computed<number | null>(() => {
    if (!this.allFilled()) return null;
    const v = this._alto()! * this._ancho()! * this._largo()!;
    return Math.round(v * 100) / 100;
  });

  /** Valor efectivo que se muestra y se guarda: dims calculado ó stored */
  effectiveValue = computed<number | null>(() =>
    this.volume() ?? this._storedValue()
  );

  /** Texto formateado para el campo de resultado */
  displayValue = computed<string>(() => {
    const v = this.effectiveValue();
    if (v == null) return '';
    return v.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  });

  altoStr  = computed(() => this._alto()  != null ? String(this._alto())  : '');
  anchoStr = computed(() => this._ancho() != null ? String(this._ancho()) : '');
  largoStr = computed(() => this._largo() != null ? String(this._largo()) : '');

  // ── CVA ──────────────────────────────────────────────────────────────────
  private _onChange: (v: number | null) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(v: number | null): void {
    this._storedValue.set(v ?? null);
    this._alto.set(null);
    this._ancho.set(null);
    this._largo.set(null);
  }

  registerOnChange(fn: (v: number | null) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this._disabled.set(d); }

  // ── Handlers ─────────────────────────────────────────────────────────────
  onInput(dim: 'alto' | 'ancho' | 'largo', event: Event): void {
    const raw    = (event.target as HTMLInputElement).value;
    const parsed = raw.trim() === '' ? null : parseFloat(raw);
    const val    = parsed === null || isNaN(parsed) ? null : parsed;

    if (dim === 'alto')  this._alto.set(val);
    if (dim === 'ancho') this._ancho.set(val);
    if (dim === 'largo') this._largo.set(val);

    if (this.allFilled()) {
      // Todas completas → emitir volumen calculado
      this._onChange(this.volume());
    } else if (!this.anyFilled()) {
      // Todo vacío → restaurar valor guardado
      this._onChange(this._storedValue());
    }
    // Fill parcial: no emitir; el formulario conserva su último valor
  }

  clearDims(): void {
    this._alto.set(null);
    this._ancho.set(null);
    this._largo.set(null);
    this.onTouched();
    this._onChange(this._storedValue());
  }
}

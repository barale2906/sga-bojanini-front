import {
  Component, Input, forwardRef, ChangeDetectionStrategy, signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { QuillModule } from 'ngx-quill';

const TOOLBAR = [
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['clean'],
];

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, QuillModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => RichTextEditorComponent),
    multi: true,
  }],
  templateUrl: './rich-text-editor.component.html',
  styleUrl:    './rich-text-editor.component.scss',
})
export class RichTextEditorComponent implements ControlValueAccessor {
  @Input() placeholder = 'Escriba aquí...';
  @Input() label       = '';
  @Input() required    = false;
  @Input() minHeight   = '160px';

  readonly modules = { toolbar: TOOLBAR };

  content    = signal<string>('');
  isDisabled = signal(false);
  isFocused  = signal(false);

  private _onChange: (v: string) => void = () => {};
  private _onTouched: () => void         = () => {};

  writeValue(value: string | null): void {
    this.content.set(value ?? '');
  }

  registerOnChange(fn: (v: string) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void          { this._onTouched = fn; }
  setDisabledState(disabled: boolean): void        { this.isDisabled.set(disabled); }

  onContentChange(html: string): void {
    const clean = html === '<p><br></p>' ? '' : (html ?? '');
    this._onChange(clean);
  }

  onFocus(): void    { this.isFocused.set(true); }
  onBlur(): void     { this.isFocused.set(false); this._onTouched(); }
}

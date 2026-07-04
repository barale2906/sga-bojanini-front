import { Component, ElementRef, ViewChild, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-signature-capture-pad',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './signature-capture-pad.component.html',
  styleUrl: './signature-capture-pad.component.scss',
})
export class SignatureCapturePadComponent {
  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  changed = output<void>();

  private drawing = false;

  private get ctx(): CanvasRenderingContext2D {
    return this.canvasRef.nativeElement.getContext('2d')!;
  }

  onPointerDown(e: PointerEvent): void {
    this.drawing = true;
    const { x, y } = this._offset(e);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.drawing) return;
    const ctx = this.ctx;
    const { x, y } = this._offset(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
  }

  onPointerUp(): void {
    if (this.drawing) { this.drawing = false; this.changed.emit(); }
  }

  onPointerLeave(): void { this.drawing = false; }

  clear(): void {
    const c = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.changed.emit();
  }

  getBase64(): string {
    return this.canvasRef.nativeElement.toDataURL('image/png');
  }

  isEmpty(): boolean {
    const c = this.canvasRef.nativeElement;
    const pixels = this.ctx.getImageData(0, 0, c.width, c.height).data;
    return !pixels.some(v => v !== 0);
  }

  private _offset(e: PointerEvent): { x: number; y: number } {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const scaleX = (e.target as HTMLCanvasElement).width  / rect.width;
    const scaleY = (e.target as HTMLCanvasElement).height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }
}

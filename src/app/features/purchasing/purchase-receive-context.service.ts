import { Injectable } from '@angular/core';
import { PurchaseOrder } from './purchasing.service';

@Injectable({ providedIn: 'root' })
export class PurchaseReceiveContextService {
  private _order: PurchaseOrder | null = null;

  setOrder(order: PurchaseOrder): void { this._order = order; }
  consumeOrder(): PurchaseOrder | null { const o = this._order; this._order = null; return o; }
}

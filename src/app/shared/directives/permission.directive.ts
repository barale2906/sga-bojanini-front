import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  inject,
} from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Directive({
  selector: '[sgaPermission]',
  standalone: true,
})
export class PermissionDirective {
  private authService = inject(AuthService);
  private created = false;

  @Input() set sgaPermission(permission: string | string[]) {
    const permissions = Array.isArray(permission) ? permission : [permission];
    const hasPermission = this.authService.hasAnyPermission(permissions);

    if (hasPermission && !this.created) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.created = true;
    } else if (!hasPermission) {
      this.viewContainer.clear();
      this.created = false;
    }
  }

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef
  ) {}
}

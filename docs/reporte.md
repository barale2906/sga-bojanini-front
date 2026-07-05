# Auditoría de Control de Acceso — SGA Bojanini Frontend

**Rama:** main · **Commit:** f4edaee · **Fecha:** 2026-07-04  
**Referencia backend:** `sga-bojanini/src/docs/frontend-permisos-acceso.md`

---

## Resumen

| Severidad    | Cantidad |
|--------------|:--------:|
| 🔴 Crítico   | 2        |
| 🔵 Importante| 1        |
| 🟡 Advertencia | 2      |
| ✅ Correcto  | 6        |

---

## 🔴 Críticos — acción urgente requerida

### C-1 · `canActivate: [permissionGuard]` ausente en 14 de 15 rutas protegidas

**Archivo:** `src/app/app.routes.ts`

Las rutas definen `data: { permission: '...' }` pero **no incluyen `canActivate: [permissionGuard]`**. Angular sólo activa el guard cuando aparece en `canActivate`; la propiedad `data` sola no produce ningún efecto. Un usuario autenticado puede navegar a cualquier ruta sin importar sus permisos.

| Ruta | Permiso declarado | Guard activo |
|------|------------------|:------------:|
| `/users` | `usuarios.ver` | ✗ |
| `/users/new` | `usuarios.crear` | ✗ |
| `/users/:id/edit` | `usuarios.editar` | ✗ |
| `/roles` | `roles.ver` | ✗ |
| `/warehouses` | `almacenes.ver` | ✗ |
| `/catalog` | `productos.ver` | ✗ |
| `/inventory` | `stock.ver` | ✗ |
| `/cost-centers` | `centros_costo.ver` | ✗ |
| `/purchasing` | `ordenes_compra.ver` | ✗ |
| `/monitoring` | `sensores.ver` | ✗ |
| `/audit` | `auditoria.ver` | ✗ |
| `/integrations` | `integraciones.ver` | ✗ |
| `/reports` | `reportes.ver` | ✗ |
| `/notifications` | `notificaciones.ver` | ✗ |
| `/inventory/patient-records` | `registros_procedimientos.ver` | ✓ |

**Corrección:** Agregar `canActivate: [permissionGuard]` a cada una de las 14 rutas afectadas. El guard en `core/guards/permission.guard.ts` ya está implementado correctamente; sólo falta vincularlo.

```ts
// Patrón a aplicar en cada ruta
{
  path: 'warehouses',
  loadChildren: () => import('./features/warehouse/warehouse.routes')…,
  canActivate: [permissionGuard],   // ← agregar
  data: { permission: 'almacenes.ver' },
}
```

---

### C-2 · Interceptor HTTP no maneja respuestas 401 ni 403

**Archivo:** `src/app/core/interceptors/auth.interceptor.ts`

El interceptor actual sólo adjunta el token a peticiones salientes. No intercepta respuestas de error. El documento del backend especifica:

- **401** → limpiar sesión y redirigir al login.
- **403** → mostrar el campo `message` del JSON de error.

Actualmente la mayoría de los componentes capturan errores con `error: () => {}`, dejando al usuario sin feedback ni redirección ante errores de autorización.

**Corrección:**

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('sga_token');
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  }
  return next(req).pipe(
    catchError(err => {
      if (err.status === 401) { inject(AuthService).clearSession(); }
      if (err.status === 403) {
        inject(MatSnackBar).open(err.error?.message ?? 'Sin acceso', 'Cerrar', { duration: 5000 });
      }
      return throwError(() => err);
    })
  );
};
```

---

## 🔵 Importante

### I-1 · `SensorUsersDialog` usa `PUT /users/{id}/sensors`, explícitamente prohibido por el documento

**Archivos:**
- `src/app/features/monitoring/dialogs/sensor-users-dialog.component.ts`
- `src/app/features/monitoring/monitoring-page.component.html` (línea 50)

El documento del backend indica:

> *"No mostrar la pantalla de asignación manual de sensores (`PUT /users/{id}/sensors`); si se usa, sobreescribe la sincronización automática."*

Sin embargo, `SensorUsersDialogComponent` abre un formulario que llama a `userService.assignSensors(userId, ...)`, usando exactamente ese endpoint. El botón está protegido por `*sgaPermission="'sensores.asignar'"`, pero el documento dice que la pantalla **no debe existir en absoluto**.

**Corrección:** Eliminar el botón "Usuarios con acceso" del template de monitoreo. Si se desea exponer la lista de usuarios asignados en modo solo lectura, usar `GET /users/{id}/sensors` sin posibilidad de modificar.

---

## 🟡 Advertencias

### A-1 · `canAssignWarehouses` no es reactivo — se evalúa una sola vez al construir el componente

**Archivo:** `src/app/features/auth/users/user-form.component.ts` (línea 66)

```ts
// Estado actual — valor fijo al construir el componente
canAssignWarehouses = this.authService.hasPermission('almacenes.asignar');
```

Si los permisos del usuario cambian durante la sesión activa (cambio de rol, `POST /auth/refresh`), este valor queda obsoleto y la UI no refleja el estado real.

**Corrección:** Convertir en `computed()` que lea desde el signal `authService.user()`:

```ts
canAssignWarehouses = computed(
  () => this.authService.hasPermission('almacenes.asignar')
);
// En el template: canAssignWarehouses() en lugar de canAssignWarehouses
```

---

### A-2 · `MovementConfirmDialog` no verifica `movimientos.confirmar` ni `movimientos.cancelar`

**Archivo:** `src/app/features/inventory/movements/movement-confirm-dialog.component.html` (líneas 166–194)

El diálogo de confirmación con firma (abierto automáticamente tras crear una salida, ajuste o traslado) muestra los botones "Confirmar y firmar" y "Cancelar movimiento" a cualquier usuario que pueda crear el movimiento, sin verificar que tenga `movimientos.confirmar` o `movimientos.cancelar`.

El backend valida ambas condiciones de forma independiente (el 403 llegaría igualmente), por lo que no es un agujero de seguridad, pero incumple la especificación de UI del documento (sección 6).

**Corrección:** Inyectar `AuthService` en el componente y agregar guardas `@if` en el template:

```html
@if (authSvc.hasPermission('movimientos.cancelar')) {
  <button … (click)="cancelMovements()">Cancelar movimiento</button>
}
@if (authSvc.hasPermission('movimientos.confirmar')) {
  <button … (click)="confirm()">Confirmar y firmar</button>
}
```

---

## ✅ Correcto

### OK-1 · Directiva `*sgaPermission` bien implementada

`src/app/shared/directives/permission.directive.ts` usa `ViewContainerRef` para mostrar/ocultar el elemento, llama a `hasAnyPermission()` reactivamente y acepta `string | string[]`. Está aplicada correctamente en inventario, almacenes, zonas, ubicaciones y monitoreo.

### OK-2 · Botones de acción de inventario alineados con la especificación

`inventory-page.component.html` protege cada botón con el permiso exacto definido en el documento:  
`movimientos.entrada` · `movimientos.salida` · `movimientos.transferir` · `movimientos.ajuste` · `movimientos.devolucion` · `movimientos.baja` · `movimientos.importar` · `registros_procedimientos.ver`

### OK-3 · Almacenes, zonas y ubicaciones protegidos correctamente

`warehouse-page.component.html` aplica `*sgaPermission` a todos los botones CRUD:  
`almacenes.crear/editar/eliminar` · `zonas.crear/editar/eliminar` · `ubicaciones.crear/editar/eliminar`

### OK-4 · Monitoreo protegido correctamente

`monitoring-page.component.html` aplica `*sgaPermission` a:  
`sensores.crear` · `sensores.editar` · `sensores.eliminar` · `sensores.asignar` · `lecturas.crear`

### OK-5 · Selectores de almacén siempre cargan desde el API

Todos los componentes usan `warehouseService.getWarehouses()`. El backend filtra automáticamente según los almacenes asignados, sin necesidad de filtrar en el frontend ni hardcodear IDs.

### OK-6 · Menú lateral cargado desde el backend

`MenuService.loadMenu()` llama a `GET /api/v1/auth/menu` al iniciar sesión y al refrescar el token. El backend devuelve únicamente los ítems accesibles para el rol del usuario.

---

## Prioridad de corrección sugerida

1. **C-1** — Agregar `canActivate: [permissionGuard]` a las 14 rutas en `app.routes.ts` *(cambio mecánico, bajo riesgo)*
2. **C-2** — Extender el interceptor con manejo de 401/403 *(mejora transversal)*
3. **I-1** — Eliminar el botón/dialog de asignación manual de sensores *(cumplimiento del contrato con backend)*
4. **A-2** — Agregar `@if` de permisos en `MovementConfirmDialog`
5. **A-1** — Convertir `canAssignWarehouses` en `computed()`

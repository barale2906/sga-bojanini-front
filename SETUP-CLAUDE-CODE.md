# 🎯 Configuración Claude Code para SGA Bojanini Frontend

## 📍 Ubicación detectada
Tu proyecto está en: `/mnt/trabajo/repos/Front/sga-bojanini-front`

---

## 🚀 Paso 1: Crear archivo de contexto en tu proyecto

Crea este archivo en la **raíz de tu proyecto Angular**:

```bash
cd /mnt/trabajo/repos/Front/sga-bojanini-front

# Crear el archivo
cat > .claudecontext << 'EOF'
# SGA Bojanini - Contexto para Claude Code

## Proyecto
- **Nombre**: Sistema de Gestión de Almacén Bojanini - Frontend
- **Stack**: Angular 16+, TypeScript, SCSS, Standalone Components
- **Backend**: Laravel API REST en `/api/v1`
- **Timezone**: America/Bogota

## Arquitectura Frontend
```
src/app/
├── core/          # Servicios singleton, guards, interceptors
├── shared/        # Componentes reutilizables
├── features/      # Módulos lazy por funcionalidad (inventario, presentaciones, productos)
└── layouts/       # Layouts principales
```

## Convenciones de Código

### TypeScript
- Tipado estricto: `strict: true`, nunca usar `any`
- Interfaces para contratos, enums para constantes
- Nomenclatura: PascalCase (clases), camelCase (variables), kebab-case (archivos)

### Componentes
- **SIEMPRE** standalone components
- **SIEMPRE** OnPush change detection
- **SIEMPRE** usar Signals para estado local
- Prefijo de selector: `sga-`
- Pattern Smart/Dumb: separar lógica de presentación

### Ejemplo de componente estándar:
```typescript
@Component({
  selector: 'sga-my-component',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-component.component.html',
  styleUrls: ['./my-component.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyComponent {
  // Signals para estado
  data = signal<Type[]>([]);
  loading = signal(false);
  
  @Input({ required: true }) item!: Type;
  @Output() itemSelected = new EventEmitter<Type>();
}
```

### Servicios
```typescript
@Injectable({ providedIn: 'root' })
export class MyService {
  private readonly apiUrl = `${environment.apiUrl}/endpoint`;
  
  constructor(private http: HttpClient) {}
  
  getData(): Observable<ApiResponse<Type[]>> {
    return this.http.get<ApiResponse<Type[]>>(this.apiUrl);
  }
}
```

### API Response (del backend Laravel)
```typescript
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors?: Record<string, string[]>;
}
```

## Performance Obligatorio
- TrackBy en todos los *ngFor
- OnPush change detection por defecto
- Lazy loading de features
- Signals sobre RxJS para estado local

## Seguridad
- Guards en todas las rutas protegidas
- Interceptor para manejo de errores centralizado
- No exponer datos sensibles en logs/errores

## Git
- NO ejecutar git commit/push sin autorización explícita
- Cambios acotados a la tarea solicitada
- No refactors masivos no solicitados

## Respuestas
- Documentación y explicaciones: **español**
- Código (variables, clases, funciones): **inglés**
- Mantener estructura modular del proyecto
- Optimizar para reducir consumo de tokens
EOF

echo "✅ Archivo .claudecontext creado"
```

---

## 🚀 Paso 2: Crear archivo de instrucciones Claude Code

Crea también este archivo para instrucciones específicas de Claude Code:

```bash
cd /mnt/trabajo/repos/Front/sga-bojanini-front

cat > .claude/instructions.md << 'EOF'
# Instrucciones para Claude Code - SGA Bojanini Frontend

## Contexto del Proyecto
Este es el frontend Angular del Sistema de Gestión de Almacén (SGA) Bojanini.
Stack: Angular 16+ con Standalone Components, TypeScript estricto, Signals para estado.
Backend: Laravel API REST.

## Reglas de Desarrollo

### 1. Estructura de Código
- Componentes standalone con OnPush change detection
- Signals para estado reactivo local
- Servicios con `providedIn: 'root'`
- Tipado estricto (sin `any`)

### 2. Nomenclatura
- Archivos: kebab-case (user-profile.component.ts)
- Clases: PascalCase (UserProfileComponent)
- Variables/funciones: camelCase (getUserData)
- Constantes: UPPER_SNAKE_CASE (API_BASE_URL)
- Selectores: prefijo sga- (sga-user-card)
- Observables: sufijo $ (users$)

### 3. Patrones Obligatorios
- Smart/Dumb components (separar lógica de presentación)
- TrackBy en todos los *ngFor
- Lazy loading para features
- Error handling centralizado con interceptor

### 4. API Integration
```typescript
// Formato de respuesta del backend
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors?: Record<string, string[]>;
}
```

### 5. Optimización de Tokens
Al responder:
- Ser conciso pero completo
- No repetir código ya existente
- Mostrar solo las partes relevantes
- Usar comentarios para indicar código omitido
- Explicaciones breves en español

### 6. Git
- NO ejecutar comandos git sin petición explícita
- Solo sugerir, nunca ejecutar commit/push
- Cambios enfocados en la tarea específica

### 7. Estructura de Respuesta Ideal
```
1. Breve descripción de lo que voy a hacer
2. Código o comando necesario
3. Explicación concisa del cambio
4. Próximos pasos (si aplica)
```

## Comandos Frecuentes

### Crear componente
```bash
ng generate component features/[modulo]/components/[nombre] --standalone
```

### Crear servicio
```bash
ng generate service core/services/[nombre]
```

### Crear guard
```bash
ng generate guard core/guards/[nombre] --functional
```

## Timezone
- Configurar: America/Bogota
- Consistente con backend Laravel
EOF

mkdir -p .claude
echo "✅ Archivo .claude/instructions.md creado"
```

---

## 🚀 Paso 3: Configuración global de Claude Code

Crea un archivo de configuración global en tu home:

```bash
# Crear directorio de configuración
mkdir -p ~/.config/claude-code

# Crear archivo de configuración global
cat > ~/.config/claude-code/config.yaml << 'EOF'
# Configuración global de Claude Code

# Optimización de tokens
token_optimization:
  enabled: true
  max_context_files: 10
  exclude_patterns:
    - "node_modules/**"
    - "dist/**"
    - ".angular/**"
    - "coverage/**"
    - "*.log"
    - ".env*"

# Archivos de contexto a leer automáticamente
context_files:
  - ".claudecontext"
  - ".claude/instructions.md"
  - "README.md"
  - "package.json"

# Configuración de respuestas
response_config:
  language: "es"  # Explicaciones en español
  code_language: "en"  # Código en inglés
  concise: true  # Respuestas concisas
  show_diff: true  # Mostrar diffs de cambios

# Git
git:
  auto_commit: false  # Nunca hacer commits automáticos
  auto_push: false
  suggest_messages: true  # Sugerir mensajes de commit
EOF

echo "✅ Configuración global creada"
```

---

## 🚀 Paso 4: Crear helper script

Crea un script para facilitar el uso:

```bash
cat > /mnt/trabajo/repos/Front/sga-bojanini-front/claude-helper.sh << 'EOF'
#!/bin/bash

# Helper script para Claude Code - SGA Bojanini

case "$1" in
  "context")
    echo "📄 Contexto del proyecto:"
    cat .claudecontext 2>/dev/null || echo "❌ Archivo .claudecontext no encontrado"
    ;;
  
  "stats")
    echo "📊 Estadísticas del proyecto:"
    echo "Componentes: $(find src/app -name "*.component.ts" | wc -l)"
    echo "Servicios: $(find src/app -name "*.service.ts" | wc -l)"
    echo "Guards: $(find src/app -name "*.guard.ts" | wc -l)"
    echo "Pipes: $(find src/app -name "*.pipe.ts" | wc -l)"
    ;;
  
  "check")
    echo "🔍 Verificando configuración..."
    [ -f .claudecontext ] && echo "✅ .claudecontext existe" || echo "❌ .claudecontext no existe"
    [ -d .claude ] && echo "✅ .claude/ existe" || echo "❌ .claude/ no existe"
    [ -f .claude/instructions.md ] && echo "✅ instructions.md existe" || echo "❌ instructions.md no existe"
    ;;
  
  "init")
    echo "🚀 Inicializando configuración Claude Code..."
    mkdir -p .claude
    echo "✅ Directorio .claude creado"
    echo "📝 Por favor crea los archivos .claudecontext y .claude/instructions.md"
    ;;
  
  *)
    echo "🤖 Claude Code Helper - SGA Bojanini"
    echo ""
    echo "Uso: ./claude-helper.sh [comando]"
    echo ""
    echo "Comandos:"
    echo "  context  - Mostrar contexto del proyecto"
    echo "  stats    - Estadísticas del proyecto"
    echo "  check    - Verificar configuración"
    echo "  init     - Inicializar estructura"
    ;;
esac
EOF

chmod +x /mnt/trabajo/repos/Front/sga-bojanini-front/claude-helper.sh
echo "✅ Helper script creado"
```

---

## 📋 Resumen de archivos a crear:

1. **`.claudecontext`** (raíz del proyecto) - Contexto automático
2. **`.claude/instructions.md`** (directorio .claude/) - Instrucciones específicas  
3. **`~/.config/claude-code/config.yaml`** - Configuración global (opcional)
4. **`claude-helper.sh`** - Script helper (opcional)

---

## 🎯 Cómo funciona:

### Cuando ejecutas Claude Code:
1. Lee automáticamente `.claudecontext` y `.claude/instructions.md`
2. Aplica las reglas de desarrollo Angular
3. Mantiene contexto consistente entre sesiones
4. Optimiza uso de tokens al saber qué es relevante

### Ventajas:
✅ **No consumes tokens innecesarios** - Claude Code lee el contexto una vez
✅ **Consistencia total** - Mismas reglas en cada sesión
✅ **Sin repetir instrucciones** - El contexto persiste
✅ **Respuestas optimizadas** - Claude sabe la estructura del proyecto

---

## 🧪 Prueba que funciona:

```bash
cd /mnt/trabajo/repos/Front/sga-bojanini-front

# Verificar configuración
./claude-helper.sh check

# Ver contexto
./claude-helper.sh context

# Iniciar Claude Code (leerá automáticamente el contexto)
# Luego pregunta algo como:
# "Crea un componente para listar usuarios"
```

Claude Code automáticamente:
- Aplicará las convenciones Angular
- Usará Signals, OnPush, standalone
- Seguirá la estructura de carpetas
- Responderá de forma optimizada

---

## 💡 Tips para optimizar tokens:

1. **En tus preguntas, sé específico:**
   ```
   ❌ "Ayúdame con el componente de usuarios"
   ✅ "Crea UserListComponent en features/usuarios/components con tabla paginada"
   ```

2. **Usa el contexto del proyecto:**
   ```
   ❌ "Necesito conectarme al backend"
   ✅ "Agrega método getUsers() al UserService usando ApiResponse"
   ```

3. **Pide cambios incrementales:**
   ```
   ❌ "Crea todo el módulo de usuarios completo"
   ✅ "Primero crea el servicio, luego el componente de lista"
   ```

---

¿Quieres que ejecute los comandos para crear estos archivos en tu proyecto directamente?
EOF


#!/bin/bash

# Script para configurar el manual de marca Bojanini en Claude Code
# Este script te guiará para extraer los valores del PDF y actualizar la configuración

PROJECT_DIR="/mnt/trabajo/repos/Front/sga-bojanini-front"
PDF_PATH="$PROJECT_DIR/recursos/identidad.pdf"
CONTEXT_FILE="$PROJECT_DIR/.claudecontext"

echo "🎨 Configurador de Manual de Marca - SGA Bojanini"
echo "=================================================="
echo ""

# Verificar que existe el PDF
if [ ! -f "$PDF_PATH" ]; then
    echo "❌ No se encontró el manual de marca en: $PDF_PATH"
    echo "Por favor coloca el archivo identidad.pdf en la carpeta recursos/"
    exit 1
fi

echo "✅ Manual de marca encontrado: $PDF_PATH"
echo ""

# Crear archivo de variables de diseño
DESIGN_VARS_FILE="$PROJECT_DIR/src/styles/_variables.scss"

echo "📝 Vamos a crear el archivo de variables SCSS con los colores corporativos"
echo ""
echo "Por favor abre el PDF en: $PDF_PATH"
echo "Y extrae los siguientes valores:"
echo ""

# Crear directorio styles si no existe
mkdir -p "$PROJECT_DIR/src/styles"

# Función para solicitar input con valor por defecto
read_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    echo -n "$prompt [$default]: "
    read value
    
    if [ -z "$value" ]; then
        value="$default"
    fi
    
    eval "$var_name='$value'"
}

echo "=== COLORES PRINCIPALES ==="
echo ""

read_with_default "Color primario (ej: #003366)" "#003366" COLOR_PRIMARY
read_with_default "Color secundario (ej: #0066CC)" "#0066CC" COLOR_SECONDARY
read_with_default "Color de acento (ej: #FF6600)" "#FF6600" COLOR_ACCENT

echo ""
echo "=== ESCALA DE GRISES ==="
echo ""

read_with_default "Color oscuro (ej: #2D3748)" "#2D3748" COLOR_DARK
read_with_default "Color gris (ej: #718096)" "#718096" COLOR_GRAY
read_with_default "Color gris claro (ej: #E2E8F0)" "#E2E8F0" COLOR_LIGHT_GRAY
read_with_default "Color de fondo (ej: #F7FAFC)" "#F7FAFC" COLOR_BACKGROUND

echo ""
echo "=== COLORES DE ESTADO ==="
echo ""

read_with_default "Color éxito (ej: #48BB78)" "#48BB78" COLOR_SUCCESS
read_with_default "Color advertencia (ej: #F6AD55)" "#F6AD55" COLOR_WARNING
read_with_default "Color error (ej: #F56565)" "#F56565" COLOR_ERROR
read_with_default "Color info (ej: #4299E1)" "#4299E1" COLOR_INFO

echo ""
echo "=== TIPOGRAFÍA ==="
echo ""

read_with_default "Fuente principal (ej: Roboto)" "Roboto" FONT_PRIMARY
read_with_default "Fuente secundaria (ej: Open Sans)" "Open Sans" FONT_SECONDARY

echo ""
echo "🎨 Generando archivo de variables SCSS..."
echo ""

# Crear archivo _variables.scss
cat > "$DESIGN_VARS_FILE" << EOF
// ============================================
// Variables de Diseño - Manual de Marca Bojanini
// Generado automáticamente desde: recursos/identidad.pdf
// ============================================

// ===================
// COLORES PRINCIPALES
// ===================
\$color-primary: $COLOR_PRIMARY;
\$color-secondary: $COLOR_SECONDARY;
\$color-accent: $COLOR_ACCENT;

// ===================
// ESCALA DE GRISES
// ===================
\$color-dark: $COLOR_DARK;
\$color-gray: $COLOR_GRAY;
\$color-light-gray: $COLOR_LIGHT_GRAY;
\$color-background: $COLOR_BACKGROUND;
\$color-white: #FFFFFF;
\$color-black: #000000;

// ===================
// COLORES DE ESTADO
// ===================
\$color-success: $COLOR_SUCCESS;
\$color-warning: $COLOR_WARNING;
\$color-error: $COLOR_ERROR;
\$color-info: $COLOR_INFO;

// ===================
// TIPOGRAFÍA
// ===================
\$font-primary: '$FONT_PRIMARY', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
\$font-secondary: '$FONT_SECONDARY', Georgia, serif;
\$font-mono: 'Consolas', 'Monaco', 'Courier New', monospace;

// Tamaños de fuente
\$font-size-xs: 0.75rem;    // 12px
\$font-size-sm: 0.875rem;   // 14px
\$font-size-base: 1rem;     // 16px
\$font-size-lg: 1.125rem;   // 18px
\$font-size-xl: 1.25rem;    // 20px
\$font-size-2xl: 1.5rem;    // 24px
\$font-size-3xl: 1.875rem;  // 30px
\$font-size-4xl: 2.25rem;   // 36px

// Pesos de fuente
\$font-weight-light: 300;
\$font-weight-normal: 400;
\$font-weight-medium: 500;
\$font-weight-semibold: 600;
\$font-weight-bold: 700;

// ===================
// ESPACIADO
// ===================
// Sistema base 8px
\$spacing-xs: 0.25rem;   // 4px
\$spacing-sm: 0.5rem;    // 8px
\$spacing-md: 1rem;      // 16px
\$spacing-lg: 1.5rem;    // 24px
\$spacing-xl: 2rem;      // 32px
\$spacing-2xl: 3rem;     // 48px
\$spacing-3xl: 4rem;     // 64px

// ===================
// BORDES Y RADIOS
// ===================
\$border-width: 1px;
\$border-width-thick: 2px;

\$border-radius-sm: 0.25rem;   // 4px
\$border-radius-md: 0.5rem;    // 8px
\$border-radius-lg: 0.75rem;   // 12px
\$border-radius-xl: 1rem;      // 16px
\$border-radius-full: 9999px;

// ===================
// SOMBRAS
// ===================
\$shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
\$shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
\$shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
\$shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
\$shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);

// ===================
// BREAKPOINTS
// ===================
\$breakpoint-mobile: 480px;
\$breakpoint-tablet: 768px;
\$breakpoint-desktop: 1024px;
\$breakpoint-wide: 1440px;
\$breakpoint-ultra: 1920px;

// ===================
// Z-INDEX
// ===================
\$z-index-dropdown: 1000;
\$z-index-sticky: 1020;
\$z-index-fixed: 1030;
\$z-index-modal-backdrop: 1040;
\$z-index-modal: 1050;
\$z-index-popover: 1060;
\$z-index-tooltip: 1070;

// ===================
// TRANSICIONES
// ===================
\$transition-fast: 150ms ease-in-out;
\$transition-base: 200ms ease-in-out;
\$transition-slow: 300ms ease-in-out;
EOF

echo "✅ Archivo creado: $DESIGN_VARS_FILE"
echo ""

# Crear archivo _themes.scss con CSS Variables
THEMES_FILE="$PROJECT_DIR/src/styles/_themes.scss"

cat > "$THEMES_FILE" << EOF
// ============================================
// Temas CSS - Variables CSS Globales
// ============================================

:root {
  // Colores principales
  --color-primary: $COLOR_PRIMARY;
  --color-secondary: $COLOR_SECONDARY;
  --color-accent: $COLOR_ACCENT;
  
  // Grises
  --color-dark: $COLOR_DARK;
  --color-gray: $COLOR_GRAY;
  --color-light-gray: $COLOR_LIGHT_GRAY;
  --color-background: $COLOR_BACKGROUND;
  --color-white: #FFFFFF;
  --color-black: #000000;
  
  // Estados
  --color-success: $COLOR_SUCCESS;
  --color-warning: $COLOR_WARNING;
  --color-error: $COLOR_ERROR;
  --color-info: $COLOR_INFO;
  
  // Tipografía
  --font-primary: '$FONT_PRIMARY', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-secondary: '$FONT_SECONDARY', Georgia, serif;
  
  // Espaciado
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;
  
  // Bordes
  --border-radius-sm: 0.25rem;
  --border-radius-md: 0.5rem;
  --border-radius-lg: 0.75rem;
  
  // Sombras
  --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

// Tema oscuro (opcional)
[data-theme="dark"] {
  --color-background: #1A202C;
  --color-dark: #F7FAFC;
  --color-light-gray: #2D3748;
  // Ajustar otros colores según necesidad
}
EOF

echo "✅ Archivo creado: $THEMES_FILE"
echo ""

# Actualizar angular.json para incluir los estilos globales
echo "📝 Para usar estos estilos globalmente, agrega a angular.json:"
echo ""
echo "\"styles\": ["
echo "  \"src/styles.scss\","
echo "  \"src/styles/_variables.scss\","
echo "  \"src/styles/_themes.scss\""
echo "]"
echo ""

# Crear archivo styles.scss principal si no existe
MAIN_STYLES="$PROJECT_DIR/src/styles.scss"

if [ ! -f "$MAIN_STYLES" ]; then
    cat > "$MAIN_STYLES" << EOF
// Importar variables y temas
@import 'styles/variables';
@import 'styles/themes';

// Estilos globales
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-primary);
  font-size: \$font-size-base;
  color: var(--color-dark);
  background-color: var(--color-background);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-primary);
  font-weight: \$font-weight-semibold;
  color: var(--color-dark);
  margin-bottom: var(--spacing-sm);
}

a {
  color: var(--color-primary);
  text-decoration: none;
  transition: \$transition-base;
  
  &:hover {
    color: var(--color-secondary);
  }
}

button {
  font-family: var(--font-primary);
  cursor: pointer;
  transition: \$transition-base;
}
EOF
    echo "✅ Archivo creado: $MAIN_STYLES"
else
    echo "ℹ️  styles.scss ya existe, no se sobrescribió"
fi

echo ""
echo "=========================================="
echo "✨ ¡Configuración completada!"
echo "=========================================="
echo ""
echo "📋 Archivos creados:"
echo "   ✅ src/styles/_variables.scss"
echo "   ✅ src/styles/_themes.scss"
echo "   ✅ src/styles.scss"
echo ""
echo "🎨 Colores configurados:"
echo "   • Primario: $COLOR_PRIMARY"
echo "   • Secundario: $COLOR_SECONDARY"
echo "   • Acento: $COLOR_ACCENT"
echo ""
echo "📝 Tipografía configurada:"
echo "   • Principal: $FONT_PRIMARY"
echo "   • Secundaria: $FONT_SECONDARY"
echo ""
echo "🎯 Próximos pasos:"
echo "   1. Verifica que los colores sean correctos abriendo:"
echo "      src/styles/_variables.scss"
echo ""
echo "   2. Si necesitas ajustar algún valor, edita directamente"
echo "      ese archivo"
echo ""
echo "   3. Ahora Claude Code usará automáticamente estos colores"
echo "      al crear componentes"
echo ""
echo "   4. Ejemplo de uso en componentes:"
echo "      color: var(--color-primary);"
echo "      background: var(--color-background);"
echo ""

#!/bin/bash

# Script de instalación rápida para Claude Code
# SGA Bojanini - Frontend Angular

echo "🚀 Configurando Claude Code para SGA Bojanini Frontend..."
echo ""

# Detectar directorio del proyecto
PROJECT_DIR="/mnt/trabajo/repos/Front/sga-bojanini-front"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Directorio del proyecto no encontrado: $PROJECT_DIR"
    echo "Por favor edita este script con la ruta correcta"
    exit 1
fi

cd "$PROJECT_DIR" || exit 1
echo "📁 Directorio: $PROJECT_DIR"
echo ""

# Crear directorio .claude si no existe
if [ ! -d ".claude" ]; then
    mkdir -p .claude
    echo "✅ Directorio .claude creado"
else
    echo "ℹ️  Directorio .claude ya existe"
fi

# Copiar archivo .claudecontext
if [ -f "../.claudecontext" ]; then
    cp ../.claudecontext .claudecontext
    echo "✅ Archivo .claudecontext copiado"
elif [ -f ".claudecontext" ]; then
    echo "ℹ️  Archivo .claudecontext ya existe"
else
    echo "⚠️  Archivo .claudecontext no encontrado, créalo manualmente"
fi

# Copiar archivo instructions.md
if [ -f "../instructions.md" ]; then
    cp ../instructions.md .claude/instructions.md
    echo "✅ Archivo .claude/instructions.md copiado"
elif [ -f ".claude/instructions.md" ]; then
    echo "ℹ️  Archivo .claude/instructions.md ya existe"
else
    echo "⚠️  Archivo instructions.md no encontrado, créalo manualmente"
fi

# Verificar .gitignore
if [ -f ".gitignore" ]; then
    if ! grep -q ".claudecontext" .gitignore; then
        echo "" >> .gitignore
        echo "# Claude Code" >> .gitignore
        echo ".claudecontext" >> .gitignore
        echo ".claude/" >> .gitignore
        echo "✅ Archivos de Claude agregados a .gitignore"
    else
        echo "ℹ️  .gitignore ya contiene configuración de Claude"
    fi
else
    echo "⚠️  No se encontró .gitignore"
fi

echo ""
echo "✨ Configuración completada!"
echo ""
echo "📋 Archivos creados:"
echo "   - .claudecontext (contexto del proyecto)"
echo "   - .claude/instructions.md (instrucciones específicas)"
echo ""
echo "🧪 Para verificar:"
echo "   ls -la | grep claude"
echo ""
echo "🎯 Siguiente paso:"
echo "   Inicia Claude Code y prueba con:"
echo "   'Crea un componente para listar usuarios'"

.PHONY: up down start stop restart ps logs angular npm init show-urls build

up:
	@echo "=> Levantando contenedores (build incluido)..."
	docker compose up -d --build
	@$(MAKE) show-urls

init:
	@echo "=> Inicializando proyecto por primera vez..."
	@echo "=> Construyendo imagen..."
	docker compose build
	@echo "=> Instalando dependencias de npm (volumen node_modules)..."
	docker compose run --rm angular npm install
	@$(MAKE) up
	@echo "=> Inicialización completada."

down:
	@echo "=> Deteniendo y eliminando contenedores/red..."
	docker compose down

stop:
	@echo "=> Deteniendo contenedores (sin borrar volúmenes)..."
	docker compose stop

start:
	@echo "=> Iniciando contenedores existentes..."
	docker compose start
	@$(MAKE) show-urls

restart:
	@echo "=> Reiniciando contenedores..."
	docker compose restart
	@$(MAKE) show-urls

ps:
	@echo "=> Estado de servicios:"
	docker compose ps

logs:
	docker compose logs -f $(filter-out $@,$(MAKECMDGOALS))

angular:
	docker compose exec angular bash

npm:
	docker compose exec angular npm $(filter-out $@,$(MAKECMDGOALS))

build:
	docker compose exec angular npm run build

show-urls:
	@echo ""
	@echo "=> Accesos:"
	@echo "   Angular (dev): http://localhost:4202"
	@echo ""
	@echo "=> Comandos útiles:"
	@echo "   make init            - Primera ejecución (up + npm install)"
	@echo "   make stop / make start - Fin / inicio del día"
	@echo "   make npm install     - Instalar dependencias"
	@echo "   make npm -- run ng generate component X"
	@echo "   make angular         - Acceder al contenedor"
	@echo "   make build           - Compilar para producción"
	@echo ""

%:
	@:

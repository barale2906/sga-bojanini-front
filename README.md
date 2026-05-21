# sga-bojanini-front

Frontend **Angular 21** del proyecto SGA Bojanini. Todo el entorno de desarrollo corre en **Docker** (no se instala Node ni Angular en el host).

## Requisitos

- Docker y Docker Compose
- `make` (recomendado)

## Primera ejecución

```bash
make init
```

Esto levanta el contenedor, instala dependencias con `npm install` y deja la app lista en **http://localhost:4202**.

## Flujo diario

| Momento | Comando |
|--------|---------|
| Fin del día | `make stop` |
| Inicio del día | `make start` |
| Ver URLs | `make show-urls` |

Solo usa `make down` y `make up` cuando cambies el Dockerfile o necesites reconstruir imágenes.

## Comandos útiles

```bash
make up              # Levantar con build
make logs angular    # Ver logs del servicio
make angular         # Shell dentro del contenedor
make npm install     # Instalar dependencias
make npm -- run ng generate component mi-componente
make build           # Build de producción (dist/)
```

## Proxy API (desarrollo)

Las peticiones a `/api` se redirigen al backend configurado en `proxy.docker.conf.json` (por defecto `http://host.docker.internal:8000`). Ajusta el `target` según tu API.

## Estructura Docker

```
sga-bojanini-front/
├── docker/
│   └── angular.Dockerfile
├── docker-compose.yml
├── Makefile
├── proxy.docker.conf.json
├── src/
└── angular.json
```

## Stack

- Angular **21.2.x**
- Node **20** (imagen Docker)
- TypeScript **5.9**
- Estilos **SCSS**
- Routing habilitado

## Referencia

Configuración alineada con la guía práctica Docker para proyectos de desarrollo del equipo.

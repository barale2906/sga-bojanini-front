FROM node:20
WORKDIR /app

# Git útil para scripts npm y generadores del CLI
RUN apt-get update && \
    apt-get install -y git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# El volumen ./ se monta en tiempo de ejecución.
# Las dependencias se instalan dentro del contenedor (make init / make npm install).

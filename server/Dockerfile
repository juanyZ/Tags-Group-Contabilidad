# Imagen del backend.
# Alpine + node 20 LTS: imagen chica y con soporte largo.
FROM node:20-alpine

# Zona horaria dentro del contenedor. La logica de negocio no depende de esto
# (usa Intl explicitamente), pero mantiene coherentes los logs y el cron.
RUN apk add --no-cache tzdata openssl && \
    cp /usr/share/zoneinfo/America/Argentina/Buenos_Aires /etc/localtime && \
    echo "America/Argentina/Buenos_Aires" > /etc/timezone

WORKDIR /app

# Las dependencias se instalan en una capa aparte: mientras no cambie el
# package-lock, Docker reutiliza el cache y el build es casi instantaneo.
COPY package*.json ./
RUN npm ci --omit=dev

# El cliente de Prisma se genera contra el esquema, antes de copiar el resto.
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

# Directorio de adjuntos: se monta como volumen desde docker-compose.
RUN mkdir -p /data/uploads && chown -R node:node /data/uploads

# NUNCA correr como root. Si alguien logra ejecucion remota, se encuentra con
# un usuario sin privilegios.
USER node

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]

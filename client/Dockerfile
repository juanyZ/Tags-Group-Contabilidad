# Build en dos etapas: se compila con Node y se sirve con nginx.
# La imagen final no lleva Node ni node_modules: solo HTML, CSS y JS estatico.

FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# La URL de la API se decide en tiempo de build (Vite la inyecta en el bundle).
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

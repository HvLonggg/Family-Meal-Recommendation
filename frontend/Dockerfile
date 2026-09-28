FROM node:22.15-alpine AS build

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.28.0 --activate

COPY package.json ./
RUN pnpm install --frozen-lockfile=false

COPY . .
RUN pnpm build

FROM nginx:1.29-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

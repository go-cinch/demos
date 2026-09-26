ARG NODE_VERSION=24-alpine
ARG NGINX_VERSION=stable-alpine

FROM node:${NODE_VERSION} AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true

RUN corepack enable

WORKDIR /app
COPY . .
RUN --mount=type=cache,id=art-eleplus-vue3-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm run build

FROM nginx:${NGINX_VERSION} AS production

RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

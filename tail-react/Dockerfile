ARG NODE_VERSION=24-alpine
ARG NGINX_VERSION=stable-alpine

FROM node:${NODE_VERSION} AS builder

ENV CI=true

WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=tail-react-npm,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM nginx:${NGINX_VERSION} AS production

RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

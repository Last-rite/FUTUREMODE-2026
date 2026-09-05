FROM node:22-alpine AS frontend
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY assets ./assets
ARG VITE_API_BASE_URL=
ENV VITE_BACKEND_MODE=http
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM golang:1.24-alpine AS backend
WORKDIR /src
COPY Noxcat-game-backend-main/go.mod Noxcat-game-backend-main/go.sum ./
RUN go mod download
COPY Noxcat-game-backend-main/cmd ./cmd
COPY Noxcat-game-backend-main/internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/noxcat ./cmd/server

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata && addgroup -S noxcat && adduser -S -G noxcat noxcat
WORKDIR /app
COPY --from=backend /out/noxcat /app/noxcat
COPY --from=frontend /src/dist /app/public
COPY Noxcat-game-backend-main/migrations /app/migrations
ENV HTTP_ADDRESS=:8080
ENV STATIC_DIR=/app/public
EXPOSE 8080
USER noxcat
ENTRYPOINT ["/app/noxcat"]

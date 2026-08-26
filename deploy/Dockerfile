# Multi-stage Dockerfile for Ophanim Hub (Pure Go Static Binary + Embedded React UI)

# Stage 1: Build React Frontend
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# Stage 2: Build Go Static Binary
FROM golang:1.23-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy compiled web dist into pkg/web/dist for Go embed.FS
COPY --from=web-builder /app/web/dist ./pkg/web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/ophanim ./cmd/ophanim
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/ophanim-monitor ./cmd/ophanim-monitor

# Stage 3: Final Production Image (Alpine)
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=go-builder /bin/ophanim /usr/local/bin/ophanim
COPY --from=go-builder /bin/ophanim-monitor /usr/local/bin/ophanim-monitor

EXPOSE 8080
VOLUME ["/data", "/etc/ophanim"]

ENTRYPOINT ["/usr/local/bin/ophanim"]
CMD ["--config", "/etc/ophanim/config.yaml", "--db", "/data/ophanim.db"]

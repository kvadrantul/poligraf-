# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Копируем go mod файлы
COPY go.mod go.sum ./
RUN go mod download

# Копируем исходный код
COPY . .

# Собираем бинарник
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Копируем бинарник из builder
COPY --from=builder /app/main .

# Expose port
EXPOSE 8080

# Run
CMD ["./main"]


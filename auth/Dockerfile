FROM golang:1.27.1-alpine3.23 AS builder

ENV CGO_ENABLED=0

RUN apk add --no-cache ca-certificates git make protobuf

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
RUN make build

FROM alpine:3.23

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S app && adduser -S -G app -u 10001 app

WORKDIR /app

COPY --from=builder /src/bin/auth /app/auth
COPY conf /app/conf
COPY POINT_CAPTCHA_FONT_LICENSE.txt /app/POINT_CAPTCHA_FONT_LICENSE.txt

USER app

ENTRYPOINT ["/app/auth"]
CMD ["-c", "/app/conf"]

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/invoice-keeper ./cmd/invoice-keeper

FROM alpine:3.22
RUN addgroup -g 10001 keeper && adduser -u 10001 -G keeper -H -D keeper && mkdir /data && chown keeper:keeper /data
COPY --from=build /out/invoice-keeper /usr/local/bin/invoice-keeper
WORKDIR /data
USER keeper
EXPOSE 8000
CMD ["invoice-keeper", "serve", "--host", "0.0.0.0", "--port", "8000"]

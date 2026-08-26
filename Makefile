.PHONY: all build build-web build-hub build-monitor test clean

all: build-web build-hub build-monitor

build-web:
	cd web && npm install && npm run build
	mkdir -p pkg/web/dist
	cp -r web/dist/* pkg/web/dist/

build-hub:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/ophanim ./cmd/ophanim

build-monitor:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/ophanim-monitor ./cmd/ophanim-monitor

test:
	go test -v ./pkg/...

clean:
	rm -rf bin/ pkg/web/dist/ data/ test.db

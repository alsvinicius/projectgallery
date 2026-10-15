.PHONY: start stop check test
start:
	@mkdir -p .run
	@if test -f .run/gallery.pid && kill -0 "$$(cat .run/gallery.pid)" 2>/dev/null; then echo "Galeria já está ativa (PID $$(cat .run/gallery.pid))"; else setsid node --disable-warning=ExperimentalWarning --experimental-strip-types src/server.ts > .run/gallery.log 2>&1 < /dev/null & echo $$! > .run/gallery.pid; echo "Galeria iniciando em http://127.0.0.1:$${GALLERY_PORT:-4173}"; fi
stop:
	@if test -f .run/gallery.pid; then pid="$$(cat .run/gallery.pid)"; kill "$$pid" 2>/dev/null || true; for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do kill -0 "$$pid" 2>/dev/null || break; sleep 0.1; done; unlink .run/gallery.pid; echo "Serviço da galeria encerrado; projetos geridos continuam ativos."; else echo "Galeria não está ativa."; fi
check:
	npm run check
test:
	npm test

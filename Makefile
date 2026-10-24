PYTHON ?= .venv/bin/python

.PHONY: help install init run demo test schema package backup docker-config

help:
	@printf '%s\n' 'make install        Install backend and test dependencies' 'make init           Prepare local .env and demo data (preserves existing data)' 'make run            Start at http://127.0.0.1:18080' 'make demo           Start with the local webhook receiver' 'make test           Run the test suite with temporary databases' 'make schema         Export OpenAPI without starting workers' 'make package        Build and verify the source archive' 'make backup         Back up the configured local database' 'make docker-config  Validate the local Docker Compose profile'

.venv/bin/python:
	python3 -m venv .venv

install: .venv/bin/python
	$(PYTHON) -m pip install -r backend/requirements-dev.txt

init:
	$(PYTHON) -m backend.app.bootstrap --demo

run:
	$(PYTHON) -m backend.app.run

demo:
	$(PYTHON) -m backend.app.run --demo-webhook

test:
	$(PYTHON) -m pytest -q

schema:
	$(PYTHON) scripts/export_openapi.py

package: schema
	$(PYTHON) scripts/package.py
	$(PYTHON) scripts/verify_archive.py

backup:
	$(PYTHON) scripts/backup.py

docker-config:
	docker compose config --quiet

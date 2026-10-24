ARG PYTHON_BASE=python:3.12-slim
FROM ${PYTHON_BASE}

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && groupadd --gid 10001 keeper \
    && useradd --uid 10001 --gid 10001 --no-create-home keeper \
    && mkdir /data && chown keeper:keeper /data
COPY --chown=keeper:keeper backend/__init__.py ./backend/__init__.py
COPY --chown=keeper:keeper backend/app ./backend/app
COPY --chown=keeper:keeper frontend ./frontend
USER keeper
EXPOSE 8000
CMD ["python", "-m", "backend.app.run", "--host", "0.0.0.0", "--port", "8000"]

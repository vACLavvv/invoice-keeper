FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 keeper \
    && useradd --uid 10001 --gid 10001 --no-create-home keeper \
    && mkdir /data && chown keeper:keeper /data
COPY --chown=keeper:keeper app ./app
USER keeper
EXPOSE 8000
CMD ["python", "-m", "app.run", "--host", "0.0.0.0", "--port", "8000"]

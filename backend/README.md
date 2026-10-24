# Backend

Python 3.12, FastAPI, SQLite. Выполняйте команды **из корня проекта**.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -m backend.app.bootstrap --demo
.venv/bin/python -m backend.app.run
```

Адрес локальной панели: http://127.0.0.1:18080. Для приложения с приёмником webhook добавьте `--demo-webhook`. Команды доступны также через `make help`.

`app/main.py` создаёт ASGI-приложение; `app/run.py` запускает Uvicorn и управляет дочерним webhook-процессом; `app/webhook_demo.py` — локальный приёмник. Остальные модули содержат правила платежей, SQLite, авторизацию, аудит и интеграции. Все импорты используют пакет `backend.app`.

`.env`, SQLite, логи и резервные копии расположены вне исходников; их пути вычисляются от корня проекта, а не от текущего каталога терминала. Frontend обслуживается из соседнего `frontend/`, API и browser URL сохранены.

Зависимости зафиксированы в `requirements.txt`; `requirements-dev.txt` включает runtime-зависимости и инструменты тестирования. Тесты — в общем каталоге `tests/`. Dockerfile — в `deploy/`.

# Инструменты проекта

Запускайте из корня через `.venv/bin/python scripts/<имя>.py`.

| Скрипт | Назначение |
| --- | --- |
| `export_openapi.py` | Обновить `docs/openapi.json`, не запуская обработчики и не открывая базу |
| `package.py` | Собрать `output/invoice-keeper.zip` с явным списком исходников и проверкой секретов |
| `verify_archive.py` | Проверить состав, CRC и SHA-256 архива |
| `backup.py` | Согласованная приватная копия настроенной базы в `backups/` |
| `test_smtp.py` | Явная ручная проверка: отправляет одно тестовое письмо на настроенный адрес |

Команды упаковки и backup также доступны через Makefile. Runtime локального webhook находится в `backend/app/webhook_demo.py`; отдельно он запускается как `.venv/bin/python -m backend.app.webhook_demo`, а вместе с приложением — `make demo`.

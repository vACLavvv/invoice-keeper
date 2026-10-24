# Развёртывание

- `Dockerfile` — runtime-образ из `backend/` и `frontend/`; контекст сборки — корень репозитория.
- `compose.prod.yaml` — отдельный production-профиль Invoice Keeper; существующие лимиты, порты и каталоги данных сохранены.
- `nginx.*.conf` — конфигурации собственного домена и HTTPS-прокси.
- `*.service`, `*.timer`, `backup_database.py`, `renew_certificate.py`, `keeper.sh`, `nginx-logrotate.conf` — эксплуатация, backup, сертификаты и ротация.
- `staging_acceptance.py` — Linux-проверка образа на отдельной базе с отключёнными внешними каналами.
- `telegram_acceptance.py` — проверка логики бота в контейнере без сети и настоящих секретов.
- `verify_isolation.py` — сравнение соседних сервисов с ранее сохранённым baseline на существующем VPS.

## Локальная сборка

Из корня проекта:

```sh
docker build -f deploy/Dockerfile -t invoice-keeper:local .
docker compose config --quiet
docker compose up -d --build keeper
```

Локальный Compose уже указывает этот Dockerfile. Настоящий `.env` не входит в build context: `.dockerignore` пропускает только runtime-исходники и зависимости.

## Обновление production

Используйте образ и Compose из **одного релиза**: новая точка запуска — `python -m backend.app.run`, старый образ с пакетом `app` её не содержит. Не заменяйте production Compose отдельно от образа.

Соберите новый уникальный тег с ограничениями ресурсов, выполните staging, создайте online backup и только после этого переключите свой Compose-проект. Корневая структура контейнера: `/app/backend`, `/app/frontend`; приватные данные — `/data`. Миграция для перестройки каталогов не нужна: схема остаётся v4. Секреты, пользовательские данные и чужие проекты не входят в исходный архив.

Полный runbook, пути и границы действующего VPS: [DEPLOYMENT.md](../docs/DEPLOYMENT.md). Реорганизация локального репозитория не переключает production автоматически.

# Структура репозитория

```text
invoice-keeper/
├── backend/
│   ├── app/                   # Python-пакет backend.app
│   │   ├── main.py            # FastAPI, API и выдача защищённых страниц
│   │   ├── run.py             # Единая точка запуска
│   │   ├── config.py          # Настройки и пути от корня проекта
│   │   ├── db.py              # SQLite и миграции
│   │   ├── domain.py          # Периоды, суммы и правила платежей
│   │   ├── security.py        # Пароли и сессии
│   │   ├── telegram*.py       # Бот, команды и кнопки
│   │   ├── notifications.py   # Email, webhook и уведомления панели
│   │   └── webhook_demo.py    # Дочерний локальный приёмник
│   ├── requirements.txt       # Зафиксированные runtime-зависимости
│   ├── requirements-dev.txt   # Дополнения для разработки и тестов
│   └── README.md
├── frontend/
│   ├── pages/                 # HTML: панель, вход и Swagger
│   ├── assets/
│   │   ├── css/               # Оформление и темы
│   │   ├── js/                # Поведение интерфейса
│   │   ├── fonts/             # Шрифты и лицензии
│   │   └── vendor/            # Локальные библиотеки Swagger
│   └── README.md
├── tests/                     # API, интеграции, безопасность, запуск и упаковка
├── scripts/                   # OpenAPI, архив, backup и ручная SMTP-проверка
├── deploy/                    # Dockerfile, production Compose, Nginx, systemd
├── docs/                      # ТЗ, архитектура, инструкции и протоколы проверок
├── compose.yaml               # Локальный Docker Compose
├── Makefile                   # Общие команды разработки
├── pyproject.toml             # Настройки тестов
├── .env.example               # Публичный пример настроек
└── README.md                  # Входная инструкция
```

Приватные и создаваемые файлы находятся в `.env`, `data/`, `backups/`, `.venv/`, `tmp/`, `output/`. Они игнорируются Git и исключаются из передаваемого архива. Перестройка исходников не переносит и не меняет рабочую базу или секреты.

Все команды выполняются из корня. Быстрый список — `make help`; основной запуск — `make run`, тесты — `make test`, передача исходников — `make package`. Без make используйте команды из [README](../README.md).

Backend обслуживает frontend на том же origin: адреса `/`, `/login`, `/api/v1/` сохранены. Исходные HTML не находятся в публичном assets-каталоге. В контейнере сохраняется та же структура `/app/backend` + `/app/frontend`; база и логи находятся в отдельном `/data`.

Реорганизация не требует миграции БД: схема остаётся v4. Существующая production-версия запускается из своего неизменного release-каталога. Перенос локальных файлов сам по себе не обновляет VPS; для следующего релиза используйте `docker build -f deploy/Dockerfile ...` и новый production Compose из того же релиза.

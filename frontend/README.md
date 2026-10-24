# Frontend

Интерфейс на HTML, CSS и JavaScript без отдельной сборки и Node.js в runtime.

- `pages/index.html` — авторизованная рабочая панель.
- `pages/login.html` — вход.
- `pages/docs.html` — страница Swagger; backend проверяет вход перед выдачей.
- `assets/js/` — приложение, авторизация, переключение темы и инициализация Swagger.
- `assets/css/` — базовые стили, темы и оформление рабочего пространства.
- `assets/fonts/` — локальный Inter с лицензией.
- `assets/vendor/swagger/` — локальные зависимости Swagger с лицензией.
- `assets/favicon.svg` — значок приложения.

Запуск из корня: `make run` или `.venv/bin/python -m backend.app.run`. Backend выдаёт страницы после проверки доступа и публикует ресурсы по `/assets/`; Swagger — по `/swagger-assets/`. API располагается на том же origin по `/api/v1/`. Открытие HTML через file:// не заменяет запуск приложения.

Зависимости браузера обслуживаются локально. Для изменения дизайна редактируйте CSS/HTML; для поведения — JavaScript. Серверные обработчики и токены не должны попадать в этот каталог.

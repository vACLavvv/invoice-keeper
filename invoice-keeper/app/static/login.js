const form = document.querySelector('#login-form');
document.querySelector('#toggle-password').addEventListener('click', (event) => {
  const input = document.querySelector('#password');
  input.type = input.type === 'password' ? 'text' : 'password';
  event.target.textContent = input.type === 'password' ? 'Показать' : 'Скрыть';
  event.target.setAttribute('aria-label', input.type === 'password' ? 'Показать пароль' : 'Скрыть пароль');
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('[type=submit]');
  const error = document.querySelector('#login-error');
  button.disabled = true;
  button.textContent = 'Входим…';
  error.hidden = true;
  try {
    const response = await fetch('/api/v1/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(Object.fromEntries(new FormData(form)))});
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Проверьте логин и пароль');
    window.location.assign('/');
  } catch (e) {
    error.textContent = e instanceof TypeError ? 'Нет связи с сервером. Попробуйте ещё раз.' : e.message;
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Войти в панель ↗';
  }
});

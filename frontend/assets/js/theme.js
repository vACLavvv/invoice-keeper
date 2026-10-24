'use strict';
(() => {
  const key = 'invoice-keeper-theme';
  const root = document.documentElement;
  const valid = (value) => value === 'light' || value === 'dark';

  function apply(theme) {
    root.dataset.theme = valid(theme) ? theme : 'light';
    const action = root.dataset.theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-label', action);
      button.title = action;
      const label = button.querySelector('.theme-toggle-label');
      if (label) label.textContent = action;
    });
  }

  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Private storage may be unavailable. */ }
  apply(saved);
  document.addEventListener('DOMContentLoaded', () => apply(root.dataset.theme), {once: true});
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-theme-toggle]')) return;
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(theme);
    try { localStorage.setItem(key, theme); } catch { /* The current page still switches. */ }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();

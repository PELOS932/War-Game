import { boot } from './app/app';

boot().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('boot-error');
  if (el) {
    el.style.display = 'flex';
    el.textContent = `Failed to start Sovereign Command 2030:\n\n${err instanceof Error ? err.stack ?? err.message : String(err)}`;
  }
});

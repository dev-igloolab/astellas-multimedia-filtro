import { mountAdmin } from './admin.js';
document.addEventListener('astro:page-load', () => {
  const app = document.querySelector('#admin-app');
  if (app) mountAdmin(app);
});

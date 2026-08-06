import { startApp } from './app-controller.js';
startApp().catch((error) => {
  console.error(error);
  const loading = document.getElementById('loadingScreen');
  if (loading) loading.innerHTML = '<strong>Die App konnte nicht gestartet werden.</strong><span>Bitte Seite neu laden oder den Katalog prüfen.</span>';
});

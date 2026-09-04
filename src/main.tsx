import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/montserrat';
import App from './App';
import './style.css';
const root = createRoot(document.getElementById('root')!);
if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has('scene-lab')
) {
  void import('./SceneLab').then(({ default: Lab }) => root.render(<Lab />));
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const register = () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

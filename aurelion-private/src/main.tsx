import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { boot } from './store/store';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
boot();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}); });
}

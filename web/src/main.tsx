import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/app/App';
import { ROUTER_FUTURE } from '@/app/routerFuture';
import '@/styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('#root bulunamadı.');
}

createRoot(container).render(
  <StrictMode>
    {/* Bayraklar testlerdeki MemoryRouter ile AYNI sabitten gelir. */}
    <BrowserRouter future={ROUTER_FUTURE}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

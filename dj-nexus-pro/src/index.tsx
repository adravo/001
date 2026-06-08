// ─────────────────────────────────────────────────────────────────────────────
// DJ Nexus Pro — React 18 entry point
// ─────────────────────────────────────────────────────────────────────────────

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// ── Mount ─────────────────────────────────────────────────────────────────────

const container = document.getElementById('root');

if (!container) {
  throw new Error(
    '[DJ Nexus Pro] Root element #root not found. ' +
    'Make sure public/index.html contains <div id="root"></div>.',
  );
}

const root = createRoot(container);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ── Hot Module Replacement (Vite) ─────────────────────────────────────────────

if (import.meta.hot) {
  import.meta.hot.accept();
}

// main.js — application entry point. This is the ONLY script the HTML loads.
//
// Importing auth.js runs its top-level onAuthStateChanged() registration, which
// re-renders the app whenever the sign-in state changes. We also call renderApp()
// once here so the page paints immediately, before Firebase resolves the session.

import './auth.js';
import { renderApp } from './layout.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    renderApp();
  });
} else {
  renderApp();
}

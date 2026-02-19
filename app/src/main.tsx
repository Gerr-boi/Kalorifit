import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

const bootStatus = document.getElementById('boot-status');
window.addEventListener('unhandledrejection', (event) => {
  if (!bootStatus) return;
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  bootStatus.innerHTML = `<strong>Unhandled promise rejection:</strong> ${reason}`;
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

window.setTimeout(() => {
  const root = document.getElementById('root');
  if (!bootStatus || !root) return;
  if (root.childElementCount > 1) {
    bootStatus.remove();
  }
}, 1200);

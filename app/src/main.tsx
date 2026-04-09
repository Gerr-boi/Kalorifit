import { StrictMode } from 'react'
import * as ReactDOMClient from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

const bootStatus = document.getElementById('boot-status');
window.addEventListener('unhandledrejection', (event) => {
  if (!bootStatus) return;
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  bootStatus.innerHTML = `<strong>Unhandled promise rejection:</strong> ${reason}`;
});

ReactDOMClient.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

window.setTimeout(() => {
  // If boot-status is still present but React has mounted, remove it as a fallback
  // (App.tsx's useEffect handles the normal case via requestAnimationFrame)
  const boot = document.getElementById('boot-status');
  if (boot && document.getElementById('root')?.children[0] !== boot) {
    boot.remove();
  }
}, 1200);

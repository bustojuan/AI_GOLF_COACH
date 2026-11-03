import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './coach-report.css';
import './performance.css';
import './studio-dark.css';
import './golf-motion.css';
import './desktop-performance.css';

const TrackingDemo = lazy(() => import('./components/landing/TrackingDemo'));
const demo = new URLSearchParams(window.location.search).get('portada') === 'demo';

createRoot(document.getElementById('root')!).render(<StrictMode>{demo
  ? <Suspense fallback={<p className="studio-demo-loading">Preparando la demostración…</p>}><TrackingDemo /></Suspense>
  : <App />}</StrictMode>);

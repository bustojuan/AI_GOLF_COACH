import type { ReactNode } from 'react';
import type { SwingResult } from '../../types/swing';
import StudioSwing from './StudioSwing';

export default function StudioLanding({ children, preview, result, busy }: {
  children: ReactNode; preview: string; result: SwingResult | null; busy: boolean;
}) {
  const state = result ? 'complete' : busy ? 'processing' : preview ? 'selected' : 'welcome';

  return <section className={`studio-landing studio-state-${state}`} aria-label="Tu swing, otra perspectiva">
    <div className="studio-ground" aria-hidden="true" />
    <div className="studio-copy">
      <p className="studio-eyebrow">GOLF. DATOS. PROGRESO.</p>
      <h2 className="studio-title"><span className="studio-title-line"><span>Tu swing.</span></span>
        <span className="studio-title-line"><em>Otra perspectiva.</em></span></h2>
      <p className="studio-description">Descubre tu movimiento.<br />Encuentra tu siguiente paso.</p>
      <div className="studio-upload">{children}</div>
      <div className="studio-links"><a href="?portada=demo">Ver una demostración real <span aria-hidden="true">↗</span></a>
        <a href="?portada=anterior">Portada anterior</a></div>
    </div>
    <div className="studio-scene"><StudioSwing /></div>
  </section>;
}

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => {
  console.error('Angular Bootstrap Error:', err);

  // Mostrar error completo con stack trace para diagnóstico
  const stack = err?.stack || err?.message || String(err);
  const code = err?.code || 'SIN_CÓDIGO';

  document.body.innerHTML = `
    <div style="padding:2rem; background:#c53030; color:#fff; font-family:monospace; max-width:900px; margin:2rem auto; border-radius:8px; font-size:13px;">
      <h2 style="margin:0 0 1rem; font-family:sans-serif;">⚠️ Error al iniciar — Código: ${code}</h2>
      <p style="background:rgba(0,0,0,0.3); padding:0.75rem; border-radius:4px; margin:0 0 1rem; font-family:sans-serif;">
        ${err?.message || 'Error desconocido'}
      </p>
      <details open>
        <summary style="cursor:pointer; font-family:sans-serif; margin-bottom:0.5rem;">Stack trace completo:</summary>
        <pre style="overflow:auto; white-space:pre-wrap; background:rgba(0,0,0,0.4); padding:1rem; border-radius:4px; max-height:400px; font-size:11px;">${stack}</pre>
      </details>
      <p style="margin:1rem 0 0; opacity:0.8; font-family:sans-serif; font-size:12px;">
        Abre DevTools (F12 → Console) para más detalles.
      </p>
    </div>
  `;
});

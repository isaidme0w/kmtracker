import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '../common/styles.css';
import { AppProvider } from '../common/app.tsx';
import { ConfirmProvider } from '../common/components/confirm.tsx';
import { Toasts } from '../common/components/ui.tsx';
import { ClientApp } from './ClientApp.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider base="/api">
      <ConfirmProvider>
        <BrowserRouter>
          <ClientApp />
        </BrowserRouter>
        <Toasts />
      </ConfirmProvider>
    </AppProvider>
  </StrictMode>,
);

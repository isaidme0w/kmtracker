import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '../common/styles.css';
import { AppProvider } from '../common/app.tsx';
import { ConfirmProvider } from '../common/components/confirm.tsx';
import { Toasts } from '../common/components/ui.tsx';
import { AdminApp } from './AdminApp.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider base="/api/admin">
      <ConfirmProvider>
        <BrowserRouter basename="/admin">
          <AdminApp />
        </BrowserRouter>
        <Toasts />
      </ConfirmProvider>
    </AppProvider>
  </StrictMode>,
);

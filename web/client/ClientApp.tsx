import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import type { StatusDto } from '../../shared/api.ts';
import { SETUP_PATH, request } from '../common/api.ts';
import { useApp } from '../common/app.tsx';
import { AuthLayout, ForcedPasswordChange, LoginForm } from '../common/auth.tsx';
import { LoadingBlock } from '../common/components/ui.tsx';
import { Layout } from './Layout.tsx';
import { Dashboard } from './Dashboard.tsx';
import { History } from './History.tsx';
import { SettingsPage } from '../common/SettingsPage.tsx';

export function ClientApp() {
  const { me, loading, t } = useApp();

  useEffect(() => {
    request<StatusDto>('GET', '/api/status')
      .then((status) => {
        if (status.setupRequired) window.location.assign(SETUP_PATH);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.title = 'KM Tracker';
  }, []);

  if (loading) return <LoadingBlock />;
  if (!me) {
    return (
      <AuthLayout>
        <LoginForm title={t.auth.signInTitle} />
      </AuthLayout>
    );
  }
  if (me.account.mustChangePassword) return <ForcedPasswordChange />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="history" element={<History />} />
        <Route path="history/:cycleId" element={<History />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

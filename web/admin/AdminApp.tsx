import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { StatusDto } from '../../shared/api.ts';
import { request } from '../common/api.ts';
import { useApp } from '../common/app.tsx';
import { AuthLayout, ForcedPasswordChange, LoginForm } from '../common/auth.tsx';
import { SettingsPage } from '../common/SettingsPage.tsx';
import { LoadingBlock } from '../common/components/ui.tsx';
import { AdminLayout } from './AdminLayout.tsx';
import { SetupWizard } from './SetupWizard.tsx';
import { Overview } from './Overview.tsx';
import { ActivityLog } from './ActivityLog.tsx';
import { Users } from './Users.tsx';
import { People } from './People.tsx';
import { Cycles } from './Cycles.tsx';
import { CycleDetail } from './CycleDetail.tsx';
import { AppSettings } from './AppSettings.tsx';

export function AdminApp() {
  const { me, loading, t } = useApp();
  const [status, setStatus] = useState<StatusDto | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    request<StatusDto>('GET', '/api/status')
      .then(setStatus)
      .catch(() => setStatus({ setupRequired: false, version: '' }));
  }, []);

  useEffect(() => {
    document.title = `KM Tracker – ${t.admin.panel}`;
  }, [t]);

  useEffect(() => {
    if (!status) return;
    if (status.setupRequired && location.pathname !== '/setup') navigate('/setup', { replace: true });
    if (!status.setupRequired && location.pathname === '/setup') navigate('/', { replace: true });
  }, [status, location.pathname, navigate]);

  if (!status || loading) return <LoadingBlock />;
  if (status.setupRequired) return <SetupWizard onDone={() => setStatus({ ...status, setupRequired: false })} />;
  if (!me) {
    return (
      <AuthLayout>
        <LoginForm title={t.auth.panelSignInTitle} />
      </AuthLayout>
    );
  }
  if (me.account.mustChangePassword) return <ForcedPasswordChange />;

  return (
    <Routes>
      <Route element={<AdminLayout version={status.version} />}>
        <Route index element={<Overview />} />
        <Route path="activity" element={<ActivityLog />} />
        <Route path="users" element={<Users />} />
        <Route path="people" element={<People />} />
        <Route path="cycles" element={<Cycles />} />
        <Route path="cycles/:cycleId" element={<CycleDetail />} />
        <Route path="settings" element={<AppSettings />} />
        <Route path="account" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

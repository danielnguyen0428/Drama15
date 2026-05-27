import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';

/**
 * Admin_Console root component.
 *
 * Routing is intentionally minimal at wave-0 scaffold time:
 *   - `/login` renders the TOTP-aware login form shell (Requirement 16.1).
 *   - `/`      redirects to `/login` until the authenticated dashboard
 *              shells are introduced in task 18.x.
 *
 * Authentication state, TOTP verification, and protected admin routes
 * (account lookup, plan upgrade/revoke, audit log) are implemented in
 * tasks 5.11, 5.12, and 18.1+.
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

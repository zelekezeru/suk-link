import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '../features/auth/useSession';
import type { UserRole } from '../lib/database.types';

export function getHomeRouteForRole(role: UserRole): string {
  if (role === 'shop_owner') return '/s/dashboard';
  if (role === 'admin') return '/a/overview';
  return '/c/home';
}

export function RequireRole({
  allowedRole,
  children,
}: {
  allowedRole: UserRole;
  children: React.ReactNode;
}) {
  const user = useSessionStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/welcome" state={{ from: location }} replace />;
  }

  // Route guards redirect a user on the wrong path to their own home page (Section 2)
  if (user.role !== allowedRole) {
    return <Navigate to={getHomeRouteForRole(user.role)} replace />;
  }

  return <>{children}</>;
}

export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const user = useSessionStore((s) => s.user);
  if (user) {
    return <Navigate to={getHomeRouteForRole(user.role)} replace />;
  }
  return <>{children}</>;
}

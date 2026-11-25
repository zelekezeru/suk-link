import { createBrowserRouter, createHashRouter, Navigate } from 'react-router-dom';
import { IS_STATIC_DEMO } from '../lib/supabase';
import { RequireRole, RedirectIfAuthenticated, getHomeRouteForRole } from './guards';
import { CustomerLayout, ShopLayout, AdminLayout } from './layouts/AppLayouts';
import {
  WelcomePage,
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
} from '../features/auth/AuthPages';
import {
  CustomerHomePage,
  CustomerShopPage,
  CustomerCartPage,
  CustomerOrdersPage,
  CustomerOrderDetailPage,
  CustomerBalancesPage,
} from '../features/customer/CustomerPages';
import {
  ShopSetupOrProfilePage,
  ShopDashboardPage,
  ShopOrdersPage,
  ShopOrderDetailPage,
  ShopProductsPage,
  ShopCustomersPage,
  ShopCustomerDetailPage,
  ShopSubscriptionPage,
  ShopMorePage,
} from '../features/shop/ShopPages';
import {
  AdminOverviewPage,
  AdminUsersPage,
  AdminShopsAndSubscriptionsPage,
  AdminConfigPage,
  AdminTicketsPage,
} from '../features/admin/AdminPages';
import { DemoPayPage, PaymentConfirmPage } from '../features/payments/PaymentFlows';
import { ProfilePage, SupportPage } from '../features/support/ProfileAndSupport';
import { DevUiGallery } from '../components/ui/DevUiGallery';
import { useSessionStore } from '../features/auth/useSession';

function RootIndexRedirect() {
  const user = useSessionStore((s) => s.user);
  if (!user) return <Navigate to="/welcome" replace />;
  return <Navigate to={getHomeRouteForRole(user.role)} replace />;
}

const createAppRouter = IS_STATIC_DEMO ? createHashRouter : createBrowserRouter;

export const appRouter = createAppRouter([
  {
    path: '/',
    element: <RootIndexRedirect />,
  },
  {
    path: '/welcome',
    element: (
      <RedirectIfAuthenticated>
        <WelcomePage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/login',
    element: (
      <RedirectIfAuthenticated>
        <LoginPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/register',
    element: (
      <RedirectIfAuthenticated>
        <RegisterPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/pay/demo/:paymentId',
    element: <DemoPayPage />,
  },
  {
    path: '/dev/ui',
    element: <DevUiGallery />,
  },
  // Customer routes (/c/*)
  {
    path: '/c',
    element: (
      <RequireRole allowedRole="customer">
        <CustomerLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <Navigate to="/c/home" replace /> },
      { path: 'home', element: <CustomerHomePage /> },
      { path: 'shops/:shopId', element: <CustomerShopPage /> },
      { path: 'cart/:shopId', element: <CustomerCartPage /> },
      { path: 'orders', element: <CustomerOrdersPage /> },
      { path: 'orders/:orderId', element: <CustomerOrderDetailPage /> },
      { path: 'orders/:orderId/confirm', element: <PaymentConfirmPage /> },
      { path: 'balances', element: <CustomerBalancesPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'support', element: <SupportPage /> },
    ],
  },
  // Shop Owner routes (/s/*)
  {
    path: '/s',
    element: (
      <RequireRole allowedRole="shop_owner">
        <ShopLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <Navigate to="/s/dashboard" replace /> },
      { path: 'setup', element: <ShopSetupOrProfilePage isSetupWizard /> },
      { path: 'dashboard', element: <ShopDashboardPage /> },
      { path: 'orders', element: <ShopOrdersPage /> },
      { path: 'orders/:orderId', element: <ShopOrderDetailPage /> },
      { path: 'products', element: <ShopProductsPage /> },
      { path: 'customers', element: <ShopCustomersPage /> },
      { path: 'customers/:customerId', element: <ShopCustomerDetailPage /> },
      { path: 'profile', element: <ShopSetupOrProfilePage /> },
      { path: 'subscription', element: <ShopSubscriptionPage /> },
      { path: 'support', element: <SupportPage /> },
      { path: 'account', element: <ProfilePage /> },
      { path: 'more', element: <ShopMorePage /> },
    ],
  },
  // Admin routes (/a/*)
  {
    path: '/a',
    element: (
      <RequireRole allowedRole="admin">
        <AdminLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <Navigate to="/a/overview" replace /> },
      { path: 'overview', element: <AdminOverviewPage /> },
      { path: 'users', element: <AdminUsersPage /> },
      { path: 'shops', element: <AdminShopsAndSubscriptionsPage /> },
      { path: 'subscriptions', element: <AdminShopsAndSubscriptionsPage /> },
      { path: 'config', element: <AdminConfigPage /> },
      { path: 'tickets', element: <AdminTicketsPage /> },
    ],
  },
  {
    path: '*',
    element: <RootIndexRedirect />,
  },
]);

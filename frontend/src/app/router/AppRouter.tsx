import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router';

import { canonicalPath, legacyRoutes } from '@/app/router/legacyRoutes';
import { useI18n } from '@/features/i18n/I18nContext';

import { AuthLayout } from '@/app/layouts/AuthLayout';
import { PublicLayout } from '@/app/layouts/PublicLayout';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { ArticleDetailPage } from '@/pages/ArticleDetailPage';
import { ArticlesPage } from '@/pages/ArticlesPage';
import { ContactPage } from '@/pages/ContactPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { HomePage } from '@/pages/HomePage';
import { PrivacyPage, TermsPage } from '@/pages/legal/LegalDocumentPage';
import { MealSetsPage } from '@/pages/MealSetsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { NutritionPage } from '@/pages/NutritionPage';
import { RandomMealPage } from '@/pages/RandomMealPage';
import { RecipeDetailPage } from '@/pages/RecipeDetailPage';
import { RecipesPage } from '@/pages/RecipesPage';
import { SuggestionsPage } from '@/pages/SuggestionsPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { OAuthCallbackPage } from '@/pages/auth/OAuthCallbackPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';

function RouteFallback() {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" style={{ minHeight: '40vh' }}>
      <span className="visually-hidden">{t('Đang tải…')}</span>
    </div>
  );
}

/**
 * Trang ít dùng hoặc nặng (quản trị, tài khoản, vào bếp, kế hoạch, soạn bài) tách thành chunk
 * riêng: khách xem trang công khai không phải tải và parse phần mã này.
 */
function lazyPage<Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
) {
  const Page = lazy<ComponentType>(() => load().then((module) => ({ default: module[name] })));
  function LazyPage() {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Page />
      </Suspense>
    );
  }
  LazyPage.displayName = name;
  return LazyPage;
}

const AccountLayout = lazyPage(() => import('@/pages/account/AccountLayout'), 'AccountLayout');
const AccountOverviewPage = lazyPage(
  () => import('@/pages/account/AccountOverviewPage'),
  'AccountOverviewPage',
);
const CookHistoryPage = lazyPage(
  () => import('@/pages/account/CookHistoryPage'),
  'CookHistoryPage',
);
const MyStoriesPage = lazyPage(() => import('@/pages/account/MyStoriesPage'), 'MyStoriesPage');
const MySubmissionsPage = lazyPage(
  () => import('@/pages/account/MySubmissionsPage'),
  'MySubmissionsPage',
);
const SecurityPage = lazyPage(() => import('@/pages/account/SecurityPage'), 'SecurityPage');
const SettingsPage = lazyPage(() => import('@/pages/account/SettingsPage'), 'SettingsPage');
const AdminArticlesPage = lazyPage(
  () => import('@/pages/admin/AdminArticlesPage'),
  'AdminArticlesPage',
);
const AdminAssistantPage = lazyPage(
  () => import('@/pages/admin/AdminAssistantPage'),
  'AdminAssistantPage',
);
const AdminLayout = lazyPage(() => import('@/pages/admin/AdminLayout'), 'AdminLayout');
const AdminOverviewPage = lazyPage(
  () => import('@/pages/admin/AdminOverviewPage'),
  'AdminOverviewPage',
);
const AdminPlansPage = lazyPage(() => import('@/pages/admin/AdminPlansPage'), 'AdminPlansPage');
const AdminRecipesPage = lazyPage(
  () => import('@/pages/admin/AdminRecipesPage'),
  'AdminRecipesPage',
);
const AdminSubmissionsPage = lazyPage(
  () => import('@/pages/admin/AdminSubmissionsPage'),
  'AdminSubmissionsPage',
);
const AdminSupportPage = lazyPage(
  () => import('@/pages/admin/AdminSupportPage'),
  'AdminSupportPage',
);
const AdminUserDetailPage = lazyPage(
  () => import('@/pages/admin/AdminUserDetailPage'),
  'AdminUserDetailPage',
);
const AdminUsersPage = lazyPage(() => import('@/pages/admin/AdminUsersPage'), 'AdminUsersPage');
const CookModePage = lazyPage(() => import('@/pages/CookModePage'), 'CookModePage');
const PlannerPage = lazyPage(() => import('@/pages/PlannerPage'), 'PlannerPage');
const StoryEditorPage = lazyPage(() => import('@/pages/StoryEditorPage'), 'StoryEditorPage');
const SubmitRecipePage = lazyPage(() => import('@/pages/SubmitRecipePage'), 'SubmitRecipePage');

function LegacyRedirect() {
  const location = useLocation();
  return (
    <Navigate
      replace
      to={`${canonicalPath(location.pathname)}${location.search}${location.hash}`}
    />
  );
}

const router = createBrowserRouter([
  ...Object.keys(legacyRoutes).map((path) => ({ path: `${path}/*`, element: <LegacyRedirect /> })),
  {
    // Khách xem tự do trang chủ, kho món, bữa cơm, bài viết...; chỉ các trang thao tác với
    // dữ liệu cá nhân mới yêu cầu đăng nhập và quay lại đúng trang sau khi đăng nhập.
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'recipes', element: <RecipesPage /> },
      { path: 'recipes/:slug', element: <RecipeDetailPage /> },
      { path: 'meals', element: <MealSetsPage /> },
      { path: 'random-meal', element: <RandomMealPage /> },
      {
        path: 'planner',
        element: (
          <ProtectedRoute>
            <PlannerPage />
          </ProtectedRoute>
        ),
      },
      { path: 'suggestions', element: <SuggestionsPage /> },
      { path: 'nutrition', element: <NutritionPage /> },
      { path: 'articles', element: <ArticlesPage /> },
      { path: 'articles/:slug', element: <ArticleDetailPage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'favorites', element: <FavoritesPage /> },
      {
        path: 'stories/new',
        element: (
          <ProtectedRoute>
            <StoryEditorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'stories/:id/edit',
        element: (
          <ProtectedRoute>
            <StoryEditorPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'submit-recipe',
        element: (
          <ProtectedRoute>
            <SubmitRecipePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'account',
        element: (
          <ProtectedRoute>
            <AccountLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <AccountOverviewPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'security', element: <SecurityPage /> },
          { path: 'stories', element: <MyStoriesPage /> },
          { path: 'submissions', element: <MySubmissionsPage /> },
          { path: 'cooked', element: <CookHistoryPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    // Chế độ vào bếp toàn màn hình: chữ to, điều khiển bằng giọng nói, không header/footer.
    path: 'cook',
    element: (
      <ProtectedRoute>
        <CookModePage />
      </ProtectedRoute>
    ),
  },
  {
    // Khu quản trị có khung riêng, không dùng header/footer của trang công khai.
    path: 'admin',
    element: (
      <ProtectedRoute allow={['admin']}>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminOverviewPage /> },
      { path: 'users', element: <AdminUsersPage /> },
      { path: 'users/:userId', element: <AdminUserDetailPage /> },
      { path: 'plans', element: <AdminPlansPage /> },
      { path: 'recipes', element: <AdminRecipesPage /> },
      { path: 'articles', element: <AdminArticlesPage /> },
      { path: 'articles/new', element: <StoryEditorPage /> },
      { path: 'articles/:id/edit', element: <StoryEditorPage /> },
      { path: 'submissions', element: <AdminSubmissionsPage /> },
      { path: 'support', element: <AdminSupportPage /> },
      { path: 'assistant', element: <AdminAssistantPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'security', element: <SecurityPage /> },
      { path: '*', element: <Navigate replace to="/admin" /> },
    ],
  },
  // Văn bản pháp lý công khai: người chưa đăng nhập phải đọc được trước khi đăng ký.
  { path: 'privacy', element: <PrivacyPage /> },
  { path: 'terms', element: <TermsPage /> },
  {
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'oauth-callback', element: <OAuthCallbackPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

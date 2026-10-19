import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router';

import { canonicalPath, legacyRoutes } from '@/app/router/legacyRoutes';

import { AuthLayout } from '@/app/layouts/AuthLayout';
import { PublicLayout } from '@/app/layouts/PublicLayout';
import { useAuth } from '@/features/auth/AuthContext';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AccountLayout } from '@/pages/account/AccountLayout';
import { AccountOverviewPage } from '@/pages/account/AccountOverviewPage';
import { MyStoriesPage } from '@/pages/account/MyStoriesPage';
import { MySubmissionsPage } from '@/pages/account/MySubmissionsPage';
import { SecurityPage } from '@/pages/account/SecurityPage';
import { SettingsPage } from '@/pages/account/SettingsPage';
import { AdminArticlesPage } from '@/pages/admin/AdminArticlesPage';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage';
import { AdminPlansPage } from '@/pages/admin/AdminPlansPage';
import { AdminRecipesPage } from '@/pages/admin/AdminRecipesPage';
import { AdminSubmissionsPage } from '@/pages/admin/AdminSubmissionsPage';
import { AdminSupportPage } from '@/pages/admin/AdminSupportPage';
import { AdminUserDetailPage } from '@/pages/admin/AdminUserDetailPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';
import { ArticleDetailPage } from '@/pages/ArticleDetailPage';
import { ArticlesPage } from '@/pages/ArticlesPage';
import { ContactPage } from '@/pages/ContactPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { HomePage } from '@/pages/HomePage';
import { MealSetsPage } from '@/pages/MealSetsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { NutritionPage } from '@/pages/NutritionPage';
import { PlannerPage } from '@/pages/PlannerPage';
import { RandomMealPage } from '@/pages/RandomMealPage';
import { RecipeDetailPage } from '@/pages/RecipeDetailPage';
import { RecipesPage } from '@/pages/RecipesPage';
import { StoryEditorPage } from '@/pages/StoryEditorPage';
import { SubmitRecipePage } from '@/pages/SubmitRecipePage';
import { SuggestionsPage } from '@/pages/SuggestionsPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { OAuthCallbackPage } from '@/pages/auth/OAuthCallbackPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';

function LegacyRedirect() {
  const location = useLocation();
  return (
    <Navigate
      replace
      to={`${canonicalPath(location.pathname)}${location.search}${location.hash}`}
    />
  );
}

/** Khi mở ứng dụng mà chưa đăng nhập thì vào thẳng trang đăng nhập. */
function HomeRoute() {
  const { isLoading, user } = useAuth();
  if (!isLoading && !user) return <Navigate replace to="/login" />;
  return <HomePage />;
}

const router = createBrowserRouter([
  ...Object.keys(legacyRoutes).map((path) => ({ path: `${path}/*`, element: <LegacyRedirect /> })),
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomeRoute /> },
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
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
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
      { path: 'settings', element: <SettingsPage /> },
      { path: 'security', element: <SecurityPage /> },
      { path: '*', element: <Navigate replace to="/admin" /> },
    ],
  },
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

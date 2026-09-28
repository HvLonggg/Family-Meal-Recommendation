import { createBrowserRouter, RouterProvider } from 'react-router';

import { AuthLayout } from '@/app/layouts/AuthLayout';
import { PublicLayout } from '@/app/layouts/PublicLayout';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AccountPage } from '@/pages/AccountPage';
import { AdminPage } from '@/pages/AdminPage';
import { ArticlesPage } from '@/pages/ArticlesPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { HomePage } from '@/pages/HomePage';
import { MealSetsPage } from '@/pages/MealSetsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { NutritionPage } from '@/pages/NutritionPage';
import { PlannerPage } from '@/pages/PlannerPage';
import { RecipeDetailPage } from '@/pages/RecipeDetailPage';
import { RecipesPage } from '@/pages/RecipesPage';
import { SubmitRecipePage } from '@/pages/SubmitRecipePage';
import { SuggestionsPage } from '@/pages/SuggestionsPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { OAuthCallbackPage } from '@/pages/auth/OAuthCallbackPage';
import { PhoneLoginPage } from '@/pages/auth/PhoneLoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'mon-an', element: <RecipesPage /> },
      { path: 'mon-an/:slug', element: <RecipeDetailPage /> },
      { path: 'bua-com', element: <MealSetsPage /> },
      { path: 'ke-hoach', element: <PlannerPage /> },
      { path: 'goi-y', element: <SuggestionsPage /> },
      { path: 'dinh-duong', element: <NutritionPage /> },
      { path: 'bai-viet', element: <ArticlesPage /> },
      { path: 'yeu-thich', element: <FavoritesPage /> },
      {
        path: 'de-xuat-mon',
        element: (
          <ProtectedRoute>
            <SubmitRecipePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'tai-khoan',
        element: (
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'quan-tri',
        element: (
          <ProtectedRoute allow={['admin']}>
            <AdminPage />
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: 'dang-nhap', element: <LoginPage /> },
      { path: 'dang-ky', element: <RegisterPage /> },
      { path: 'quen-mat-khau', element: <ForgotPasswordPage /> },
      { path: 'dat-lai-mat-khau', element: <ResetPasswordPage /> },
      { path: 'dang-nhap-so-dien-thoai', element: <PhoneLoginPage /> },
      { path: 'xac-thuc-google', element: <OAuthCallbackPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

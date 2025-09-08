// mapsprove/frontend/src/main.tsx (ou seu arquivo de rotas)
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Setup from './pages/Setup';

const router = createBrowserRouter([
  { path: '/setup', element: <Setup /> },
  // ...suas outras rotas
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

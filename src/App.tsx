
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard, Products, Ingredients, FixedCosts, Channels, Fees, BusinessData, ResaleProducts } from './pages';
import { Combos } from './pages/Combos';
import { Plans } from './pages/Plans';
import { CmvAnalysis } from './pages/CmvAnalysis';
import { Login } from './pages/auth/Login';
import { Signup } from './pages/auth/Signup';
import { Onboarding } from './pages/auth/Onboarding';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

function ProtectedRoute() {
  const { user, loading, companyId } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!companyId) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route element={<ProtectedRouteContext />}>
              <Route path="/onboarding" element={<OnboardingPageWrapper />} />
            </Route>

            {/* Main App Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="products" element={<Products />} />
                <Route path="ingredients" element={<Ingredients />} />
                <Route path="fixed-costs" element={<FixedCosts />} />
                <Route path="channels" element={<Channels />} />
                <Route path="fees" element={<Fees />} />
                <Route path="cmv-analysis" element={<CmvAnalysis />} />
                <Route path="data" element={<BusinessData />} />
                <Route path="drinks" element={<ResaleProducts />} />
                <Route path="combos" element={<Combos />} />
                <Route path="plans" element={<Plans />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

// Helper to handle Onboarding protection (User exists but maybe no company)
// We need a separate component because ProtectedRoute redirects TO onboarding if no company.
// If we use ProtectedRoute for onboarding, it creates a loop if we are not careful.
function OnboardingPageWrapper() {
  const { user, loading, companyId } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (companyId) return <Navigate to="/" replace />; // Already has company

  return <Onboarding />;
}

// Helper to just check auth for onboarding route
function ProtectedRouteContext() {
  return <Outlet />;
}


export default App;


import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard, Products, Ingredients, FixedCosts, Channels, Fees, BusinessData, ResaleProducts } from './pages';
import { Combos } from './pages/Combos';
import { Plans } from './pages/Plans';
import { CmvAnalysis } from './pages/CmvAnalysis';
import { VariableCosts } from './pages/VariableCosts';
import { Performance } from './pages/Performance';
import { Login } from './pages/auth/Login';
import { Signup } from './pages/auth/Signup';
import { Onboarding } from './pages/auth/Onboarding';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { FeatureLocked } from './components/subscription/FeatureLocked';
import { useSubscription } from './hooks/useSubscription';

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

/** Route wrapper that checks a feature flag before rendering the element */
function FeatureRoute({ flag, element, requiredPlan = 'Pro' }: {
  flag: string;
  element: React.ReactElement;
  requiredPlan?: 'Pro' | 'Premium';
}) {
  const { canAccess, loading } = useSubscription();

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">Carregando...</div>
    );
  }

  if (!canAccess(flag)) {
    return <FeatureLocked requiredPlan={requiredPlan} />;
  }

  return element;
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
                <Route path="fixed-costs" element={<FeatureRoute flag="fixed_costs" element={<FixedCosts />} />} />
                <Route path="variable-costs" element={<FeatureRoute flag="variable_costs" element={<VariableCosts />} />} />
                <Route path="channels" element={<FeatureRoute flag="channels" element={<Channels />} />} />
                <Route path="fees" element={<FeatureRoute flag="fees" element={<Fees />} />} />
                <Route path="cmv-analysis" element={<CmvAnalysis />} />
                <Route path="data" element={<BusinessData />} />
                <Route path="drinks" element={<ResaleProducts />} />
                <Route path="combos" element={<FeatureRoute flag="combos" element={<Combos />} />} />
                <Route path="performance" element={<FeatureRoute flag="insights" element={<Performance />} />} />
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
function OnboardingPageWrapper() {
  const { user, loading, companyId } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (companyId) return <Navigate to="/" replace />;

  return <Onboarding />;
}

// Helper to just check auth for onboarding route
function ProtectedRouteContext() {
  return <Outlet />;
}


export default App;

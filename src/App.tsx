import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard, Products, Ingredients, FixedCosts, Channels, Fees, BusinessData, ResaleProducts } from './pages';
import { Combos } from './pages/Combos';
import { CmvAnalysis } from './pages/CmvAnalysis';

function App() {
  return (
    <BrowserRouter>
      <Routes>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

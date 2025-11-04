import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { Login } from './pages/Login'
import { SignUp } from './pages/SignUp'
import { Overview } from './pages/Dashboard/Overview'
import { ScrapingTasks } from './pages/Dashboard/ScrapingTasks'
import { PriceChanges } from './pages/Dashboard/PriceChanges'
import { ShopifyUpdates } from './pages/Dashboard/ShopifyUpdates'
import { Reconciliation } from './pages/Dashboard/Reconciliation'
import { ActionsRequired } from './pages/Dashboard/ActionsRequired'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Overview />} />
            <Route path="scraping" element={<ScrapingTasks />} />
            <Route path="prices" element={<PriceChanges />} />
            <Route path="shopify" element={<ShopifyUpdates />} />
            <Route path="reconciliation" element={<Reconciliation />} />
            <Route path="actions" element={<ActionsRequired />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { Login } from './pages/Login'
import { SetPassword } from './pages/SetPassword'
import { AuthCallback } from './pages/AuthCallback'
import { ResetPassword } from './pages/ResetPassword'
import { Overview } from './pages/Dashboard/Overview'
import { ScrapingTasks } from './pages/Dashboard/ScrapingTasks'
import { PriceChanges } from './pages/Dashboard/PriceChanges'
import { PriceComparison } from './pages/Dashboard/PriceComparison'
import { ShopifyUpdates } from './pages/Dashboard/ShopifyUpdates'
import { ActionsRequired } from './pages/Dashboard/ActionsRequired'
import { Discoveries } from './pages/Dashboard/Discoveries'
import { UserManagement } from './pages/Admin/UserManagement'

// Component to handle root URL with potential Supabase auth hash parameters
const RootRedirect: React.FC = () => {
  const navigate = useNavigate()

  useEffect(() => {
    // Check if URL has Supabase auth hash parameters
    const hash = window.location.hash
    if (hash && (hash.includes('access_token') || hash.includes('type='))) {
      // Redirect to auth callback with the hash preserved
      navigate(`/auth/callback${hash}`, { replace: true })
    } else {
      // Normal redirect to dashboard
      navigate('/dashboard', { replace: true })
    }
  }, [navigate])

  // Show loading while redirecting
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
            <Route path="price-comparison" element={<PriceComparison />} />
            <Route path="shopify" element={<ShopifyUpdates />} />
            <Route path="actions" element={<ActionsRequired />} />
            <Route path="discoveries" element={<Discoveries />} />
            <Route
              path="admin"
              element={
                <ProtectedRoute requiredRole="superuser">
                  <UserManagement />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

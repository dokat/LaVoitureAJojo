// Routes v1 (milestone 3) : login public, tout le reste protégé.
// basename = BASE_URL pour que react-router fonctionne aussi sous le
// sous-chemin GitHub Pages /<dépôt>/ (D17, notes milestone 8).
import { BrowserRouter, Route, Routes } from 'react-router'
import { AccountPage } from '@/features/auth/AccountPage'
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

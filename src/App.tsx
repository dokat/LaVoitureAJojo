// Routes v1 : login public, tout le reste protégé dans le layout mobile
// (milestone 5 : dashboard, historique, saisie ; compte = écran D8/M3).
// Milestone 6 : /admin/vehicules, sous garde RequireAdmin (D8).
// Milestone 7 : /en-attente, écran de la file hors-ligne (D13).
// basename = BASE_URL pour que react-router fonctionne aussi sous le
// sous-chemin GitHub Pages /<dépôt>/ (D17, notes milestone 8).
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from '@/components/AppShell'
import { AccountPage } from '@/features/auth/AccountPage'
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAdmin } from '@/features/auth/RequireAdmin'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { HistoryPage } from '@/features/history/HistoryPage'
import { PendingPage } from '@/features/offline/PendingPage'
import { AddReadingPage } from '@/features/readings/AddReadingPage'
import { VehiclesAdminPage } from '@/features/vehicle/VehiclesAdminPage'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="saisie" element={<AddReadingPage />} />
            <Route path="historique" element={<HistoryPage />} />
            <Route path="en-attente" element={<PendingPage />} />
            <Route path="compte" element={<AccountPage />} />
            <Route
              path="admin/vehicules"
              element={
                <RequireAdmin>
                  <VehiclesAdminPage />
                </RequireAdmin>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

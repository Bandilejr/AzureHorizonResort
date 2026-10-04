import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/hooks/useAuth'; 
import { LandingPage } from '@/pages/LandingPage';
import { GuestPortal } from '@/pages/GuestPortal';
import { FrontDeskDashboard } from '@/pages/FrontDeskDashboard';
import { KitchenDisplay } from '@/pages/KitchenDisplay';
import { ServiceDashboard } from '@/pages/ServiceDashboard';
import { MaintenancePortal } from '@/pages/MaintenancePortal';
import { AdminDashboard } from '@/pages/AdminDashboard';
import { TourGuideDashboard } from '@/pages/TourGuideDashboard';
import { SpaDashboard } from '@/pages/SpaDashboard';
import { EventManagerDashboard } from '@/pages/EventManagerDashboard';
import { RegistrationPage } from '@/pages/RegistrationPage';
import { NpoPortalPage } from '@/pages/NpoPortalPage';

// Import Pages & Components
import { PaymentPage } from '@/components/guest/PaymentPage'; 
import EventCatering from '@/components/guest/EventCatering';
import EventBooking from '@/components/guest/EventBooking';
import { DamageClaimResolutionPage } from '@/components/admin/DamageClaimResolutionPage';

import { Button } from '@/components/ui/button';
import { LogOut, User, Loader2, Moon, Sun } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider, useTheme } from 'next-themes';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="text-gray-600 dark:text-gray-300 rounded-full"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

function DashboardRouter() {
  const { user } = useAuth();
  if (!user?.role) return null;

  switch (user.role) {
    case 'admin': return <AdminDashboard />;
    case 'maintenance': return <MaintenancePortal />;
    case 'guest': return <GuestPortal />;
    case 'front_desk': return <FrontDeskDashboard />;
    case 'chef':
    case 'kitchen_manager': return <KitchenDisplay />;
    case 'npo_rep': return <NpoPortalPage />;
    case 'staff': return <ServiceDashboard />;
    case 'housekeeping':
    case 'waitstaff': 
    case 'delivery': return <ServiceDashboard />;
    case 'tour_guide': return <TourGuideDashboard />;
    case 'spa_staff': return <SpaDashboard />;
    case 'event_manager': return <EventManagerDashboard />;
    default: return <Navigate to="/" />;
  }
}

function RoleBasedRoute() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1e3a5f] flex flex-col items-center justify-center text-white">
        <Loader2 className="h-12 w-12 animate-spin mb-4" />
        <p className="text-lg font-serif">Loading Azure Horizon...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return isRegistering ? (
      <RegistrationPage onBack={() => setIsRegistering(false)} />
    ) : (
      <LandingPage onRegisterClick={() => setIsRegistering(true)} />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">
      <header className="bg-white dark:bg-slate-900 shadow-sm border-b border-gray-200 dark:border-slate-800 sticky top-0 z-50 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl font-serif font-semibold text-[#1e3a5f] dark:text-blue-400">Azure Horizon</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{user.name}</span>
                <span className="px-2 py-0.5 bg-[#1e3a5f] dark:bg-blue-600 text-white text-xs rounded-full capitalize">
                  {(user.role || '').replace(/_/g, ' ')}
                </span>
              </div>
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={() => setShowLogoutConfirm(true)} className="text-gray-600 dark:text-gray-300">
                <LogOut className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg w-11/12 max-w-sm">
            <p className="text-lg font-medium text-gray-800 dark:text-slate-100 mb-4 text-center">Are you sure you want to log out?</p>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowLogoutConfirm(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={() => { logout(); setShowLogoutConfirm(false); }}>Log out</Button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1">
        <Routes>
          <Route path="/*" element={<DashboardRouter />} />
          
          {/* Booking & Payment Flow */}
          <Route path="/event-booking" element={<EventBooking />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/event-catering" element={<EventCatering />} />
          <Route path="/event-manager" element={<EventManagerDashboard />} />

          {/* Admin Routes */}
          <Route path="/damage-claims" element={<DamageClaimResolutionPage />} />
        </Routes>
      </main>

      <footer className="bg-[#1e3a5f] text-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p>© 2026 Azure Horizon Resort.</p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <Router>
          <AuthProvider>
            <RoleBasedRoute />
            <Toaster position="bottom-right" richColors />
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
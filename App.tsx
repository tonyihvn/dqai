import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import ActivitiesPage from './pages/ActivitiesPage';
import BuildFormPage from './pages/BuildFormPage';
import FillFormPage from './pages/FillFormPage';
import ActivityDashboardPage from './pages/ActivityDashboardPage';
import ActivitySubmittedAnswersPage from './pages/ActivitySubmittedAnswersPage';
import ActivityExcelTablesPage from './pages/ActivityExcelTablesPage';
import QuestionFollowupPage from './pages/QuestionFollowupPage';
import ReportsPage from './pages/ReportsPage';
import ReportViewPage from './pages/ReportViewPage';
import ReportBuilderPage from './pages/ReportBuilderPage';
import UsersPage from './pages/UsersPage';
import FacilitiesPage from './pages/FacilitiesPage';
import ProgramsPage from './pages/ProgramsPage';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import DocsPage from './pages/DocsPage';
import ApiConnectorsPage from './pages/ApiConnectorsPage';
import { DataProvider, useMockData } from './hooks/useMockData';
import ErrorBoundary from './components/ErrorBoundary';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useMockData();
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/dashboard" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />

      <Route path="/programs" element={<ProtectedRoute><Layout><ProgramsPage /></Layout></ProtectedRoute>} />

      <Route path="/activities/build/:activityId" element={<ProtectedRoute><Layout><BuildFormPage /></Layout></ProtectedRoute>} />

      <Route path="/activities/fill/:activityId" element={<ProtectedRoute><Layout><FillFormPage /></Layout></ProtectedRoute>} />
      {/* Standalone form (no layout) for sharing/embedded use */}
      <Route path="/standalone/fill/:activityId" element={<FillFormPage standaloneMode={true} />} />

      <Route path="/activities/dashboard/:activityId" element={<ProtectedRoute><Layout><ActivityDashboardPage /></Layout></ProtectedRoute>} />
      <Route path="/activities/:activityId/submitted-answers" element={<ProtectedRoute><Layout><ActivitySubmittedAnswersPage /></Layout></ProtectedRoute>} />
      <Route path="/activities/:activityId/excel-tables" element={<ProtectedRoute><Layout><ActivityExcelTablesPage /></Layout></ProtectedRoute>} />
      <Route path="/activities/:activityId/followups" element={<ProtectedRoute><Layout><QuestionFollowupPage /></Layout></ProtectedRoute>} />

      <Route path="/activities" element={<ProtectedRoute><Layout><ActivitiesPage /></Layout></ProtectedRoute>} />

      <Route path="/reports" element={<ProtectedRoute><Layout><ReportsPage /></Layout></ProtectedRoute>} />
      <Route path="/reports/builder" element={<ProtectedRoute><Layout><ReportBuilderPage /></Layout></ProtectedRoute>} />
      <Route path="/reports/:reportId" element={<ProtectedRoute><Layout><ReportViewPage /></Layout></ProtectedRoute>} />

      <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
      <Route path="/connectors" element={<ProtectedRoute><Layout><ApiConnectorsPage /></Layout></ProtectedRoute>} />
      <Route path="/docs" element={<Layout><DocsPage /></Layout>} />
      <Route path="/profile" element={<ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>} />

      <Route path="/users" element={<ProtectedRoute><Layout><UsersPage /></Layout></ProtectedRoute>} />

      <Route path="/facilities" element={<ProtectedRoute><Layout><FacilitiesPage /></Layout></ProtectedRoute>} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

const App: React.FC = () => {
  // Materialize removed: no longer needed
  return (
    <DataProvider>
      <ErrorBoundary>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </ErrorBoundary>
    </DataProvider>
  );
};

export default App;
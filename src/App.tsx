import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useAppContext } from './contexts/AppContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Exercises } from './pages/Exercises';
import { Materials } from './pages/Materials';
import { Summaries } from './pages/Summaries';
import { Statistics } from './pages/Statistics';
import { DataSync } from './pages/DataSync';
import { Trash } from './pages/Trash';
import { Accounts } from './pages/Accounts';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAppContext();
  if (!currentUser) return <Navigate to="/login" />;
  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="exercises" element={<Exercises />} />
        <Route path="materials" element={<Materials />} />
        <Route path="summaries" element={<Summaries />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="sync" element={<DataSync />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="trash" element={<Trash />} />
      </Route>
    </Routes>
  );
};

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AppProvider>
  );
}

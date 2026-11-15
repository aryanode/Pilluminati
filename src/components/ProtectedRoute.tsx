import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Skeleton } from './ui/Primitives';
import { useCare } from '../context/CareContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, authLoading } = useCare();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Skeleton className="h-14 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

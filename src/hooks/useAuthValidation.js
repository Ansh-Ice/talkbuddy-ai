import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Custom hook to handle authentication validation and prevent unauthorized access
 * @param {Object} user - Firebase user object
 * @param {Array} protectedRoutes - Array of routes that require authentication
 */
export const useAuthValidation = (user, protectedRoutes = ['/', '/dashboard']) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      // Clear any cached data and redirect to auth
      sessionStorage.clear();
      localStorage.removeItem('user');
      navigate('/auth', { replace: true });
      return;
    }

    // Add a flag to session storage to track valid session
    sessionStorage.setItem('authenticated', 'true');
    sessionStorage.setItem('lastActivity', Date.now().toString());

    // Handle browser back/forward navigation
    const handlePopState = (event) => {
      const currentPath = window.location.pathname;
      const isProtectedRoute = protectedRoutes.includes(currentPath);
      
      // If user tries to go back to protected route after logout, redirect to auth
      if (isProtectedRoute && (!user || !sessionStorage.getItem('authenticated'))) {
        navigate('/auth', { replace: true });
      }
    };

    window.addEventListener('popstate', handlePopState);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [user, navigate, protectedRoutes]);
};

/**
 * Custom hook for secure logout functionality
 * @param {Function} signOutFunction - Firebase signOut function
 */
export const useSecureLogout = (signOutFunction) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      // Clear all authentication data
      sessionStorage.clear();
      localStorage.removeItem('user');
      
      // Sign out from Firebase
      await signOutFunction();
      
      // Replace current history entry to prevent back navigation
      window.history.replaceState(null, '', '/auth');
      
      // Navigate to auth page
      navigate('/auth', { replace: true });
      
      // Force reload to clear any cached state
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, clear local data and redirect
      sessionStorage.clear();
      localStorage.removeItem('user');
      navigate('/auth', { replace: true });
    }
  };

  return handleLogout;
};

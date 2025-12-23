import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart3, 
  Users, 
  Settings, 
  LogOut, 
  Menu,
  X,
  UserCheck,
  FileText,
  Mic,
  UserPlus
} from 'lucide-react';
import { db } from './firebase';
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import AdminReports from './AdminReports';
import AdminCharts from './AdminCharts';
import QuizManagement from './QuizManagement';
import ManageOralQuestions from './ManageOralQuestions';
import AdminAccountManager from './AdminAccountManager';
import AdminFeedback from './AdminFeedback';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('reports');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminData, setAdminData] = useState({
    totalUsers: 0,
    onlineUsers: 0,
    // totalQuizzes: 0,
    recentActivity: []
  });
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const navigate = useNavigate();

  // Check admin session
  useEffect(() => {
    const adminSession = localStorage.getItem('adminSession');
    if (!adminSession) {
      navigate('/admin/login', { replace: true });
      return;
    }

    const sessionData = JSON.parse(adminSession);
    setSession(sessionData);
    
    if (Date.now() - sessionData.loginTime > 24 * 60 * 60 * 1000) {
      localStorage.removeItem('adminSession');
      navigate('/admin/login', { replace: true });
      return;
    }

    // Remove dashboard from history (fix forward button)
    navigate(window.location.pathname, { replace: true });

    // Back button logout
    window.history.pushState(null, '', window.location.href);
    window.onpopstate = () => {
      localStorage.removeItem('adminSession');
      navigate('/admin/login', { replace: true });
    };

    loadDashboardData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadDashboardData, 30 * 1000);
    
    // Check if admin still exists every 30 seconds
    const adminCheckInterval = setInterval(checkAdminExists, 30 * 1000);
    
    return () => {
      clearInterval(interval);
      clearInterval(adminCheckInterval);
    };
  }, [navigate]);

  // Check if current admin still exists in the database
  const checkAdminExists = async () => {
    try {
      const adminSession = localStorage.getItem('adminSession');
      if (!adminSession) {
        console.log('No admin session found, logging out');
        handleLogout();
        return;
      }

      const sessionData = JSON.parse(adminSession);
      const normalizedUsername = (sessionData.username || '').trim().toLowerCase();
      console.log('Checking if admin exists:', normalizedUsername);
      
      // Try to find admin by docId first
      if (sessionData.docId) {
        try {
          console.log('Checking admin by docId:', sessionData.docId);
          const adminDoc = await getDoc(doc(db, 'admin', sessionData.docId));
          if (!adminDoc.exists()) {
            console.log('Admin document does not exist, logging out');
            // Admin document doesn't exist, logout
            handleLogout();
            return;
          } else {
            console.log('Admin document exists');
          }
        } catch (error) {
          console.warn('Error checking admin by docId:', error);
        }
      }
      
      // Fallback: check by username
      const adminSnapshot = await getDocs(collection(db, 'admin'));
      const adminExists = adminSnapshot.docs.some(docSnap => {
        const candidate = (docSnap.data().username || docSnap.id || '').trim().toLowerCase();
        return candidate === normalizedUsername;
      });
      
      console.log('Admin exists in collection:', adminExists);
      
      if (!adminExists) {
        // Admin no longer exists, logout
        console.log('Admin no longer exists in database, logging out');
        handleLogout();
      }
    } catch (error) {
      console.error('Error checking admin existence:', error);
      // In case of error, logout for security
      handleLogout();
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Get total users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const totalUsers = usersSnapshot.size;

      // Get users who were active in the last 2 minutes
      const now = new Date();
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

      const onlineUsersQuery = query(
        collection(db, "users"),
        where("lastActive", ">=", twoMinutesAgo)
      );

      const onlineUsersSnapshot = await getDocs(onlineUsersQuery);
      const onlineUsers = onlineUsersSnapshot.size;

      // Get total quizzes (if you have a quizzes collection)
      // const quizzesSnapshot = await getDocs(collection(db, 'quizQuestions'));
      // const totalQuizzes = quizzesSnapshot.size;

      // Get recent users
      const recentUsersQuery = query(
        collection(db, 'users'),
        orderBy('createdAt', 'desc'),
        limit(3)
      );
      const recentUsersSnapshot = await getDocs(recentUsersQuery);
      const recentActivity = recentUsersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        type: 'user_registration'
      }));

      setAdminData({
        totalUsers,
        onlineUsers,
        // totalQuizzes,
        recentActivity
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    console.log('Logging out admin');
    localStorage.removeItem('adminSession');
    navigate('/admin/login', { replace: true });
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'reports':
        return <AdminReports data={adminData} loading={loading} />;
      case 'charts':
        return <AdminCharts data={adminData} loading={loading} />;
      case 'quiz':
        return <QuizManagement />;
      case 'oral':
        return <ManageOralQuestions />;
      case 'adminAccounts':
        return <AdminAccountManager />;
      case 'feedback':
        return <AdminFeedback />;
      default:
        return <AdminReports data={adminData} loading={loading} />;
    }
  };

  const sidebarItems = [
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'charts', label: 'Charts & Analytics', icon: BarChart3 },
    { id: 'quiz', label: 'Quiz Management', icon: Settings },
    { id: 'oral', label: 'Manage Oral Questions', icon: Mic },
    { id: 'adminAccounts', label: 'Admin Controls', icon: UserPlus },
    { id: 'feedback', label: 'Feedback Management', icon: FileText },
  ];

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Sidebar */}
      <div className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="admin-brand">
            <Users className="brand-icon" />
            <h2 style={{ color: "black" }}>Admin Panel</h2>
          </div>
          <button
            className="sidebar-toggle mobile-only"
            onClick={() => setSidebarOpen(false)}
          >
            {/* <X size={24} /> */}
          </button>
        </div>

        <nav className="sidebar-nav">
          {sidebarItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
              >
                <IconComponent size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="admin-main">
        <header className="admin-header">
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          
          <div className="header-title">
            <h1>
              {activeTab === 'reports' && 'Reports & Statistics'}
              {activeTab === 'charts' && 'Charts & Analytics'}
              {activeTab === 'quiz' && 'Quiz Management'}
              {activeTab === 'oral' && 'Oral Questions'}
              {activeTab === 'adminAccounts' && 'Admin & Security'}
              {activeTab === 'feedback' && 'Feedback Management'}
            </h1>
          </div>

          <div className="header-stats">
            <div className="stat-item">
              <Users size={16} />
              <span>{adminData.totalUsers} Users</span>
            </div>
            <div className="stat-item">
              <UserCheck size={16} />
              <span>{adminData.onlineUsers} Online</span>
            </div>
            <div className="stat-item">
              <FileText size={16} />
              <span>{adminData.totalQuizzes} Quizzes</span>
            </div>
          </div>
        </header>

        <main className="admin-content">
          {renderActiveTab()}
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default AdminDashboard;
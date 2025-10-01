import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserCheck, 
  Clock, 
  TrendingUp, 
  Calendar,
  Mail,
  Award,
  BookOpen
} from 'lucide-react';
import { db } from './firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

const AdminReports = ({ data, loading }) => {
  const [detailedStats, setDetailedStats] = useState({
    newUsersToday: 0,
    newUsersThisWeek: 0,
    newUsersThisMonth: 0,
    assessmentCompleted: 0,
    quizCompleted: 0,
    emailVerified: 0,
    googleUsers: 0,
    emailUsers: 0
  });

  useEffect(() => {
    loadDetailedStats();
  }, []);

  const loadDetailedStats = async () => {
    try {
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get all users for detailed analysis
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Calculate statistics
      const newUsersToday = users.filter(user => {
        const userDate = new Date(user.createdAt);
        return userDate.toDateString() === today.toDateString();
      }).length;

      const newUsersThisWeek = users.filter(user => {
        const userDate = new Date(user.createdAt);
        return userDate >= weekAgo;
      }).length;

      const newUsersThisMonth = users.filter(user => {
        const userDate = new Date(user.createdAt);
        return userDate >= monthAgo;
      }).length;

      const assessmentCompleted = users.filter(user => user.assessmentCompleted).length;
      const quizCompleted = users.filter(user => user.quizCompleted).length;
      const emailVerified = users.filter(user => user.emailVerified).length;
      
      // Check registered emails to differentiate Google vs Email users
      const registeredEmailsSnapshot = await getDocs(collection(db, 'registeredEmails'));
      const registeredEmails = registeredEmailsSnapshot.size;
      
      const googleUsers = users.length - registeredEmails;
      const emailUsers = registeredEmails;

      setDetailedStats({
        newUsersToday,
        newUsersThisWeek,
        newUsersThisMonth,
        assessmentCompleted,
        quizCompleted,
        emailVerified,
        googleUsers: Math.max(0, googleUsers),
        emailUsers
      });
    } catch (error) {
      console.error('Error loading detailed stats:', error);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, trend, subtitle }) => (
    <div className="stat-card">
      <div className="stat-header">
        <div className={`stat-icon ${color}`}>
          <Icon size={24} />
        </div>
        <div className="stat-trend">
          {trend && (
            <span className={`trend ${trend > 0 ? 'positive' : 'negative'}`}>
              <TrendingUp size={16} />
              {Math.abs(trend)}%
            </span>
          )}
        </div>
      </div>
      <div className="stat-content">
        <h3 className="stat-value">{value}</h3>
        <p className="stat-title">{title}</p>
        {subtitle && <p className="stat-subtitle">{subtitle}</p>}
      </div>
    </div>
  );

  const RecentActivity = () => (
    <div className="recent-activity">
      <h3>Recent Activity</h3>
      <div className="activity-list">
        {data.recentActivity.slice(0, 5).map((activity, index) => (
          <div key={index} className="activity-item">
            <div className="activity-icon">
              <Users size={16} />
            </div>
            <div className="activity-content">
              <p className="activity-title">
                New user registered: {activity.name || activity.email}
              </p>
              <p className="activity-time">
                <Clock size={12} />
                {new Date(activity.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="reports-loading">
        <div className="loading-spinner"></div>
        <p>Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="admin-reports">
      <div className="reports-header">
        <h2>System Overview</h2>
        <p>Comprehensive statistics and user analytics</p>
      </div>

      {/* Main Statistics Grid */}
      <div className="stats-grid">
        <StatCard
          title="Total Users"
          value={data.totalUsers}
          icon={Users}
          color="blue"
          subtitle="All registered users"
        />
        
        <StatCard
          title="Online Users"
          value={data.onlineUsers}
          icon={UserCheck}
          color="green"
          subtitle="Active today"
        />
        
        <StatCard
          title="New Users Today"
          value={detailedStats.newUsersToday}
          icon={Calendar}
          color="purple"
          subtitle="Registered today"
        />
        
        <StatCard
          title="Assessment Completed"
          value={detailedStats.assessmentCompleted}
          icon={Award}
          color="orange"
          subtitle={`${Math.round((detailedStats.assessmentCompleted / data.totalUsers) * 100) || 0}% completion rate`}
        />
      </div>

      {/* Secondary Statistics */}
      <div className="secondary-stats">
        <div className="stats-row">
          <StatCard
            title="Quiz Completed"
            value={detailedStats.quizCompleted}
            icon={BookOpen}
            color="teal"
            subtitle={`${Math.round((detailedStats.quizCompleted / data.totalUsers) * 100) || 0}% completion`}
          />
          
          <StatCard
            title="Email Verified"
            value={detailedStats.emailVerified}
            icon={Mail}
            color="indigo"
            subtitle={`${Math.round((detailedStats.emailVerified / data.totalUsers) * 100) || 0}% verified`}
          />
          
          <StatCard
            title="This Week"
            value={detailedStats.newUsersThisWeek}
            icon={TrendingUp}
            color="pink"
            subtitle="New registrations"
          />
          
          <StatCard
            title="This Month"
            value={detailedStats.newUsersThisMonth}
            icon={Calendar}
            color="red"
            subtitle="New registrations"
          />
        </div>
      </div>

      {/* User Registration Methods */}
      <div className="registration-methods">
        <h3>Registration Methods</h3>
        <div className="methods-grid">
          <div className="method-card">
            <Mail size={24} />
            <div>
              <h4>Email Registration</h4>
              <p>{detailedStats.emailUsers} users</p>
            </div>
          </div>
          <div className="method-card">
            <Users size={24} />
            <div>
              <h4>Google Sign-in</h4>
              <p>{detailedStats.googleUsers} users</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <RecentActivity />

      {/* Quick Actions */}
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="actions-grid">
          <button className="action-btn">
            <Users size={20} />
            <span>Export User Data</span>
          </button>
          <button className="action-btn">
            <BookOpen size={20} />
            <span>View Quiz Results</span>
          </button>
          <button className="action-btn">
            <Mail size={20} />
            <span>Send Notifications</span>
          </button>
          <button className="action-btn">
            <Award size={20} />
            <span>Assessment Reports</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminReports;

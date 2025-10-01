import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { db } from './firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const AdminCharts = ({ data, loading }) => {
  const [chartData, setChartData] = useState({
    userGrowth: [],
    assessmentStats: {},
    registrationMethods: {},
    weeklyActivity: []
  });

  useEffect(() => {
    loadChartData();
  }, []);

  const loadChartData = async () => {
    try {
      // Get user data for charts
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Prepare user growth data (last 7 days)
      const userGrowth = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const dayUsers = users.filter(user => {
          const userDate = new Date(user.createdAt);
          return userDate.toDateString() === date.toDateString();
        }).length;
        
        userGrowth.push({
          date: date.toLocaleDateString('en-US', { weekday: 'short' }),
          users: dayUsers
        });
      }

      // Assessment statistics
      const assessmentStats = {
        completed: users.filter(user => user.assessmentCompleted).length,
        quizOnly: users.filter(user => user.quizCompleted && !user.assessmentCompleted).length,
        notStarted: users.filter(user => !user.quizCompleted && !user.assessmentCompleted).length
      };

      // Registration methods
      const registeredEmailsSnapshot = await getDocs(collection(db, 'registeredEmails'));
      const emailUsers = registeredEmailsSnapshot.size;
      const googleUsers = Math.max(0, users.length - emailUsers);

      const registrationMethods = {
        email: emailUsers,
        google: googleUsers
      };

      // Weekly activity (simulate based on user data)
      const weeklyActivity = userGrowth.map(day => ({
        ...day,
        activity: Math.floor(Math.random() * 50) + day.users * 3 // Simulate activity
      }));

      setChartData({
        userGrowth,
        assessmentStats,
        registrationMethods,
        weeklyActivity
      });
    } catch (error) {
      console.error('Error loading chart data:', error);
    }
  };

  // Chart configurations
  const userGrowthConfig = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'User Registration Growth (Last 7 Days)',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1
        }
      }
    }
  };

  const assessmentConfig = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
      },
      title: {
        display: true,
        text: 'Assessment Completion Status',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
    }
  };

  const registrationConfig = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
      },
      title: {
        display: true,
        text: 'User Registration Methods',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
    }
  };

  const activityConfig = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Daily Activity Overview',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  // Prepare chart data
  const userGrowthData = {
    labels: chartData.userGrowth.map(day => day.date),
    datasets: [
      {
        label: 'New Users',
        data: chartData.userGrowth.map(day => day.users),
        backgroundColor: 'rgba(102, 126, 234, 0.8)',
        borderColor: 'rgba(102, 126, 234, 1)',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }
    ]
  };

  const assessmentData = {
    labels: ['Completed', 'Quiz Only', 'Not Started'],
    datasets: [
      {
        data: [
          chartData.assessmentStats.completed,
          chartData.assessmentStats.quizOnly,
          chartData.assessmentStats.notStarted
        ],
        backgroundColor: [
          'rgba(76, 175, 80, 0.8)',
          'rgba(255, 193, 7, 0.8)',
          'rgba(244, 67, 54, 0.8)'
        ],
        borderColor: [
          'rgba(76, 175, 80, 1)',
          'rgba(255, 193, 7, 1)',
          'rgba(244, 67, 54, 1)'
        ],
        borderWidth: 2
      }
    ]
  };

  const registrationData = {
    labels: ['Email Registration', 'Google Sign-in'],
    datasets: [
      {
        data: [chartData.registrationMethods.email, chartData.registrationMethods.google],
        backgroundColor: [
          'rgba(33, 150, 243, 0.8)',
          'rgba(76, 175, 80, 0.8)'
        ],
        borderColor: [
          'rgba(33, 150, 243, 1)',
          'rgba(76, 175, 80, 1)'
        ],
        borderWidth: 2
      }
    ]
  };

  const activityData = {
    labels: chartData.weeklyActivity.map(day => day.date),
    datasets: [
      {
        label: 'New Users',
        data: chartData.weeklyActivity.map(day => day.users),
        borderColor: 'rgba(102, 126, 234, 1)',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4
      },
      {
        label: 'Platform Activity',
        data: chartData.weeklyActivity.map(day => day.activity),
        borderColor: 'rgba(255, 193, 7, 1)',
        backgroundColor: 'rgba(255, 193, 7, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4
      }
    ]
  };

  if (loading) {
    return (
      <div className="charts-loading">
        <div className="loading-spinner"></div>
        <p>Loading charts...</p>
      </div>
    );
  }

  return (
    <div className="admin-charts">
      <div className="charts-header">
        <h2>Analytics & Insights</h2>
        <p>Visual representation of user data and platform metrics</p>
      </div>

      <div className="charts-grid">
        {/* User Growth Chart */}
        <div className="chart-container">
          <Bar data={userGrowthData} options={userGrowthConfig} />
        </div>

        {/* Assessment Status Chart */}
        <div className="chart-container">
          <Doughnut data={assessmentData} options={assessmentConfig} />
        </div>

        {/* Registration Methods Chart */}
        <div className="chart-container">
          <Doughnut data={registrationData} options={registrationConfig} />
        </div>

        {/* Activity Overview Chart */}
        <div className="chart-container full-width">
          <Line data={activityData} options={activityConfig} />
        </div>
      </div>

      {/* Chart Insights */}
      <div className="chart-insights">
        <h3>Key Insights</h3>
        <div className="insights-grid">
          <div className="insight-card">
            <h4>User Growth Trend</h4>
            <p>
              {chartData.userGrowth.reduce((sum, day) => sum + day.users, 0)} new users 
              registered in the last 7 days, showing{' '}
              {chartData.userGrowth[chartData.userGrowth.length - 1]?.users > 
               chartData.userGrowth[0]?.users ? 'positive' : 'stable'} growth.
            </p>
          </div>
          
          <div className="insight-card">
            <h4>Assessment Engagement</h4>
            <p>
              {Math.round((chartData.assessmentStats.completed / data.totalUsers) * 100) || 0}% 
              of users have completed the full assessment, indicating{' '}
              {chartData.assessmentStats.completed > chartData.assessmentStats.notStarted ? 
               'high' : 'moderate'} engagement levels.
            </p>
          </div>
          
          <div className="insight-card">
            <h4>Registration Preference</h4>
            <p>
              {chartData.registrationMethods.email > chartData.registrationMethods.google ? 
               'Email registration' : 'Google sign-in'} is the preferred method, 
              used by {Math.max(chartData.registrationMethods.email, chartData.registrationMethods.google)} users.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCharts;

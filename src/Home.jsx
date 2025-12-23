import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { auth, db } from './firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import ProfileSidebar from './ProfileSidebar';
import FeedbackForm from './FeedbackForm';
import { useAuthValidation, useSecureLogout } from './hooks/useAuthValidation';
import { useNavigate } from "react-router-dom";
// Add Chart.js imports
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Home({ user, userProfile }) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [voiceSessions, setVoiceSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [quizHistory, setQuizHistory] = useState([]); // Add state for quiz history
  const [loadingQuizHistory, setLoadingQuizHistory] = useState(true); // Add loading state
  const navigate = useNavigate();

  // Use custom hooks for authentication validation and secure logout
  useAuthValidation(user, ['/']);
  const handleLogout = useSecureLogout(() => signOut(auth));

  // Fetch voice sessions
  useEffect(() => {
    if (!user) {
      setLoadingSessions(false);
      return;
    }

    const fetchVoiceSessions = async () => {
      try {
        const sessionsRef = collection(db, "voice_sessions");
        const q = query(
          sessionsRef,
          where("userId", "==", user.uid),
          where("status", "==", "completed"),
          orderBy("createdAt", "desc"),
          limit(5)
        );
        
        const snapshot = await getDocs(q);
        const sessions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setVoiceSessions(sessions);
      } catch (err) {
        console.error('Error fetching voice sessions:', err);
      } finally {
        setLoadingSessions(false);
      }
    };

    fetchVoiceSessions();
  }, [user]);

  // Fetch quiz history for chart
  useEffect(() => {
    if (!user) {
      setLoadingQuizHistory(false);
      return;
    }

    const fetchQuizHistory = async () => {
      try {
        const quizzesRef = collection(db, "users", user.uid, "ai_quizzes");
        // Query for quizzes that have been attempted (have attempted_at field)
        const q = query(
          quizzesRef,
          orderBy("created_at", "desc"),
          limit(10)
        );
        const snapshot = await getDocs(q);
        const quizzes = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            created_at: data.created_at?.toDate ? data.created_at.toDate() : new Date(data.created_at),
            attempted_at: data.attempted_at?.toDate ? data.attempted_at.toDate() : (data.attempted_at ? new Date(data.attempted_at) : null)
          };
        });
        
        // Filter for only attempted quizzes and sort by date ascending for chart
        const attemptedQuizzes = quizzes.filter(quiz => quiz.attempted_at !== null);
        const sortedQuizzes = [...attemptedQuizzes].sort((a, b) => a.attempted_at - b.attempted_at);
        setQuizHistory(sortedQuizzes);
      } catch (err) {
        console.error('Error fetching quiz history:', err);
      } finally {
        setLoadingQuizHistory(false);
      }
    };

    fetchQuizHistory();
  }, [user]);

  const scrollToSection = (sectionId) => {
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleNavScroll = (event, sectionId) => {
    event.preventDefault();
    scrollToSection(sectionId);
  };

  const handleProfileClick = (e) => {
    e.preventDefault();
    if (user) {
      setIsProfileOpen(true);
    } else {
      navigate('/auth');
    }
  };

  const handleFeedbackClick = (e) => {
    e.preventDefault();
    setIsFeedbackOpen(true);
  };
  const openRoutine = (routineId) => {
    if (user) {
      navigate(`/guided/${routineId}`);
    } else {
      navigate('/auth');
    }
  };

  const quizPercentage = userProfile?.quizPercentage || 0;
  const quizScore = userProfile?.quizScore || 0;
  const quizTotalQuestions = userProfile?.quizTotalQuestions || 0;
  const oralTestPercentage = userProfile?.oralTestPercentage || 0;
  const oralTestScore = userProfile?.oralTestScore || 0;
  const oralTestTotalQuestions = userProfile?.oralTestTotalQuestions || 0;
  const oralTestMaxScore =
    userProfile?.oralTestTotalPossible ||
    (oralTestTotalQuestions ? oralTestTotalQuestions * 10 : 0);
  const availablePercentages = [];
  if (quizTotalQuestions) availablePercentages.push(quizPercentage);
  if (oralTestTotalQuestions) availablePercentages.push(oralTestPercentage);
  const computedOverallPercentage = availablePercentages.length
    ? Math.round(
        availablePercentages.reduce((sum, value) => sum + value, 0) /
          availablePercentages.length
      )
    : 0;
  const overallPercentage = userProfile?.assessmentOverallPercentage ?? computedOverallPercentage;
  const placementLevel = userProfile?.assessmentLevel;
  const assessmentCompletedAt = userProfile?.assessmentCompletedAt;

  // Chart data configuration
  const chartData = {
    labels: quizHistory.map(quiz => 
      quiz.attempted_at.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      })
    ),
    datasets: [
      {
        label: 'Quiz Score %',
        data: quizHistory.map(quiz => quiz.percentage || 0),
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.4
      },
      {
        label: 'Oral Score %',
        data: quizHistory.map(quiz => 
          quiz.responses ? 
            (quiz.responses.filter(r => r.type === 'oral' && r.evaluation).reduce((sum, r) => sum + (r.evaluation?.score || 0), 0) / 
             Math.max(quiz.responses.filter(r => r.type === 'oral' && r.evaluation).length, 1) * 10) || 0 
            : 0
        ),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: '#8b5cf6',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#e5e7eb',
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: '#e5e7eb',
        bodyColor: '#e5e7eb',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.parsed.y}%`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)'
        },
        ticks: {
          color: '#9ca3af'
        }
      },
      y: {
        min: 0,
        max: 100,
        grid: {
          color: 'rgba(255, 255, 255, 0.05)'
        },
        ticks: {
          color: '#9ca3af',
          callback: function(value) {
            return value + '%';
          }
        }
      }
    },
    interaction: {
      mode: 'index',
      intersect: false
    }
  };

  return (
    <div className="home" id="home-top">
      <header className="topnav">
        <div className="logo"> 
          <div className="logo-mark">TB</div>
          <span className="logo-text">TalkBuddy AI</span>
        </div>
        <nav className="menu">
          <a href="#home-top" onClick={(e) => handleNavScroll(e, 'home-top')}>Home</a>
          <a href="#features" onClick={(e) => handleNavScroll(e, 'features')}>Features</a>
          <a href="#progress" onClick={(e) => handleNavScroll(e, 'progress')}>Progress</a>
          <a href="#profile" onClick={handleProfileClick}>Profile</a>
          <a href="#" onClick={handleFeedbackClick}>Feedback</a>
          {user ? (
            <button className="logout" onClick={handleLogout}>Logout</button>
          ) : (
            <Link to="/auth" className="logout">Login</Link>
          )}
        </nav>
      </header>

      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-content">
          <div className="welcome-badge">
            <span className="badge-icon">✨</span>
            <span>Welcome back!</span>
          </div>
          <h1>Hi {user?.displayName || (user?.email ? user.email.split('@')[0] : 'there')} 👋</h1>
          <p className="hero-subtitle">
            {placementLevel
              ? `You're currently at the ${placementLevel} level. Keep up the great work!`
              : "Ready to practice your English today? Your AI coach is waiting!"}
          </p>
          <div className="cta-group">
            <button className="cta voice" onClick={() => navigate("/voice-practice")}>
              <span className="cta-icon">🎙️</span>
              <div>
                <div className="cta-title">Voice Practice</div>
                <div className="cta-subtitle">Start speaking now</div>
              </div>
            </button>
            <button className="cta video" onClick={() => navigate("/video-call")}>
              <span className="cta-icon">🎥</span>
              <div>
                <div className="cta-title">Video Call</div>
                <div className="cta-subtitle">Face-to-face practice</div>
              </div>
            </button>
            <button className="cta history" onClick={() => navigate("/chat-history")}>
              <span className="cta-icon">💬</span>
              <div>
                <div className="cta-title">Chat History</div>
                <div className="cta-subtitle">View past sessions</div>
              </div>
            </button>
            <button className="cta quiz" onClick={() => navigate("/aiquiz")}>
              <span className="cta-icon">🧠</span>
              <div>
                <div className="cta-title">Start AI Quiz</div>
                <div className="cta-subtitle">Personalized assessment</div>
              </div>
            </button>
            <button className="cta quiz-history" onClick={() => navigate("/quiz-history")}>
              <span className="cta-icon">📚</span>
              <div>
                <div className="cta-title">View Previous AI Quizzes</div>
                <div className="cta-subtitle">Review past attempts</div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Assessment Results Section */}
      {userProfile?.assessmentCompleted && (
        <section className="assessment-results" aria-labelledby="assessment-results">
          <h2 id="assessment-results">Your Assessment Results 📊</h2>
          {assessmentCompletedAt && (
            <p className="results-timestamp">
              Completed on <strong>{assessmentCompletedAt}</strong>
            </p>
          )}
          <div className="results-grid">
            <div className="result-card quiz-results">
              <div className="result-header">
                <h3>Written Test</h3>
                <div className="result-score">
                  {quizScore}/{quizTotalQuestions}
                  <span className="result-percentage">({quizPercentage}%)</span>
                </div>
              </div>
              <div className="result-details">
                <div className="result-bar">
                  <div 
                    className="result-progress" 
                    style={{ width: `${quizPercentage}%` }}
                  ></div>
                </div>
                <p className="result-description">
                  {quizPercentage >= 80 ? "Excellent performance!" : 
                   quizPercentage >= 60 ? "Good work! Keep practicing." : 
                   "Room for improvement. Practice more!"}
                </p>
              </div>
            </div>

            <div className="result-card oral-results">
              <div className="result-header">
                <h3>Oral Test</h3>
                <div className="result-score">
                  {oralTestScore}/{oralTestMaxScore}
                  <span className="result-percentage">({oralTestPercentage}%)</span>
                </div>
              </div>
              <div className="result-details">
                <div className="result-bar">
                  <div 
                    className="result-progress" 
                    style={{ width: `${oralTestPercentage}%` }}
                  ></div>
                </div>
                <p className="result-description">
                  {oralTestPercentage >= 80 ? "Outstanding speaking skills!" : 
                   oralTestPercentage >= 60 ? "Good pronunciation and fluency!" : 
                   "Keep practicing speaking to improve!"}
                </p>
              </div>
            </div>

            <div className="result-card overall-results">
              <div className="result-header">
                <h3>Overall Assessment</h3>
                <div className="result-score">
                  {overallPercentage}%
                </div>
              </div>
              <div className="result-details">
                <div className="result-bar">
                  <div 
                    className="result-progress overall-progress" 
                    style={{ width: `${overallPercentage}%` }}
                  ></div>
                </div>
                <p className="result-description">
                  {overallPercentage >= 80 ? 
                    "🎉 Excellent overall performance! You're ready for advanced practice!" :
                    overallPercentage >= 60 ?
                    "👍 Good progress! Continue practicing to improve further." :
                    "💪 Keep practicing! Every step forward counts."}
                </p>
              </div>
            </div>

            {placementLevel && (
              <div className="result-card level-results">
                <div className="result-header">
                  <h3>Placement Level</h3>
                  <div className="result-score level-tag">{placementLevel}</div>
                </div>
                <div className="result-details">
                  <p className="result-description">
                    Determined using both written and oral scores so we can recommend the right routines for you.
                  </p>
                  <p className="result-description subtle">
                    Combined score: {overallPercentage}% &nbsp;|&nbsp; Oral score: {oralTestPercentage}% &nbsp;|&nbsp; Quiz score: {quizPercentage}%
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="insights" aria-labelledby="daily-insights">
        <h2 id="daily-insights">Daily Insights</h2>
        <div className="insight-grid">
          <article className="card stat">
            <div className="stat-icon">📈</div>
            <div>
              <div className="stat-label">Confidence Score</div>
              <div className="stat-value">82%</div>
            </div>
          </article>
          <article className="card stat">
            <div className="stat-icon">😊</div>
            <div>
              <div className="stat-label">Mood Trend</div>
              <div className="stat-value">Steady ↗</div>
            </div>
          </article>
          <article className="card stat">
            <div className="stat-icon">🕒</div>
            <div>
              <div className="stat-label">Last Session</div>
              <div className="stat-value">12 min, Clarity +6%</div>
            </div>
          </article>
        </div>
      </section>

      {/* Voice Practice Sessions */}
      {user && voiceSessions.length > 0 && (
        <section className="voice-sessions" aria-labelledby="voice-sessions">
          <h2 id="voice-sessions">Recent Voice Practice Sessions 🎙️</h2>
          {loadingSessions ? (
            <p className="loading-text">Loading sessions...</p>
          ) : (
            <div className="sessions-grid">
              {voiceSessions.map((session) => {
                const sessionDate = session.createdAt?.toDate ? 
                  session.createdAt.toDate().toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  }) : 
                  'Recent';
                
                const mistakeCount = session.summary?.corrections?.length || 0;
                const feedback = session.summary?.final_feedback || "Great practice session!";
                const tip = session.summary?.tips || "Keep up the good work!";

                return (
                  <div key={session.id} className="session-card">
                    <div className="session-header">
                      <span className="session-date">{sessionDate}</span>
                      <span className="session-badge">
                        {mistakeCount === 0 ? '✨ Perfect' : `${mistakeCount} ${mistakeCount === 1 ? 'correction' : 'corrections'}`}
                      </span>
                    </div>
                    <p className="session-feedback">{feedback}</p>
                    <div className="session-tip">
                      <strong>💡 Tip:</strong> {tip}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}



      <section id="progress" className="progress" aria-labelledby="progress-overview">
        <h2 id="progress-overview">Progress Overview</h2>
        <div className="card chart">
          {loadingQuizHistory ? (
            <div className="chart-placeholder">
              <span>Loading progress data...</span>
            </div>
          ) : quizHistory.length > 0 ? (
            <>
              <div style={{ height: '300px', position: 'relative' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
              <div className="chart-legend">
                <span style={{ color: '#06b6d4' }}>Quiz Score %</span>
                <span style={{ color: '#8b5cf6' }}>Oral Score %</span>
              </div>
            </>
          ) : (
            <div className="chart-placeholder">
              <span>No quiz data available. Take a quiz to see your progress!</span>
              <button 
                onClick={() => navigate("/aiquiz")} 
                className="take-quiz-btn"
                style={{ 
                  marginTop: '1rem', 
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Start AI Quiz 🚀
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="motivation" aria-labelledby="motivation" id="settings">
        <h2 id="motivation">Tip of the Day</h2>
        <blockquote className="card quote">
          "Small, consistent practice beats occasional perfection. Show up today."
        </blockquote>
      </section>

      <footer className="footer">
        <div className="footer-links">
          <a href="#about">About</a>
          <a href="#support">Support</a>
          <a href="#privacy">Privacy Policy</a>
          <a href="#contact">Contact Us</a>
        </div>
        <div className="copy">© {new Date().getFullYear()} TalkBuddy AI</div>
      </footer>

      {/* Profile Sidebar */}
      {user && (
        <ProfileSidebar 
          user={user} 
          isOpen={isProfileOpen} 
          onClose={() => setIsProfileOpen(false)} 
        />
      )}

      {/* Feedback Form */}
      {isFeedbackOpen && (
        <FeedbackForm 
          user={user} 
          onClose={() => setIsFeedbackOpen(false)} 
          onSuccess={(message) => {
            // Create a simple toast notification
            const toast = document.createElement('div');
            toast.className = 'feedback-toast';
            toast.textContent = message;
            
            // Add toast styles
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.right = '20px';
            toast.style.backgroundColor = '#10b981';
            toast.style.color = 'white';
            toast.style.padding = '12px 20px';
            toast.style.borderRadius = '8px';
            toast.style.zIndex = '1001';
            toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            toast.style.minWidth = '250px';
            toast.style.textAlign = 'center';
            
            document.body.appendChild(toast);
            
            // Remove toast after 3 seconds
            setTimeout(() => {
              toast.remove();
            }, 3000);
          }}
        />
      )}
    </div>
  );
}

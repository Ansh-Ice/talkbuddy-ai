import { Link } from "react-router-dom";
import { useState } from "react";
import { auth } from './firebase';
import { signOut } from 'firebase/auth';
import ProfileSidebar from './ProfileSidebar';
import { useAuthValidation, useSecureLogout } from './hooks/useAuthValidation';
import { useNavigate } from "react-router-dom";



export default function Home({ user, userProfile }) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const navigate = useNavigate();

  // Use custom hooks for authentication validation and secure logout
  useAuthValidation(user, ['/']);
  const handleLogout = useSecureLogout(() => signOut(auth));

  const handleProfileClick = (e) => {
    e.preventDefault();
    if (user) {
      setIsProfileOpen(true);
    } else {
      navigate('/auth');
    }
  };
  return (
    <div className="home">
      <header className="topnav">
        <div className="logo"> 
          <div className="logo-mark">TB</div>
          <span className="logo-text">TalkBuddy AI</span>
        </div>
        <nav className="menu">
          <Link to="/">Home</Link>
          <a href="#features">Features</a>
          <a href="#progress">Progress</a>
          <a href="#profile" onClick={handleProfileClick}>Profile</a>
          <a href="#settings">Settings</a>
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
          <p className="hero-subtitle">Ready to practice your English today? Your AI coach is waiting!</p>
          <div className="cta-group">
            <button className="cta voice">
              <span className="cta-icon">🎙️</span>
              <div>
                <div className="cta-title">Voice Practice</div>
                <div className="cta-subtitle">Start speaking now</div>
              </div>
            </button>
            <button className="cta video">
              <span className="cta-icon">🎥</span>
              <div>
                <div className="cta-title">Video Call</div>
                <div className="cta-subtitle">Face-to-face practice</div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Assessment Results Section */}
      {userProfile?.assessmentCompleted && (
        <section className="assessment-results" aria-labelledby="assessment-results">
          <h2 id="assessment-results">Your Assessment Results 📊</h2>
          <div className="results-grid">
            <div className="result-card quiz-results">
              <div className="result-header">
                <h3>Written Test</h3>
                <div className="result-score">
                  {userProfile.quizScore || 0}/{userProfile.quizTotalQuestions || 0}
                  <span className="result-percentage">({userProfile.quizPercentage || 0}%)</span>
                </div>
              </div>
              <div className="result-details">
                <div className="result-bar">
                  <div 
                    className="result-progress" 
                    style={{ width: `${userProfile.quizPercentage || 0}%` }}
                  ></div>
                </div>
                <p className="result-description">
                  {userProfile.quizPercentage >= 80 ? "Excellent performance!" : 
                   userProfile.quizPercentage >= 60 ? "Good work! Keep practicing." : 
                   "Room for improvement. Practice more!"}
                </p>
              </div>
            </div>

            <div className="result-card oral-results">
              <div className="result-header">
                <h3>Oral Test</h3>
                <div className="result-score">
                  {userProfile.oralTestScore || 0}/{userProfile.oralTestTotalQuestions * 10 || 0}
                  <span className="result-percentage">({userProfile.oralTestPercentage || 0}%)</span>
                </div>
              </div>
              <div className="result-details">
                <div className="result-bar">
                  <div 
                    className="result-progress" 
                    style={{ width: `${userProfile.oralTestPercentage || 0}%` }}
                  ></div>
                </div>
                <p className="result-description">
                  {userProfile.oralTestPercentage >= 80 ? "Outstanding speaking skills!" : 
                   userProfile.oralTestPercentage >= 60 ? "Good pronunciation and fluency!" : 
                   "Keep practicing speaking to improve!"}
                </p>
              </div>
            </div>

            <div className="result-card overall-results">
              <div className="result-header">
                <h3>Overall Assessment</h3>
                <div className="result-score">
                  {Math.round(((userProfile.quizPercentage || 0) + (userProfile.oralTestPercentage || 0)) / 2)}%
                </div>
              </div>
              <div className="result-details">
                <div className="result-bar">
                  <div 
                    className="result-progress overall-progress" 
                    style={{ width: `${Math.round(((userProfile.quizPercentage || 0) + (userProfile.oralTestPercentage || 0)) / 2)}%` }}
                  ></div>
                </div>
                <p className="result-description">
                  {Math.round(((userProfile.quizPercentage || 0) + (userProfile.oralTestPercentage || 0)) / 2) >= 80 ? 
                    "🎉 Excellent overall performance! You're ready for advanced practice!" :
                    Math.round(((userProfile.quizPercentage || 0) + (userProfile.oralTestPercentage || 0)) / 2) >= 60 ?
                    "👍 Good progress! Continue practicing to improve further." :
                    "💪 Keep practicing! Every step forward counts."}
                </p>
              </div>
            </div>
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

      <section id="features" className="activities" aria-labelledby="recommended-activities">
        <h2 id="recommended-activities">Recommended Activities</h2>
        <div className="activity-grid">
          <button className="card activity" onClick={() => navigate("/aiquiz")}>
            🧩 Start AI Quiz
          </button>
          <button className="card activity">⚡ Quick 2‑min warmup</button>
          <button className="card activity">💪 Confidence booster</button>
          <button className="card activity">🗣️ Debate practice</button>
          <button className="card activity">🧘 Breathing & pace</button>
        </div>
      </section>

      <section id="progress" className="progress" aria-labelledby="progress-overview">
        <h2 id="progress-overview">Progress Overview</h2>
        <div className="card chart">
          <div className="chart-placeholder">
            <span>Chart placeholder</span>
          </div>
          <div className="chart-legend">
            <span>Confidence %</span>
            <span>Speech clarity</span>
            <span>Emotion stability</span>
          </div>
        </div>
      </section>

      <section className="motivation" aria-labelledby="motivation">
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
    </div>
  );
}

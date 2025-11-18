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
          <a href="#settings" onClick={(e) => handleNavScroll(e, 'settings')}>Settings</a>
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

      <section id="features" className="activities" aria-labelledby="recommended-activities">
        <h2 id="recommended-activities">Recommended Activities</h2>
        <div className="activity-grid">
          <button className="card activity" onClick={() => navigate("/aiquiz")}>
            🧩 Start AI Quiz
          </button>
          <button className="card activity">⚡ Quick 2‑min warmup</button>
          <button className="card activity" onClick={() => openRoutine('confidence-booster')}>💪 Confidence booster</button>
          <button className="card activity">🗣️ Debate practice</button>
          <button className="card activity" onClick={() => openRoutine('breathe-peace')}>🧘 Breathe & Peace</button>
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
    </div>
  );
}

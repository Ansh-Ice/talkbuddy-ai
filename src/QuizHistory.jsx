import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, orderBy, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import "./QuizHistory.css";

function QuizHistory({ user }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const fetchQuizzes = async () => {
      try {
        const quizzesRef = collection(db, "users", user.uid, "ai_quizzes");
        const q = query(quizzesRef, orderBy("created_at", "desc"));
        const snapshot = await getDocs(q);
        
        const quizzesData = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            created_at: data.created_at?.toDate ? data.created_at.toDate() : new Date(data.created_at),
            attempted_at: data.attempted_at?.toDate ? data.attempted_at.toDate() : (data.attempted_at ? new Date(data.attempted_at) : null)
          };
        });
        
        setQuizzes(quizzesData);
      } catch (err) {
        console.error("Error fetching quizzes:", err);
        setError("Failed to load quiz history. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchQuizzes();
  }, [user, navigate]);

  const formatDate = (date) => {
    if (!date) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  };

  const getStatusBadge = (quiz) => {
    if (quiz.attempted) {
      return (
        <span className="status-badge status-completed">
          ✓ Completed
        </span>
      );
    } else {
      return (
        <span className="status-badge status-missed">
          ⏱ Missed
        </span>
      );
    }
  };

  const handleAttemptQuiz = async (quizId) => {
    try {
      // Navigate to AIQuiz with quizId in state
      navigate("/aiquiz", { state: { quizId } });
    } catch (err) {
      console.error("Error navigating to quiz:", err);
      setError("Failed to load quiz. Please try again.");
    }
  };

  const handleViewResults = (quiz) => {
    navigate(`/quiz-results/${quiz.id}`, {
      state: { resultData: quiz },
    });
  };

  if (loading) {
    return (
      <div className="quiz-history-container">
        <div className="quiz-history-header">
          <h1>📚 Your AI Quiz History</h1>
          <button onClick={() => navigate("/")} className="back-btn">← Back to Home</button>
        </div>
        <div className="loading-container">
          <p className="loading">Loading your quiz history...</p>
        </div>
      </div>
    );
  }

  if (error && quizzes.length === 0) {
    return (
      <div className="quiz-history-container">
        <div className="quiz-history-header">
          <h1>📚 Your AI Quiz History</h1>
          <button onClick={() => navigate("/")} className="back-btn">← Back to Home</button>
        </div>
        <div className="error-container">
          <p className="error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-history-container">
      <div className="quiz-history-header">
        <h1>📚 Your AI Quiz History</h1>
        <button onClick={() => navigate("/")} className="back-btn">← Back to Home</button>
      </div>

      {quizzes.length === 0 ? (
        <div className="no-quizzes">
          <p>You haven't taken any AI quizzes yet.</p>
          <button onClick={() => navigate("/aiquiz")} className="start-quiz-btn">
            Start Your First Quiz 🚀
          </button>
        </div>
      ) : (
        <div className="quiz-history-content">
          <div className="quiz-table-wrapper">
            <table className="quiz-table">
              <thead>
                <tr>
                  <th>Date Created</th>
                  <th>Level</th>
                  <th>Questions</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((quiz) => (
                  <tr key={quiz.id} className="quiz-row">
                    <td className="quiz-date-cell">
                      <div className="date-primary">{formatDate(quiz.created_at)}</div>
                      {quiz.attempted && quiz.attempted_at && (
                        <div className="date-secondary">Attempted: {formatDate(quiz.attempted_at)}</div>
                      )}
                    </td>
                    <td>
                      <span className="level-badge">{quiz.assessment_level || "BASIC"}</span>
                    </td>
                    <td>
                      <div className="questions-info">
                        <span className="question-count">{quiz.total_questions || 0} Total</span>
                        <div className="question-breakdown">
                          <span className="mc-count">📝 {quiz.mc_questions || 0} MC</span>
                          <span className="oral-count">🎤 {quiz.oral_questions || 0} Oral</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {getStatusBadge(quiz)}
                    </td>
                    <td>
                      {quiz.attempted ? (
                        <div className="score-display">
                          <span className="score-percentage">{quiz.percentage || 0}%</span>
                          <span className="score-detail">
                            {quiz.total_score || 0} / {quiz.total_questions * 10 || 0}
                          </span>
                        </div>
                      ) : (
                        <span className="score-placeholder">—</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons">
                        {quiz.attempted ? (
                          <>
                            <button 
                              onClick={() => handleViewResults(quiz)}
                              className="action-btn view-results-btn"
                            >
                              View Results
                            </button>
                          </>
                        ) : (
                          <button 
                            onClick={() => handleAttemptQuiz(quiz.id)}
                            className="action-btn attempt-btn"
                          >
                            Attempt Now
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuizHistory;

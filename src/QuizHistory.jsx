import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
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

  if (loading) {
    return (
      <div className="quiz-history-container">
        <div className="quiz-history-header">
          <h1>📚 Your AI Quiz History</h1>
          <button onClick={() => navigate("/")} className="back-btn">← Back to Home</button>
        </div>
        <p className="loading">Loading your quiz history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="quiz-history-container">
        <div className="quiz-history-header">
          <h1>📚 Your AI Quiz History</h1>
          <button onClick={() => navigate("/")} className="back-btn">← Back to Home</button>
        </div>
        <p className="error">{error}</p>
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
        <div className="quizzes-grid">
          {quizzes.map((quiz) => (
            <div key={quiz.id} className="quiz-card">
              <div className="quiz-card-header">
                <div className="quiz-level-badge">{quiz.assessment_level || "BASIC"}</div>
                <div className="quiz-date">{formatDate(quiz.created_at)}</div>
              </div>
              
              <div className="quiz-stats">
                <div className="stat-item">
                  <span className="stat-label">Total Questions:</span>
                  <span className="stat-value">{quiz.total_questions || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">MC Questions:</span>
                  <span className="stat-value">{quiz.mc_questions || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Oral Questions:</span>
                  <span className="stat-value">{quiz.oral_questions || 0}</span>
                </div>
              </div>

              {quiz.attempted ? (
                <div className="quiz-results">
                  <div className="result-header">
                    <span className="result-label">Score:</span>
                    <span className="result-percentage">{quiz.percentage || 0}%</span>
                  </div>
                  <div className="result-details">
                    <p>Total Score: {quiz.total_score || 0} / {quiz.total_questions * 10 || 0}</p>
                    <p className="attempt-date">Attempted: {formatDate(quiz.attempted_at)}</p>
                  </div>
                  
                  {quiz.responses && quiz.responses.length > 0 && (
                    <details className="quiz-details">
                      <summary>View Details</summary>
                      <div className="responses-list">
                        {quiz.responses.map((response, idx) => (
                          <div key={idx} className="response-item">
                            <p><strong>Q{idx + 1} ({response.type}):</strong> {response.question}</p>
                            {response.type === "multiple_choice" ? (
                              <>
                                <p>Your Answer: {response.answer}</p>
                                <p className={response.isCorrect ? "correct" : "wrong"}>
                                  {response.isCorrect ? "✓ Correct" : "✗ Incorrect"} (Correct: {response.correct})
                                </p>
                              </>
                            ) : (
                              <>
                                <p>Your Response: {response.transcript}</p>
                                {response.evaluation && (
                                  <>
                                    <p>Score: {response.evaluation.score}/10</p>
                                    <p>Feedback: {response.evaluation.feedback}</p>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="quiz-not-attempted">
                  <p>Not yet attempted</p>
                  <button 
                    onClick={() => navigate("/aiquiz")} 
                    className="take-quiz-btn"
                  >
                    Take This Quiz
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default QuizHistory;

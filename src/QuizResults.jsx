import React, { useEffect, useState } from "react"
import { useNavigate, useLocation, useParams } from "react-router-dom"
import { doc, getDoc } from "firebase/firestore"
import { db } from "./firebase"
import "./AIQuiz.css"
import "./QuizResults.css"

const parseDate = (value) => {
  if (!value) return null
  if (typeof value.toDate === "function") {
    return value.toDate()
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizeResultPayload = (raw, quizId) => {
  if (!raw) return null

  const responses = raw.responses || []
  const totalQuestions =
    raw.total_questions ??
    raw.totalQuestions ??
    (responses.length > 0 ? responses.length : raw.total_questions_count) ??
    0

  const maxScoreBase = raw.max_score ?? raw.maxScore
  const maxScore = typeof maxScoreBase === "number" && maxScoreBase > 0
    ? maxScoreBase
    : totalQuestions * 10

  const totalScore = raw.total_score ?? raw.totalScore ?? 0
  const percentage =
    raw.percentage ??
    (maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0)

  return {
    quizId: raw.quizId ?? raw.id ?? quizId ?? null,
    percentage,
    totalScore,
    maxScore,
    totalQuestions,
    responses,
    promoted: Boolean(raw.promoted),
    newLevel: raw.new_level ?? raw.newLevel ?? raw.assessment_level ?? null,
    assessmentLevel: raw.assessment_level ?? raw.assessmentLevel ?? null,
    createdAt: parseDate(raw.created_at),
    attemptedAt: parseDate(raw.attempted_at),
  }
}

function QuizResults({ user }) {
  const { quizId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [result, setResult] = useState(() =>
    normalizeResultPayload(location.state?.resultData || null, quizId)
  )
  const [loading, setLoading] = useState(!result)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    if (!user || result) return

    const fetchResults = async () => {
      setLoading(true)
      setError(null)
      try {
        const quizRef = doc(db, "users", user.uid, "ai_quizzes", quizId)
        const snap = await getDoc(quizRef)
        if (!snap.exists()) {
          throw new Error("Quiz results not found.")
        }
        setResult(normalizeResultPayload({ id: quizId, ...snap.data() }, quizId))
      } catch (err) {
        console.error("Failed to load quiz results:", err)
        setError(err.message || "Unable to load quiz results.")
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [user, quizId, result])

  const handleRetake = () => navigate("/aiquiz")
  const handleHistory = () => navigate("/quiz-history")

  if (loading) {
    return (
      <div className="aiquiz-container quiz-results-page">
        <div className="aiquiz-card">
          <div className="quiz-loading-container">
            <div className="quiz-loading-animation"></div>
            <p className="loading">Fetching your quiz results...</p>
            <div className="quiz-loading-dots">
              <div className="quiz-loading-dot"></div>
              <div className="quiz-loading-dot"></div>
              <div className="quiz-loading-dot"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="aiquiz-container quiz-results-page">
        <div className="aiquiz-card">
          <div className="quiz-results-header">
            <h2>Quiz Results</h2>
            <p>{error || "We couldn't find the results for this quiz."}</p>
          </div>
          <div className="results-actions">
            <button onClick={handleHistory} className="generate-btn">
              Back to Quiz History
            </button>
            <button onClick={handleRetake} className="generate-btn secondary">
              Start New Quiz
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="aiquiz-container quiz-results-page">
      <div className="aiquiz-card">
        <div className="quiz-results-toolbar">
          <button className="results-nav-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <div className="quiz-meta">
            {result.assessmentLevel && (
              <span>Level: {result.assessmentLevel}</span>
            )}
            {result.attemptedAt && (
              <span>
                Attempted:{" "}
                {new Intl.DateTimeFormat("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(result.attemptedAt)}
              </span>
            )}
          </div>
        </div>

        <div className="quiz-results-header">
          <h2>🎯 Quiz Results</h2>
          <p>Here's how you performed on this assessment</p>
        </div>

        <div className="quiz-results-summary">
          <div className="circular-score-container">
            <svg width="180" height="180">
              <circle className="circular-score-bg" cx="90" cy="90" r="80"></circle>
              <circle
                className="circular-score-progress"
                cx="90"
                cy="90"
                r="80"
                strokeDasharray={`${2 * Math.PI * 80}`}
                strokeDashoffset={`${2 * Math.PI * 80 * (1 - result.percentage / 100)}`}
              ></circle>
            </svg>
            <div className="circular-score-text">
              <div className="circular-score-value">{result.percentage}%</div>
              <div className="circular-score-label">Score</div>
            </div>
          </div>

          <div className="score-breakdown">
            <div className="score-item">
              <div className="score-value">{result.totalScore}</div>
              <div className="score-label">Your Points</div>
            </div>
            <div className="score-item">
              <div className="score-value">{result.maxScore}</div>
              <div className="score-label">Total Points</div>
            </div>
            <div className="score-item">
              <div className="score-value">{result.totalQuestions}</div>
              <div className="score-label">Questions</div>
            </div>
          </div>
        </div>

        {result.promoted && result.newLevel && (
          <div className="promotion-banner">
            🎉 Congratulations! You've been promoted to <strong>{result.newLevel}</strong> level!
          </div>
        )}

        <div className="feedback-list">
          {result.responses.length > 0 ? (
            result.responses.map((response, index) => (
              <div
                key={`${response.questionId || index}-${index}`}
                className={`feedback-item ${
                  response.type === "multiple_choice"
                    ? response.isCorrect
                      ? "correct"
                      : "wrong"
                    : ""
                }`}
              >
                <div className="feedback-item-header">
                  <h3 className="feedback-item-title">Question {index + 1}</h3>
                  <span
                    className={`feedback-item-type ${
                      response.type === "oral" ? "oral" : "mc"
                    }`}
                  >
                    {response.type === "oral" ? "🎤 Oral" : "📝 MC"}
                  </span>
                </div>

                <div className="feedback-item-content">
                  <p>
                    <strong>Question:</strong> {response.question}
                  </p>
                  {response.type === "multiple_choice" ? (
                    <>
                      <p>
                        <strong>Your Answer:</strong> {response.answer || "—"}
                      </p>
                      <p>
                        <strong>Correct Answer:</strong> {response.correct || "—"}
                      </p>
                      <div className="feedback-score-display">
                        {response.isCorrect ? "✓ Correct" : "✗ Incorrect"}
                      </div>
                    </>
                  ) : (
                    <>
                      <p>
                        <strong>Your Response:</strong>{" "}
                        {response.transcript || "No response recorded."}
                      </p>
                      {response.evaluation ? (
                        <>
                          <div className="feedback-score-display">
                            Score: {response.evaluation.score}/10
                          </div>
                          <div className="feedback-evaluation">
                            <div className="feedback-evaluation-header">
                              <h4 className="feedback-evaluation-title">Feedback</h4>
                            </div>
                            <div className="feedback-evaluation-content">
                              <p>{response.evaluation.feedback}</p>

                              {response.evaluation.suggestions &&
                                response.evaluation.suggestions.length > 0 && (
                                  <>
                                    <h4>Suggestions for Improvement:</h4>
                                    <ul>
                                      {response.evaluation.suggestions.map((suggestion, suggestionIdx) => (
                                        <li key={suggestionIdx}>{suggestion}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="response-feedback">No evaluation data.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="no-responses">No response details available.</div>
          )}
        </div>

        <div className="results-actions">
          <button onClick={handleRetake} className="generate-btn">
            Take Another Quiz 🔁
          </button>
          <button onClick={handleHistory} className="generate-btn secondary">
            View Quiz History
          </button>
          <button onClick={() => navigate("/")} className="generate-btn tertiary">
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuizResults


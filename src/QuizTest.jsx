import React, { useEffect, useState } from "react";
import { db } from "./firebase";  // your Firestore instance
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { auth } from "./firebase"; // to get current user
import "./QuizTest.css";

export default function QuizTest() {
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  // Fetch questions from Firestore
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "questions"));
        const qList = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setQuestions(qList);
      } catch (err) {
        console.error("Error fetching questions:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, []);

  if (loading) {
    return (
      <div className="quiz-container">
        <div className="loading-container">
          <div className="loading-text">Loading questions...</div>
        </div>
      </div>
    );
  }
  
  if (questions.length === 0) {
    return (
      <div className="quiz-container">
        <div className="no-questions-container">
          <div className="no-questions-text">No questions found!</div>
        </div>
      </div>
    );
  }

  const q = questions[current];
  
  // Calculate progress and statistics
  const answeredCount = Object.keys(answers).length;
  const remainingCount = questions.length - answeredCount;
  const progressPercentage = (answeredCount / questions.length) * 100;

  const handleSelect = (qid, optionIndex) => {
    setAnswers((prev) => ({ ...prev, [qid]: optionIndex }));
  };

  const next = () => {
    if (answers[q.id] === undefined) return; // force selection
    if (current < questions.length - 1) setCurrent(current + 1);
  };

  const prev = () => {
    if (current > 0) setCurrent(current - 1);
  };

  const handleSubmit = async () => {
    if (answers[q.id] === undefined) return; // last question must be answered

    // Calculate number of correct answers
    let correctCount = 0;
    questions.forEach((question) => {
      if (answers[question.id] === question.correctIndex) correctCount += 1;
    });

    setScore(correctCount);

    try {
      await addDoc(collection(db, "Student_responses"), {
        userId: auth.currentUser?.uid || "testUser",
        responses: answers,
        score: correctCount,
        totalQuestions: questions.length,
        timestamp: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Error submitting responses:", err);
    }
  };

  // If quiz submitted, show results
  if (submitted) {
    return (
      <div className="quiz-container">
        <div className="results-container">
          <div className="results-header">
            <h2 className="results-title">🎉 Quiz Completed!</h2>
            <div className="score-display">
              Your Score: {score} / {questions.length} 
              <span style={{ fontSize: '18px', color: '#666', marginLeft: '10px' }}>
                ({Math.round((score / questions.length) * 100)}%)
              </span>
            </div>
          </div>

          <div className="review-section">
            <h3 className="review-title">📝 Answer Review</h3>
            {questions.map((qItem, idx) => {
              const userAnswer = answers[qItem.id];
              const isCorrect = userAnswer === qItem.correctIndex;

              return (
                <div key={qItem.id} className="review-item">
                  <div className="review-question">
                    Q{idx + 1}: {qItem.question}
                  </div>
                  {qItem.options.map((opt, i) => {
                    const correct = i === qItem.correctIndex;
                    const selected = i === userAnswer;
                    let optionClass = 'review-option neutral';
                    
                    if (correct) {
                      optionClass = 'review-option correct';
                    } else if (selected && !correct) {
                      optionClass = 'review-option incorrect';
                    }
                    
                    return (
                      <div key={i} className={optionClass}>
                        {opt} {correct ? "✅" : selected && !correct ? "❌" : ""}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Quiz in progress
  return (
    <div className="quiz-container">
      <div className="quiz-card">
        {/* Progress Section */}
        <div className="progress-section">
          <div className="progress-header">
            <div className="progress-text">
              Question {current + 1} of {questions.length}
            </div>
            <div className="progress-text">
              {Math.round(progressPercentage)}% Complete
            </div>
          </div>
          
          <div className="progress-bar-container">
            <div 
              className="progress-bar" 
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          
          <div className="question-counter">
            <div className="counter-item counter-answered">
              Answered: {answeredCount}
            </div>
            <div className="counter-item counter-remaining">
              Remaining: {remainingCount}
            </div>
            <div className="counter-item counter-total">
              Total: {questions.length}
            </div>
          </div>
        </div>

        {/* Question Section */}
        <div className="question-section">
          <div className="question-title">
            Question {current + 1}
          </div>
          <div className="question-text">
            {q.question}
          </div>
        </div>

        {/* Options Section */}
        <div className="options-section">
          <div className="options-container">
            {q.options.map((opt, idx) => (
              <div key={idx} className="option-item">
                <label className={`option-label ${answers[q.id] === idx ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name={q.id}
                    className="option-radio"
                    checked={answers[q.id] === idx}
                    onChange={() => handleSelect(q.id, idx)}
                  />
                  <span className="option-text">{opt}</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Section */}
        <div className="navigation-buttons">
          <button 
            className="nav-button prev" 
            onClick={prev} 
            disabled={current === 0}
          >
            ← Previous
          </button>

          {current < questions.length - 1 ? (
            <button 
              className="nav-button next" 
              onClick={next} 
              disabled={answers[q.id] === undefined}
            >
              Next →
            </button>
          ) : (
            <button 
              className="nav-button submit" 
              onClick={handleSubmit} 
              disabled={answers[q.id] === undefined}
            >
              Submit Quiz
            </button>
          )}
        </div>

        {/* Debug Info (can be removed in production) */}
        <div className="debug-info">
          <details>
            <summary>Debug Info</summary>
            <div>
              <strong>Current Question:</strong> {current + 1}<br />
              <strong>Answered Questions:</strong> {answeredCount}<br />
              <strong>Progress:</strong> {Math.round(progressPercentage)}%<br />
              <details style={{ marginTop: '10px' }}>
                <summary>Answers JSON</summary>
                <pre>{JSON.stringify(answers, null, 2)}</pre>
              </details>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

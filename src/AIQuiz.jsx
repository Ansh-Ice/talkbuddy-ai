import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import "./AIQuiz.css";
import "./OralQuestion.css";

function AIQuiz({ user, userProfile }) {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState([]); // For MC questions
  const [oralTranscripts, setOralTranscripts] = useState([]); // For oral questions
  const [oralEvaluations, setOralEvaluations] = useState([]); // Store oral question evaluations
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [quizId, setQuizId] = useState(null);
  
  // Speech recognition state for oral questions
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentEvaluation, setCurrentEvaluation] = useState(null);
  const recognitionRef = useRef(null);
  const navigate = useNavigate();

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return; // Speech recognition not available
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setError("");
    };

    recognition.onresult = (event) => {
      let newText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          newText += event.results[i][0].transcript + " ";
        }
      }
      if (newText.trim()) {
        setTranscript(prev => (prev + " " + newText.trim()).trim());
      }
    };

    recognition.onend = () => {
      if (listening) {
        setTimeout(() => {
          if (recognitionRef.current && listening) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.error("Recognition restart failed:", e);
            }
          }
        }, 100);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === 'not-allowed') {
        setError("Microphone access was denied. Please allow microphone access.");
      }
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onend = null;
      recognition.stop();
    };
  }, [listening]);

  // Generate AI-based Assessment
  const generateAssessment = async () => {
    if (!user) return alert("Please log in first!");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("http://127.0.0.1:8000/generate_assessment/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.uid,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: "Failed to generate quiz" }));
        throw new Error(errorData.detail || "Failed to generate assessment");
      }

      const data = await res.json();
      if (data.questions && data.quiz_id) {
        setQuestions(data.questions);
        setQuizId(data.quiz_id);
        setUserAnswers(Array(data.questions.length).fill(""));
        setOralTranscripts(Array(data.questions.length).fill(""));
        setOralEvaluations(Array(data.questions.length).fill(null));
        setCurrentIndex(0);
      } else {
        throw new Error("No questions received.");
      }
    } catch (err) {
      setError(err.message || "Failed to generate assessment. Please retry.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Handle option selection for MC questions
  const handleSelect = (option) => {
    const updated = [...userAnswers];
    updated[currentIndex] = option;
    setUserAnswers(updated);
  };

  // Speech recognition controls
  const startListening = () => {
    if (recognitionRef.current) {
      try {
        setTranscript("");
        recognitionRef.current.start();
        setListening(true);
      } catch (err) {
        console.error("Error starting speech recognition:", err);
        setError("Failed to access microphone. Please check permissions.");
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }
  };

  // Submit oral answer and evaluate
  const submitOralAnswer = async () => {
    if (!transcript.trim() || isEvaluating) {
      return;
    }

    setIsEvaluating(true);
    setError("");
    setCurrentEvaluation(null);

    try {
      const currentQuestion = questions[currentIndex];
      
      // Call evaluation API
      const response = await fetch('http://localhost:8000/api/oral-quiz/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.uid || 'anonymous',
          questionId: currentQuestion.id,
          questionText: currentQuestion.question,
          userResponse: transcript
        })
      });
      
      if (!response.ok) {
        throw new Error(`Evaluation failed: ${response.status}`);
      }

      const evaluationResult = await response.json();
      const normalizedScore = Math.max(1, Math.min(10, Number(evaluationResult.score) || 5));
      
      const evalData = {
        score: parseFloat(normalizedScore.toFixed(1)),
        feedback: evaluationResult.feedback || 'Thank you for your response!',
        suggestions: Array.isArray(evaluationResult.suggestions) 
          ? evaluationResult.suggestions.slice(0, 3)
          : [],
        corrections: evaluationResult.corrections || []
      };

      setCurrentEvaluation(evalData);
      
      // Store transcript and evaluation
      const updatedTranscripts = [...oralTranscripts];
      updatedTranscripts[currentIndex] = transcript;
      setOralTranscripts(updatedTranscripts);

      const updatedEvaluations = [...oralEvaluations];
      updatedEvaluations[currentIndex] = evalData;
      setOralEvaluations(updatedEvaluations);

    } catch (err) {
      console.error("Error in evaluation:", err);
      setError("Failed to evaluate response. Please try again.");
    } finally {
      setIsEvaluating(false);
      stopListening();
    }
  };

  // Go to next question
  const handleNext = () => {
    const currentQuestion = questions[currentIndex];
    
    // For oral questions, ensure they've submitted
    if (currentQuestion.type === "oral") {
      if (!oralEvaluations[currentIndex]) {
        setError("Please submit your spoken answer first.");
        return;
      }
    } else {
      // For MC questions, ensure they've selected an answer
      if (!userAnswers[currentIndex]) {
        setError("Please select an answer.");
        return;
      }
    }

    // Clear current state
    setTranscript("");
    setCurrentEvaluation(null);
    setError("");

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleSubmitAssessment();
    }
  };

  // Submit and evaluate all answers
  const handleSubmitAssessment = async () => {
    setLoading(true);
    try {
      // Prepare responses
      const responses = [];
      const scores = [];
      let totalScore = 0;
      let maxScore = 0;

      questions.forEach((q, i) => {
        if (q.type === "multiple_choice") {
          const isCorrect = userAnswers[i] === q.correct;
          const score = isCorrect ? 10 : 0;
          totalScore += score;
          maxScore += 10;
          
          responses.push({
            questionId: q.id,
            question: q.question,
            type: "multiple_choice",
            answer: userAnswers[i],
            correct: q.correct,
            isCorrect: isCorrect
          });
          
          scores.push({
            questionId: q.id,
            type: "multiple_choice",
            score: score,
            maxScore: 10
          });
        } else if (q.type === "oral") {
          const evalData = oralEvaluations[i];
          if (evalData) {
            totalScore += evalData.score;
            maxScore += 10;
            
            responses.push({
              questionId: q.id,
              question: q.question,
              type: "oral",
              transcript: oralTranscripts[i],
              evaluation: evalData
            });
            
            scores.push({
              questionId: q.id,
              type: "oral",
              score: evalData.score,
              maxScore: 10,
              feedback: evalData.feedback,
              suggestions: evalData.suggestions,
              corrections: evalData.corrections
            });
          }
        }
      });

      const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      // Submit to backend
      const res = await fetch("http://127.0.0.1:8000/submit_quiz/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.uid,
          quiz_id: quizId,
          responses: responses,
          scores: scores,
          total_score: totalScore,
          percentage: percentage
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit quiz");
      }

      const data = await res.json();
      
      setResult({
        totalScore,
        maxScore,
        percentage,
        responses,
        promoted: data.promoted || false,
        newLevel: data.new_level
      });

    } catch (err) {
      console.error("Submission error:", err);
      setError("Failed to submit assessment.");
    } finally {
      setLoading(false);
    }
  };

  // Restart quiz
  const resetQuiz = () => {
    setQuestions([]);
    setUserAnswers([]);
    setOralTranscripts([]);
    setOralEvaluations([]);
    setCurrentIndex(0);
    setResult(null);
    setQuizId(null);
    setTranscript("");
    setCurrentEvaluation(null);
    stopListening();
  };

  // Get current question
  const currentQuestion = questions.length > 0 ? questions[currentIndex] : null;
  const isOralQuestion = currentQuestion?.type === "oral";
  const isMCQuestion = currentQuestion?.type === "multiple_choice";

  // -------------------- UI --------------------
  if (loading)
    return (
      <div className="aiquiz-container">
        <div className="aiquiz-card">
          <div className="quiz-loading-container">
            <div className="quiz-loading-animation"></div>
            <p className="loading">{questions.length > 0 ? "Submitting your quiz... please wait" : "Generating your personalized quiz... please wait"}</p>
            <div className="quiz-loading-dots">
              <div className="quiz-loading-dot"></div>
              <div className="quiz-loading-dot"></div>
              <div className="quiz-loading-dot"></div>
            </div>
          </div>
        </div>
      </div>
    );

  if (error && !questions.length)
    return (
      <div className="aiquiz-container">
        <div className="aiquiz-card">
          <p className="error">{error}</p>
          <button onClick={resetQuiz} className="generate-btn" style={{ marginTop: "20px" }}>Try Again</button>
        </div>
      </div>
    );

  // After quiz submission
  if (result)
    return (
      <div className="aiquiz-container">
        <div className="aiquiz-card">
          <div className="aiquiz-header">
            <h2>🎯 Quiz Completed!</h2>
          </div>
          
          <div style={{ textAlign: "center", marginBottom: "25px" }}>
            <div className="score-display">
              Score: {result.totalScore}/{result.maxScore} ({result.percentage}%)
            </div>
          </div>
          
          {result.promoted && (
            <div className="promotion-banner">
              🎉 Congratulations! You've been promoted to <strong>{result.newLevel}</strong> level!
            </div>
          )}

          <div className="feedback-list">
            {result.responses.map((r, i) => (
              <div
                key={i}
                className={`feedback-item ${r.type === "multiple_choice" ? (r.isCorrect ? "correct" : "wrong") : ""}`}
              >
                <p>
                  <strong>Q{i + 1} ({r.type === "oral" ? "Oral" : "Multiple Choice"}):</strong> {r.question}
                </p>
                {r.type === "multiple_choice" ? (
                  <>
                    <p><strong>Your Answer:</strong> {r.answer}</p>
                    <p><strong>Correct Answer:</strong> {r.correct}</p>
                  </>
                ) : (
                  <>
                    <p><strong>Your Response:</strong> {r.transcript}</p>
                    <p><strong>Score:</strong> {r.evaluation.score}/10</p>
                    <p><strong>Feedback:</strong> {r.evaluation.feedback}</p>
                    {r.evaluation.suggestions && r.evaluation.suggestions.length > 0 && (
                      <div className="suggestions">
                        <strong>Suggestions:</strong>
                        <ul>
                          {r.evaluation.suggestions.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "15px", justifyContent: "center", marginTop: "30px", flexWrap: "wrap" }}>
            <button onClick={resetQuiz} className="generate-btn">Take Another Quiz 🔁</button>
            <button onClick={() => navigate("/")} className="generate-btn" style={{ background: "linear-gradient(135deg, #6c757d, #5a6268)" }}>Back to Home</button>
          </div>
        </div>
      </div>
    );

  // Show quiz questions
  if (questions.length > 0 && currentQuestion)
    return (
      <div className="aiquiz-container">
        <div className="aiquiz-card">
          <div className="aiquiz-header">
            <h2>
              Question {currentIndex + 1}/{questions.length}
            </h2>
            {isOralQuestion && <span className="question-type-badge">🎤 Oral Question</span>}
            {isMCQuestion && <span className="question-type-badge">📝 Multiple Choice</span>}
          </div>
          <p className="question">{currentQuestion.question}</p>

        {isMCQuestion && (
          <>
            <div className="options">
              {currentQuestion.options.map((opt, idx) => (
                <button
                  key={idx}
                  className={`option-btn ${
                    userAnswers[currentIndex] === opt ? "active" : ""
                  }`}
                  onClick={() => handleSelect(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button
              onClick={handleNext}
              disabled={!userAnswers[currentIndex]}
              className="next-btn"
            >
              {currentIndex < questions.length - 1 ? "Next ➡" : "Submit ✅"}
            </button>
          </>
        )}

        {isOralQuestion && (
          <>
            {!oralEvaluations[currentIndex] ? (
              <>
                <div className="oral-question-container">
                  {!listening && !transcript && (
                    <button onClick={startListening} className="start-listening-btn">
                      🎤 Start Speaking
                    </button>
                  )}
                  
                  {listening && (
                    <div className="listening-indicator">
                      <span className="pulse">🔴 Recording...</span>
                      <button onClick={stopListening} className="stop-btn">Stop</button>
                    </div>
                  )}

                  {transcript && (
                    <div className="transcript-display">
                      <p><strong>Your response:</strong></p>
                      <p>{transcript}</p>
                    </div>
                  )}

                  {transcript && !isEvaluating && !oralEvaluations[currentIndex] && (
                    <button onClick={submitOralAnswer} className="submit-oral-btn">
                      Submit Answer
                    </button>
                  )}

                  {isEvaluating && (
                    <p className="evaluating">⏳ Evaluating your response...</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="evaluation-display">
                  <p><strong>Your response:</strong> {oralTranscripts[currentIndex]}</p>
                  <div className="score-display">
                    <strong>Score: {oralEvaluations[currentIndex].score}/10</strong>
                  </div>
                  <p><strong>Feedback:</strong> {oralEvaluations[currentIndex].feedback}</p>
                  {oralEvaluations[currentIndex].suggestions && oralEvaluations[currentIndex].suggestions.length > 0 && (
                    <div className="suggestions">
                      <strong>Suggestions:</strong>
                      <ul>
                        {oralEvaluations[currentIndex].suggestions.map((s, idx) => (
                          <li key={idx}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <button onClick={handleNext} className="next-btn">
                  {currentIndex < questions.length - 1 ? "Next ➡" : "Submit Quiz ✅"}
                </button>
              </>
            )}
          </>
        )}

          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );

  // Default state
  return (
    <div className="aiquiz-container">
      <div className="aiquiz-card">
        <div className="aiquiz-header">
          <h2>🧠 AI Practice Assessment</h2>
        </div>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p style={{ fontSize: "16px", color: "#64748b", marginBottom: "30px", lineHeight: "1.6" }}>
            Take a personalized quiz based on your current level (<strong>{userProfile?.assessmentLevel || "BASIC"}</strong>). 
            The quiz includes both multiple-choice and oral questions.
          </p>
          <button onClick={generateAssessment} className="generate-btn">
            Start AI Quiz 🚀
          </button>
        </div>
      </div>
    </div>
  );
}

export default AIQuiz;
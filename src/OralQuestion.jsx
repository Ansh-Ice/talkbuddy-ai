import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, addDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase"; // your firebase config
import "./OralQuestion.css";

function OralQuestion({ user, userProfile, refreshUserProfile }) {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [scores, setScores] = useState([]);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const recognitionRef = useRef(null);
  const navigate = useNavigate();

  const TEST_USER_ID = user?.uid || "test_user_001";

  useEffect(() => {
    const fetchQuestions = async () => {
      const snapshot = await getDocs(collection(db, "OralQuestions"));
      setQuestions(snapshot.docs.map(doc => doc.data()));
    };
    fetchQuestions();
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsRecognizing(true);
    };

    recognition.onresult = (event) => {
      let newText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          newText += event.results[i][0].transcript + " ";
        }
      }
      
      // Only add to transcript if we have new final results
      if (newText.trim()) {
        setTranscript(prevTranscript => {
          const combined = prevTranscript + " " + newText.trim();
          return combined.trim();
        });
      }
    };

    recognition.onend = () => {
      setIsRecognizing(false);
      // Auto-restart recognition if we're still in listening mode
      if (listening) {
        setTimeout(() => {
          if (recognitionRef.current && listening) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.log("Recognition restart failed:", e);
            }
          }
        }, 100);
      }
    };

    recognition.onerror = (event) => {
      console.log("Speech recognition error:", event.error);
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        // Auto-restart on common errors
        if (listening) {
          setTimeout(() => {
            if (recognitionRef.current && listening) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                console.log("Recognition restart after error failed:", e);
              }
            }
          }, 1000);
        }
      }
    };

    recognitionRef.current = recognition;
  }, [listening]);

  // Precompute scoring metrics so they are available for effects and rendering
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const maxPossibleScore = questions.length * 10; // Assuming max score per question is 10
  const percentage = questions.length > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;

  // Update user profile when oral test is completed (must not be inside a conditional render)
  useEffect(() => {
    if (!quizCompleted || !user) return;
    const updateUserProfile = async () => {
      try {
        await updateDoc(doc(db, "users", user.uid), {
          oralTestCompleted: true,
          oralTestScore: totalScore,
          oralTestTotalQuestions: questions.length,
          oralTestPercentage: percentage,
          assessmentCompleted: true,
          assessmentCompletedAt: new Date()
        });
        if (typeof refreshUserProfile === "function") {
          refreshUserProfile();
        }
        navigate('/');
      } catch (error) {
        console.error("Error updating user profile:", error);
      }
    };
    updateUserProfile();
  }, [quizCompleted, user, totalScore, questions.length, percentage, navigate, refreshUserProfile]);

  const startListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
      setListening(true);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      setIsRecognizing(false);
    }
  };

  const submitAnswer = async () => {
    const question = questions[currentIndex];
    if (!question) return;
    try {
      const response = await fetch("http://127.0.0.1:8000/evaluate_answer/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: question.prompt,
          answer: transcript,
          skill_tested: question.skill_tested,
          type: question.type
        }),
      });

      const data = await response.json();
      setEvaluation(data);

      // Store the score for this question
      const newScore = {
        questionIndex: currentIndex,
        questionText: question.prompt,
        score: data.score,
        feedback: data.feedback
      };
      setScores(prevScores => [...prevScores, newScore]);

      await addDoc(collection(db, "StudentResponses"), {
        student_id: TEST_USER_ID,
        question_id: question.id,
        transcript,
        score: data.score,
        feedback: data.feedback,
        skill_tested: question.skill_tested,
        type: question.type,
        timestamp: new Date()
      });
    } catch (err) {
      console.error("Error submitting answer:", err);
      setEvaluation({ score: 0, feedback: "Could not submit or evaluate answer" });
    }
  };

  const nextQuestion = () => {
    setTranscript("");
    setEvaluation(null);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Quiz completed
      // Ensure microphone is stopped when finishing
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // no-op
        }
      }
      setQuizCompleted(true);
    }
  };

  // Check if user is authenticated
  if (!user) {
    return (
      <div className="oq-container oq-loading">
        <div className="oq-card">
          <div className="oq-header">
            <h2 className="oq-title">Authentication Required</h2>
          </div>
          <div className="oq-main">
            <p>Please log in to access the oral test.</p>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) return <div className="oq-container oq-loading">Loading questions...</div>;
  
  // Show completion screen if quiz is completed
  if (quizCompleted) {
    // Use precomputed totals from top-level
    return (
      <div className="oq-container">
        <div className="oq-card">
          <header className="oq-header">
            <h2 className="oq-title">Assessment Completed! 🎉</h2>
          </header>
          
          <main className="oq-main">
            <div className="oq-completion-summary">
              <div className="oq-total-score">
                <h3>Your Oral Test Score</h3>
                <div className="oq-score-display">
                  <span className="oq-score-number">{totalScore}</span>
                  <span className="oq-score-max">/ {maxPossibleScore}</span>
                </div>
                <div className="oq-percentage">{percentage}%</div>
              </div>
              
              <div className="oq-score-breakdown">
                <h4>Score Breakdown</h4>
                <div className="oq-scores-list">
                  {scores.map((score, index) => (
                    <div key={index} className="oq-score-item">
                      <div className="oq-score-question">
                        <strong>Question {score.questionIndex + 1}:</strong>
                        <span className="oq-score-value">{score.score}/10</span>
                      </div>
                      <div className="oq-score-feedback">{score.feedback}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="oq-continue-section">
                <button 
                  className="btn btn-dashboard" 
                  onClick={() => navigate('/')}
                >
                  Go to Dashboard 🏠
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }
  
  const question = questions[currentIndex];

  return (
    <div className="oq-container">
      <div className="oq-card">
        <header className="oq-header">
          <h2 className="oq-title">Oral Question</h2>
          <div className="oq-pill">Question {currentIndex + 1} / {questions.length}</div>
        </header>

        <main className="oq-main">
          <p className="oq-question">{question.prompt}</p>

          <div className="oq-transcript">
            <label className="oq-label">
              Transcript 
              {listening && (
                <span className="oq-status">
                  {isRecognizing ? "🎤 Listening..." : "⏸ Paused"}
                </span>
              )}
            </label>
            <div className="oq-transcript-box" aria-live="polite">
              {transcript || <span className="oq-muted">(Nothing yet — start speaking)</span>}
            </div>
          </div>

          <div className="oq-controls">
            {!listening ? (
              <button className="btn btn-start" onClick={startListening}>🎙 Start</button>
            ) : (
              <button className="btn btn-stop" onClick={stopListening}>⏹ Stop</button>
            )}

            <button className="btn btn-submit" onClick={submitAnswer} disabled={!transcript}>📤 Submit</button>
          </div>

          {evaluation && (
            <div className="oq-eval">
              <div className="oq-eval-row">
                <div className="oq-score">Score: <strong>{evaluation.score}</strong></div>
                <div className="oq-feedback">{evaluation.feedback}</div>
              </div>
              <button className="btn btn-next" onClick={nextQuestion}>
                {currentIndex < questions.length - 1 ? "➡ Next" : "🏁 Finish"}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default OralQuestion;

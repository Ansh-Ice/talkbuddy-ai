import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, addDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import "./OralQuestion.css";

const MAX_SCORE_PER_QUESTION = 10;

const calculateOralStats = (scores = [], totalQuestions = 0) => {
  const aggregate = scores.reduce((sum, entry) => sum + (Number(entry.score) || 0), 0);
  const normalizedScore = Number(aggregate.toFixed(1));
  const percentage = totalQuestions > 0
    ? Math.round((normalizedScore / (totalQuestions * MAX_SCORE_PER_QUESTION)) * 100)
    : 0;

  return {
    normalizedScore,
    totalQuestions,
    percentage
  };
};

const determineLevelFromPercentage = (percentage) => {
  if (percentage >= 80) return "ADVANCED";
  if (percentage >= 55) return "INTERMEDIATE";
  return "BASIC";
};

// Helper function to extract keywords from text
const extractKeywords = (text) => {
  const commonWords = new Set(['what', 'how', 'why', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did']);
  return [...new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => 
        word.length > 3 && 
        !commonWords.has(word) &&
        !word.match(/^[0-9]+$/)
      )
  )];
};

function OralQuestion({ user, userProfile, refreshUserProfile }) {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [scores, setScores] = useState([]);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const recognitionRef = useRef(null);
  const navigate = useNavigate();

  // Redirect away if oral test already completed (based on users collection profile)
  useEffect(() => {
    if (userProfile?.oralTestCompleted) {
      navigate("/", { replace: true });
    }
  }, [userProfile, navigate]);

  // Ensure we have the latest user profile when entering the oral test
  useEffect(() => {
    if (typeof refreshUserProfile === "function") {
      refreshUserProfile();
    }
  }, [refreshUserProfile]);

  // Sample questions if database fails
  const sampleQuestions = [
    { id: "sample1", prompt: "Tell me about your favorite hobby and why you enjoy it." },
    { id: "sample2", prompt: "Describe your last vacation. Where did you go and what did you do?" },
    { id: "sample3", prompt: "What are your plans for the next five years?" }
  ];

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in your browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsRecognizing(true);
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
      setIsRecognizing(false);
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
        setError("Microphone access was denied. Please allow microphone access in your browser settings.");
      }
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onend = null;
      recognition.stop();
    };
  }, [listening]);

  // Fetch questions from Firestore
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const snapshot = await getDocs(collection(db, "OralQuestions"));
        if (snapshot.empty) {
          setQuestions(sampleQuestions);
          return;
        }
        const questionsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setQuestions(questionsData);
      } catch (err) {
        console.error("Error fetching questions, using sample questions:", err);
        setQuestions(sampleQuestions);
      }
    };
    fetchQuestions();
  }, []);

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

  const submitAnswer = async () => {
    if (!transcript.trim() || isEvaluating || hasSubmitted) {
      return;
    }

    setIsEvaluating(true);
    setError("");
    
    // Clear any previous evaluation
    setEvaluation(null);
    setHasSubmitted(true);

    try {
      const currentQuestion = questions[currentIndex];
      
      // Show immediate feedback
      const immediateEval = {
        score: 0,
        feedback: "Processing your response...",
        suggestions: ["Please wait while we analyze your speech..."]
      };
      setEvaluation(immediateEval);
      
      // Call LLaMA API for evaluation
      console.log('Sending request to LLaMA API...');
      const response = await fetch('http://localhost:8000/api/oral-quiz/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.uid || 'anonymous',
          questionId: currentQuestion.id,
          questionText: currentQuestion.prompt,
          userResponse: transcript
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('LLaMA API error:', errorText);
        throw new Error(`Server responded with status ${response.status}`);
      }

      const evaluationResult = await response.json();
      console.log('Evaluation result:', evaluationResult);

      // Validate the response structure
      if (!evaluationResult || typeof evaluationResult.score === 'undefined') {
        console.error('Invalid response from evaluation service:', evaluationResult);
        throw new Error('Invalid response format from evaluation service');
      }

      // Ensure score is between 1 and 10
      const normalizedScore = Math.max(1, Math.min(10, Number(evaluationResult.score) || 5));
      
      const result = {
        score: parseFloat(normalizedScore.toFixed(1)),
        feedback: evaluationResult.feedback || 'Thank you for your response!',
        suggestions: Array.isArray(evaluationResult.suggestions) 
          ? evaluationResult.suggestions.slice(0, 3)
          : [
              'Try to speak in complete sentences',
              'Practice your pronunciation of difficult words'
            ]
      };
      
      // Add corrections if available
      if (evaluationResult.corrections && evaluationResult.corrections.length > 0) {
        result.corrections = evaluationResult.corrections;
      }

      // Update with final evaluation
      setEvaluation(result);

      const newScore = {
        questionIndex: currentIndex,
        questionId: currentQuestion.id,
        score: result.score,
        feedback: result.feedback,
        suggestions: result.suggestions,
        timestamp: new Date().toISOString()
      };

      setScores(prevScores => {
        const existingScoreIndex = prevScores.findIndex(
          s => s.questionId === currentQuestion.id
        );
        
        if (existingScoreIndex >= 0) {
          const updatedScores = [...prevScores];
          updatedScores[existingScoreIndex] = newScore;
          return updatedScores;
        } else {
          return [...prevScores, newScore];
        }
      });

      // Save to Firestore if user is logged in
      if (user?.uid) {
        try {
          await addDoc(collection(db, "StudentResponses"), {
            student_id: user.uid,
            question_id: currentQuestion.id,
            question_text: currentQuestion.prompt,
            transcript,
            score: result.score,
            feedback: result.feedback,
            suggestions: result.suggestions,
            timestamp: new Date().toISOString()
          });
          console.log('Successfully saved to Firestore');
        } catch (dbError) {
          console.error('Error saving to Firestore:', dbError);
          // Don't fail the whole operation if Firestore save fails
        }
      }

    } catch (err) {
      console.error("Error in evaluation:", err);
      
      // Fallback to client-side evaluation if LLaMA API fails
      const fallbackScore = Math.min(10, Math.max(1, Math.floor(Math.random() * 7) + 3)); // Random score between 3-10
      const fallbackFeedback = "Evaluation service is temporarily unavailable. Here's a temporary evaluation.";
      
      const fallbackEval = {
        score: fallbackScore,
        feedback: fallbackFeedback,
        suggestions: [
          "Make sure your answer is complete and relevant to the question.",
          "Try to use proper grammar and complete sentences.",
          "Speak clearly and at a moderate pace."
        ]
      };
      
      setEvaluation(fallbackEval);
      setError("Note: Using fallback evaluation. " + err.message);
    } finally {
      setIsEvaluating(false);
    }
  };

  const getQuizStats = () => {
    const quizScore = userProfile?.quizScore ?? 0;
    const quizTotalQuestions = userProfile?.quizTotalQuestions ?? 0;
    const quizPercentage =
      userProfile?.quizPercentage ??
      (quizTotalQuestions > 0 ? Math.round((quizScore / quizTotalQuestions) * 100) : 0);

    return {
      quizScore,
      quizTotalQuestions,
      quizPercentage
    };
  };

  const finalizeAssessment = async () => {
    if (!user?.uid) {
      navigate("/", { replace: true });
      return;
    }

    const { normalizedScore, percentage: oralTestPercentage } = calculateOralStats(
      scores,
      questions.length
    );

    const oralTestTotalQuestions = questions.length;
    const quizStats = getQuizStats();
    const hasQuizData = Boolean(userProfile?.quizCompleted) && quizStats.quizTotalQuestions > 0;
    const combinedPercentage = hasQuizData
      ? Math.round((quizStats.quizPercentage + oralTestPercentage) / 2)
      : oralTestPercentage;
    const assessmentLevel = determineLevelFromPercentage(combinedPercentage);

    const now = new Date();
    const assessmentCompletedAtReadable = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "long",
      timeStyle: "medium"
    }).format(now);

    const createdAtNumeric = typeof userProfile?.createdAt === "number"
      ? userProfile.createdAt
      : userProfile?.createdAt?.toMillis?.()
        ? userProfile.createdAt.toMillis()
        : Date.now();

    const payload = {
      assessmentCompleted: true,
      assessmentCompletedAt: assessmentCompletedAtReadable,
      assessmentCompletedAtTs: serverTimestamp(),
      assessmentLevel,
      assessmentOverallPercentage: combinedPercentage,
      oralTestCompleted: true,
      oralTestScore: normalizedScore,
      oralTestTotalQuestions,
      oralTestTotalPossible: oralTestTotalQuestions * MAX_SCORE_PER_QUESTION,
      oralTestPercentage,
      oralTestLastUpdatedAt: serverTimestamp(),
      quizCompleted: true,
      quizScore: quizStats.quizScore,
      quizTotalQuestions: quizStats.quizTotalQuestions,
      quizPercentage: quizStats.quizPercentage,
      email: user?.email || userProfile?.email || "",
      goal: userProfile?.goal || "",
      name: userProfile?.name || user?.displayName || "",
      uid: user?.uid,
      createdAt: createdAtNumeric,
      updatedAt: serverTimestamp()
    };

    setIsFinalizing(true);
    setError("");

    try {
      await setDoc(doc(db, "users", user.uid), payload, { merge: true });
      if (typeof refreshUserProfile === "function") {
        await refreshUserProfile();
      }
      navigate("/", {
        replace: true,
        state: {
          assessmentLevel,
          oralTestPercentage,
          combinedPercentage
        }
      });
    } catch (err) {
      console.error("Failed to finalize assessment:", err);
      setError("We saved your answers, but updating your profile failed. Please try again.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const nextQuestion = async () => {
    setTranscript("");
    setEvaluation(null);
    setError("");
    setHasSubmitted(false);
    
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      await finalizeAssessment();
    }
  };

  if (questions.length === 0) {
    return (
      <div className="oq-container">
        <div className="oq-card">
          <div className="oq-loading">Loading questions...</div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const totalScore = scores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);

  return (
    <div className="oq-container">
      <div className="oq-card">
        <div className="oq-header">
          <h2 className="oq-title">Question {currentIndex + 1} of {questions.length}</h2>
          <div className="oq-pill">Score: {totalScore.toFixed(1)}</div>
        </div>

        <div className="oq-main">
          <p className="oq-question">{currentQuestion?.prompt}</p>
          
          <div className="oq-transcript">
            <label className="oq-label">
              Your Answer
              {listening && (
                <span className="oq-status">
                  {isRecognizing ? "🎤 Listening..." : "⏸ Paused"}
                </span>
              )}
              {hasSubmitted && (
                <span className="oq-submitted-tag">✓ Submitted</span>
              )}
            </label>
            <div className="oq-transcript-box">
              {transcript || (
                <span className="oq-muted">
                  {hasSubmitted 
                    ? "Your submitted answer is being evaluated." 
                    : "Your recorded answer will appear here..."}
                </span>
              )}
            </div>
          </div>

          {!hasSubmitted ? (
            <div className="oq-controls">
              {!listening ? (
                <button 
                  className="btn btn-start" 
                  onClick={startListening}
                  disabled={isEvaluating}
                >
                  🎤 Start Recording
                </button>
              ) : (
                <button 
                  className="btn btn-stop" 
                  onClick={stopListening}
                  disabled={isEvaluating}
                >
                  ⏹ Stop Recording
                </button>
              )}

              <button 
                className="btn btn-submit" 
                onClick={submitAnswer}
                disabled={!transcript || isEvaluating}
              >
                {isEvaluating ? 'Evaluating...' : '📤 Submit Answer'}
              </button>
            </div>
          ) : (
            <div className="oq-controls">
              <div className="oq-already-submitted">
                ✓ Answer submitted. You can't modify it now.
              </div>
            </div>
          )}

          {isEvaluating && evaluation && (
            <div className="oq-eval evaluating">
              <div className="oq-eval-row">
                <div className="oq-loading-spinner"></div>
                <div className="oq-feedback">
                  {evaluation.feedback}
                </div>
              </div>
              {evaluation.suggestions && evaluation.suggestions.length > 0 && (
                <div className="oq-suggestions">
                  <ul>
                    {evaluation.suggestions.map((suggestion, i) => (
                      <li key={i}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && <div className="oq-error">{error}</div>}

          {evaluation && !isEvaluating && (
            <div className="oq-eval">
              <div className="oq-eval-row">
                <div className="oq-score">Score: <strong>{evaluation.score.toFixed(1)}/10</strong></div>
                <div className="oq-feedback">
                  {evaluation.feedback}
                </div>
              </div>

              {evaluation.suggestions && evaluation.suggestions.length > 0 && (
                <div className="oq-suggestions">
                  <h4>Suggestions for improvement:</h4>
                  <ul>
                    {evaluation.suggestions.map((suggestion, i) => (
                      <li key={i}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="oq-controls" style={{ justifyContent: 'flex-end', marginTop: '16px' }}>
                <button 
                  className="btn btn-next" 
                  onClick={nextQuestion}
                  disabled={isEvaluating || isFinalizing}
                >
                  {currentIndex < questions.length - 1
                    ? "Next Question →"
                    : isFinalizing
                      ? "Saving results..."
                      : "Finish Test"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OralQuestion;
import React, { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "./firebase";
import "./AIQuiz.css";

function AIQuiz({ user, userProfile }) {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 1️⃣ Generate AI-based Assessment
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
          level: userProfile?.level || "beginner",
          focus: "grammar",
          type: "custom",
        }),
      });

      const data = await res.json();
      if (data.questions) {
        setQuestions(data.questions);
        setUserAnswers(Array(data.questions.length).fill(""));
        setCurrentIndex(0);
      } else {
        throw new Error("No questions received.");
      }
    } catch (err) {
      setError("Failed to generate assessment. Please retry.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 2️⃣ Handle option selection
  const handleSelect = (option) => {
    const updated = [...userAnswers];
    updated[currentIndex] = option;
    setUserAnswers(updated);
  };

  // 3️⃣ Go to next question
  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleSubmitAssessment();
    }
  };

  // 4️⃣ Submit and evaluate answers
  const handleSubmitAssessment = async () => {
    setLoading(true);
    try {
      const responses = questions.map((q, i) => ({
        question: q.question,
        answer: userAnswers[i],
        correct: q.correct,
      }));

      const res = await fetch("http://127.0.0.1:8000/submit_assessment/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.uid,
          assessment_id: "frontend_generated",
          responses,
        }),
      });

      const data = await res.json();
      setResult(data.data);

      // Optional: store result in Firestore
      await addDoc(collection(db, "AssessmentResults"), {
        user_id: user.uid,
        result: data.data,
        created_at: new Date(),
      });
    } catch (err) {
      console.error("Submission error:", err);
      setError("Failed to submit assessment.");
    } finally {
      setLoading(false);
    }
  };

  // 5️⃣ Restart quiz
  const resetQuiz = () => {
    setQuestions([]);
    setUserAnswers([]);
    setCurrentIndex(0);
    setResult(null);
  };

  // -------------------- UI --------------------
  if (loading)
    return (
      <div className="aiquiz-container">
        <p className="loading">⏳ Processing... please wait</p>
      </div>
    );

  if (error)
    return (
      <div className="aiquiz-container">
        <p className="error">{error}</p>
        <button onClick={resetQuiz}>Try Again</button>
      </div>
    );

  // After quiz submission
  if (result)
    return (
      <div className="aiquiz-container">
        <h2>🎯 Assessment Completed!</h2>
        <h3>
          Score: {result.score}/{result.total} ({result.percentage}%)
        </h3>

        <div className="feedback-list">
          {result.feedback.map((f, i) => (
            <div
              key={i}
              className={`feedback-item ${f.is_correct ? "correct" : "wrong"}`}
            >
              <p>
                <strong>Q{i + 1}:</strong> {f.question}
              </p>
              <p>
                <strong>Your Answer:</strong> {f.given_answer}
              </p>
              <p>
                <strong>AI Feedback:</strong> {f.ai_feedback}
              </p>
            </div>
          ))}
        </div>

        <button onClick={resetQuiz}>Take Another Quiz 🔁</button>
      </div>
    );

  // Show quiz questions
  if (questions.length > 0)
    return (
      <div className="aiquiz-container">
        <h2>
          Question {currentIndex + 1}/{questions.length}
        </h2>
        <p className="question">{questions[currentIndex].question}</p>

        <div className="options">
          {questions[currentIndex].options.map((opt, idx) => (
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
      </div>
    );

  // Default state
  return (
    <div className="aiquiz-container">
      <h2>🧠 AI Practice Assessment</h2>
      <p>
        Take a personalized quiz based on your level. Click below to generate
        your questions.
      </p>
      <button onClick={generateAssessment}>Generate Assessment 🚀</button>
    </div>
  );
}

export default AIQuiz;

import React, { useState, useEffect, useRef } from "react";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { db } from "./firebase"; // your firebase config
import "./OralQuestion.css";

function OralQuestion() {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const recognitionRef = useRef(null);

  const TEST_USER_ID = "test_user_001";

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

    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript + " ";
      }
      setTranscript(text.trim());
    };

    recognitionRef.current = recognition;
  }, []);

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
    }
  };

  if (questions.length === 0) return <div className="oq-container oq-loading">Loading questions...</div>;
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
            <label className="oq-label">Transcript</label>
            <div className="oq-transcript-box" aria-live="polite">{transcript || <span className="oq-muted">(Nothing yet — start speaking)</span>}</div>
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
              {currentIndex < questions.length - 1 && (
                <button className="btn btn-next" onClick={nextQuestion}>➡ Next</button>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default OralQuestion;

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { db } from "./firebase";
import "./OralQuestion.css";

// Helper functions for evaluation
const extractKeywords = (text) => {
  // Remove common words and get meaningful keywords
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

const calculateGrammarScore = (text) => {
  if (!text) return 0;
  
  let score = 0.5; // Base score
  
  // Check for sentence structure
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  
  // Check for capitalization
  const hasCapitalStart = sentences.every(s => 
    s.trim()[0] === s.trim()[0].toUpperCase()
  );
  if (hasCapitalStart) score += 0.2;
  
  // Check for proper punctuation
  const hasPunctuation = sentences.every(s => 
    /[.!?]$/.test(s.trim())
  );
  if (hasPunctuation) score += 0.3;
  
  return Math.min(1, score);
};

const calculateQuestionRelevance = (question, response) => {
  const questionKeywords = extractKeywords(question);
  const responseKeywords = extractKeywords(response);
  
  if (questionKeywords.length === 0) return 0.5; // Default score if no keywords found
  
  // Count matching keywords
  const matches = questionKeywords.filter(keyword => 
    responseKeywords.includes(keyword)
  ).length;
  
  // Calculate relevance score (0-1)
  return Math.min(1, matches / Math.max(1, questionKeywords.length * 0.7));
};

const calculateCompleteness = (question, response) => {
  const questionTerms = question.toLowerCase().match(/\b\w+\b/g) || [];
  const responseText = response.toLowerCase();
  
  // Check if response addresses key question terms
  const addressedTerms = questionTerms.filter(term => 
    term.length > 3 && responseText.includes(term)
  );
  
  return Math.min(1, addressedTerms.length / Math.max(1, questionTerms.length * 0.5));
};

const generateSuggestions = (question, response, scores) => {
  const suggestions = [];
  const { grammarScore, relevanceScore, completenessScore, wordCount } = scores;
  const questionKeywords = extractKeywords(question);

  // Length feedback
  if (wordCount < 10) {
    suggestions.push("Your response is too short. Try to provide more details.");
  } else if (wordCount > 100) {
    suggestions.push("Your response is quite long. Try to be more concise.");
  }

  // Grammar feedback
  if (grammarScore < 0.7) {
    suggestions.push("Review your sentence structure and punctuation for better clarity.");
  }

  // Relevance feedback
  if (relevanceScore < 0.5) {
    const missingKeywords = questionKeywords
      .filter(kw => !response.toLowerCase().includes(kw))
      .slice(0, 3);
    
    if (missingKeywords.length > 0) {
      suggestions.push(`Try to include terms like: ${missingKeywords.join(', ')}`);
    }
  }

  // Completeness feedback
  if (completenessScore < 0.5) {
    suggestions.push("Make sure to address all parts of the question in your response.");
  }

  // Add positive reinforcement if doing well
  if (suggestions.length === 0) {
    suggestions.push("Great job! Your response is well-structured and relevant.");
  }

  return suggestions;
};

const evaluateResponse = (question, response) => {
  if (!question || !response) {
    return {
      score: 0,
      feedback: "Please provide a response to evaluate.",
      suggestions: ["Try speaking or typing your answer."]
    };
  }

  const userText = response.trim();
  if (!userText) {
    return {
      score: 0,
      feedback: "No speech detected.",
      suggestions: ["Speak clearly into the microphone."]
    };
  }

  const questionText = question.prompt || question;
  const questionLower = questionText.toLowerCase();
  const userWords = userText.toLowerCase().match(/\b\w+\b/g) || [];
  const questionWords = questionLower.match(/\b\w+\b/g) || [];
  const wordCount = userWords.length;

  // Clean the question text
  const cleanQuestionText = questionText
    .replace(/^(read|speak|say|repeat|describe|explain)[:.]?\s*/i, '')
    .replace(/"/g, '')
    .trim();

  // Common speech-to-text patterns
  const speechPatterns = {
    // Common contractions
    contractions: {
      pattern: /\b(im|dont|wont|cant|isnt|arent|wasnt|werent|youre|theyre|were|ive|youve|weve|theyve|hes|shes|its)\b/gi,
      fix: {
        'im': "I'm", 'dont': "don't", 'wont': "won't", 'cant': "can't",
        'isnt': "isn't", 'arent': "aren't", 'wasnt': "wasn't", 'werent': "weren't",
        'youre': "you're", 'theyre': "they're", 'ive': "I've", 'youve': "you've",
        'weve': "we've", 'theyve': "they've", 'hes': "he's", 'shes': "she's", 'its': "it's"
      }
    },
    // Common verb tense issues
    verbTense: {
      pattern: /\b(goed|eated|runned|writed|drinked|eated|runned|writed|buyed|buyed|catched|cutted|doed|drawed|drived|eated|falled|feeled|finded|flyed|forgeted|getted|gived|goed|growed|hitted|holded|keeped|knowed|leaved|losed|maked|meeted|payed|putted|readed|runned|sayd|seed|selled|sended|shaked|shooted|shutted|singed|sitted|sleeped|speaked|spended|standed|swimed|taked|teached|telled|thinked|throwed|understanded|waked|wore|writed)\b/gi,
      fix: {
        'goed': 'went', 'eated': 'ate', 'runned': 'ran', 'writed': 'wrote',
        'drinked': 'drank', 'buyed': 'bought', 'catched': 'caught', 'cutted': 'cut',
        'doed': 'did', 'drawed': 'drew', 'drived': 'drove', 'falled': 'fell',
        'feeled': 'felt', 'finded': 'found', 'flyed': 'flew', 'forgeted': 'forgot',
        'getted': 'got', 'gived': 'gave', 'growed': 'grew', 'hitted': 'hit',
        'holded': 'held', 'keeped': 'kept', 'knowed': 'knew', 'leaved': 'left',
        'losed': 'lost', 'maked': 'made', 'meeted': 'met', 'payed': 'paid',
        'putted': 'put', 'readed': 'read', 'sayd': 'said', 'seed': 'saw',
        'selled': 'sold', 'sended': 'sent', 'shaked': 'shook', 'shooted': 'shot',
        'shutted': 'shut', 'singed': 'sang', 'sitted': 'sat', 'sleeped': 'slept',
        'speaked': 'spoke', 'spended': 'spent', 'standed': 'stood', 'swimed': 'swam',
        'taked': 'took', 'teached': 'taught', 'telled': 'told', 'thinked': 'thought',
        'throwed': 'threw', 'waked': 'woke', 'wore': 'worn', 'writed': 'wrote'
      }
    },
    // Common article issues
    articleIssues: {
      pattern: /\b(i|you|he|she|it|we|they)\s+(am|is|are|was|were|have|has|had|do|does|did|can|could|will|would|shall|should|may|might|must)\s+(a|an|the)\s+(\w+)/gi
    }
  };

  // Check for common speech patterns
  const suggestions = new Set();
  let correctedText = userText;

  // Check for contraction issues
  const contractionMatch = userText.match(speechPatterns.contractions.pattern);
  if (contractionMatch) {
    contractionMatch.forEach(match => {
      const lowerMatch = match.toLowerCase();
      if (speechPatterns.contractions.fix[lowerMatch]) {
        suggestions.add(`Use "${speechPatterns.contractions.fix[lowerMatch]}" instead of "${match}"`);
        correctedText = correctedText.replace(
          new RegExp(`\\b${match}\\b`, 'gi'), 
          speechPatterns.contractions.fix[lowerMatch]
        );
      }
    });
  }

  // Check for verb tense issues
  const verbMatch = userText.match(speechPatterns.verbTense.pattern);
  if (verbMatch) {
    verbMatch.forEach(match => {
      const lowerMatch = match.toLowerCase();
      if (speechPatterns.verbTense.fix[lowerMatch]) {
        suggestions.add(`Use "${speechPatterns.verbTense.fix[lowerMatch]}" instead of "${match}"`);
      }
    });
  }

  // Basic grammar check
  if (!/^[A-Z]/.test(userText)) {
    suggestions.add("Start your sentence with a capital letter");
  }

  // Calculate score based on corrections and length
  const errorCount = suggestions.size;
  const baseScore = Math.min(10, 
    10 - (errorCount * 0.5) + // Deduct 0.5 for each error
    (wordCount * 0.1)         // Add 0.1 for each word (encourage longer responses)
  );

  const score = Math.max(1, Math.min(10, Math.round(baseScore * 2) / 2));

  // Generate feedback
  let feedback = "";
  if (score >= 9) {
    feedback = "Excellent! Your speech is clear and grammatically correct.";
  } else if (score >= 7) {
    feedback = "Good job! Your response is mostly clear with minor issues.";
  } else if (score >= 5) {
    feedback = "Not bad! Here are some ways to improve your response:";
  } else {
    feedback = "Let's work on improving your response:";
  }

  // If no specific suggestions but score is low, add general tips
  if (suggestions.size === 0 && score < 7) {
    suggestions.add("Try to speak in complete sentences");
    suggestions.add("Make sure your subject and verb agree");
  }

  return {
    score: score,
    feedback: feedback,
    suggestions: Array.from(suggestions).slice(0, 3),
    correctedText: suggestions.size > 0 ? correctedText : null
  };
};
function OralQuestion({ user }) {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState("");
  const [scores, setScores] = useState([]);
  const recognitionRef = useRef(null);
  const navigate = useNavigate();

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

  const submitAnswer = () => {
    if (!transcript.trim()) {
      setError("Please record your answer before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const currentQuestion = questions[currentIndex];
      const evaluationResult = evaluateResponse(currentQuestion, transcript);
      
      setEvaluation(evaluationResult);

      const newScore = {
        questionIndex: currentIndex,
        questionId: currentQuestion?.id,
        score: evaluationResult.score,
        feedback: evaluationResult.feedback,
        timestamp: new Date().toISOString()
      };

      setScores(prevScores => [...prevScores, newScore]);

      // Save to Firestore if user is logged in
      if (user?.uid) {
        addDoc(collection(db, "StudentResponses"), {
          student_id: user.uid,
          question_id: currentQuestion?.id,
          question_text: currentQuestion?.prompt,
          transcript,
          score: evaluationResult.score,
          feedback: evaluationResult.feedback,
          timestamp: new Date().toISOString()
        }).catch(dbError => {
          console.error("Error saving to database:", dbError);
        });
      }
    } catch (err) {
      console.error("Error in evaluation:", err);
      setError("An error occurred while evaluating your response.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextQuestion = () => {
    setTranscript("");
    setEvaluation(null);
    setError("");
    
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
      navigate('/results', { 
        state: { 
          scores,
          questions,
          totalScore,
          maxPossibleScore: questions.length * 10
        } 
      });
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
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);

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
            </label>
            <div className="oq-transcript-box">
              {transcript || <span className="oq-muted">Your recorded answer will appear here...</span>}
            </div>
          </div>

          <div className="oq-controls">
            {!listening ? (
              <button 
                className="btn btn-start" 
                onClick={startListening}
                disabled={isSubmitting || isPlaying}
              >
                🎤 Start Recording
              </button>
            ) : (
              <button 
                className="btn btn-stop" 
                onClick={stopListening}
                disabled={isSubmitting || isPlaying}
              >
                ⏹ Stop Recording
              </button>
            )}

            <button 
              className="btn btn-submit" 
              onClick={submitAnswer}
              disabled={!transcript || isSubmitting || isPlaying}
            >
              {isSubmitting ? 'Evaluating...' : '📤 Submit Answer'}
            </button>
          </div>

          {error && <div className="oq-error">{error}</div>}

          {evaluation && (
            <div className="oq-eval">
              <div className="oq-eval-row">
                <div className="oq-score">Score: <strong>{evaluation.score}/10</strong></div>
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
                >
                  {currentIndex < questions.length - 1 ? "Next Question →" : "Finish Test"}
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
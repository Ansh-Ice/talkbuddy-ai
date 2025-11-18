import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Mic, MicOff, RotateCcw, Volume2 } from "lucide-react";
import { collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import "./VoicePractice.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const SILENCE_DELAY = 3000; // 3 seconds of silence to send message
const MAX_RECORDING_TIME = 60000; // 1 minute max recording time

const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const VoicePractice = ({ user }) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    {
      id: createId(),
      role: "assistant",
      text: "Hi there! I'm TalkBuddy, your speaking partner. Tap the microphone and start talking whenever you're ready.",
    },
  ]);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [loadingReply, setLoadingReply] = useState(false);
  const [error, setError] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [callActive, setCallActive] = useState(false);
  const [callConnecting, setCallConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [playedMessages, setPlayedMessages] = useState(new Set());
  const [sessionId, setSessionId] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const recognitionRef = useRef(null);
  const capturedSpeechRef = useRef("");
  const synthRef = useRef(null);
  const utteranceRef = useRef(null);
  const feedRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const resumeTimeoutRef = useRef(null);
  const messagesRef = useRef(messages);
  const callActiveRef = useRef(false);
  const recognitionPausedRef = useRef(false);
  const abortControllerRef = useRef(new AbortController());

  // Update messages ref when messages change
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, interimText]);

  // Auto-play new assistant messages once
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && 
          !speakingMessageId && 
          !isProcessing &&
          !playedMessages.has(lastMessage.id)) {
        setIsProcessing(true);
        setPlayedMessages(prev => new Set([...prev, lastMessage.id]));
        speakMessage(lastMessage);
      }
    }
  }, [messages, speakingMessageId, isProcessing, playedMessages]);

  // Set up speech synthesis
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
      synthRef.current = window.speechSynthesis;
      setTtsSupported(true);
    } else {
      setTtsSupported(false);
    }

    return () => {
      if (synthRef.current?.speaking) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Set up speech recognition
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setListening(true);
      setError("");
      capturedSpeechRef.current = "";
      setInterimText("");
      startSilenceTimer();
      startRecordingTimer();
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === "aborted") return;
      
      const friendlyMessage =
        event.error === "no-speech"
          ? "We couldn't hear anything. Try speaking a bit louder."
          : event.error === "not-allowed"
          ? "Microphone permission is required for voice practice."
          : "Speech recognition had an issue. Please try again.";
      
      setError(friendlyMessage);
      stopAllTimers();
    };

    recognition.onresult = (event) => {
      // Skip if we're currently speaking or processing
      if (speakingMessageId || isProcessing) return;
      
      resetSilenceTimer();
      
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          capturedSpeechRef.current += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      setInterimText((capturedSpeechRef.current + interim).trim());
    };

    recognition.onend = () => {
      setListening(false);
      const spoken = (capturedSpeechRef.current || "").trim();
      capturedSpeechRef.current = "";
      
      if (spoken && !speakingMessageId && !isProcessing) {
        handleTranscript(spoken);
      } else {
        setInterimText("");
      }
      
      if (recognitionPausedRef.current) return;
      
      if (callActiveRef.current) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.error('Error restarting recognition:', e);
          }
        }, 500);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      stopAllTimers();
      recognition.stop();
    };
  }, [speakingMessageId, isProcessing]);

  // Timer functions
  const startSilenceTimer = () => {
    stopSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (capturedSpeechRef.current.trim() && !speakingMessageId && !isProcessing) {
        const spoken = capturedSpeechRef.current.trim();
        capturedSpeechRef.current = "";
        setInterimText("");
        handleTranscript(spoken);
      }
    }, SILENCE_DELAY);
  };

  const resetSilenceTimer = () => {
    stopSilenceTimer();
    if (callActiveRef.current && !speakingMessageId && !isProcessing) {
      startSilenceTimer();
    }
  };

  const stopSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const startRecordingTimer = () => {
    stopRecordingTimer();
    recordingTimerRef.current = setTimeout(() => {
      if (recognitionRef.current && !speakingMessageId && !isProcessing) {
        recognitionRef.current.stop();
        const spoken = capturedSpeechRef.current.trim();
        if (spoken) {
          handleTranscript(spoken);
        }
      }
    }, MAX_RECORDING_TIME);
  };

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const stopAllTimers = () => {
    stopSilenceTimer();
    stopRecordingTimer();
    clearTimeout(resumeTimeoutRef.current);
  };

  // Handle transcript from speech recognition
  const handleTranscript = (text) => {
    const trimmed = text.trim();
    if (!trimmed || speakingMessageId || isProcessing) return;
    
    sendMessage(trimmed);
  };

  // Create Firestore session
  const createSession = async () => {
    try {
      const sessionDoc = await addDoc(collection(db, "voice_sessions"), {
        userId: user?.uid || "anonymous",
        createdAt: serverTimestamp(),
        messages: [],
        status: "active"
      });
      setSessionId(sessionDoc.id);
      return sessionDoc.id;
    } catch (err) {
      console.error('Error creating session:', err);
      return null;
    }
  };

  // Save message to Firestore
  const saveMessageToFirestore = async (role, content, audioUrl = null) => {
    if (!sessionId) return;
    
    try {
      const sessionRef = doc(db, "voice_sessions", sessionId);
      const messageData = {
        role,
        content,
        timestamp: new Date().toISOString()
      };
      
      if (audioUrl) {
        messageData.audioUrl = audioUrl;
      }
      
      // Get current messages and append new one
      const updatedMessages = messagesRef.current.map(m => {
        const msg = {
          role: m.role,
          content: m.text,
          timestamp: new Date().toISOString()
        };
        if (m.audioUrl) {
          msg.audioUrl = m.audioUrl;
        }
        return msg;
      });
      
      await updateDoc(sessionRef, {
        messages: updatedMessages
      });
    } catch (err) {
      console.error('Error saving message:', err);
    }
  };

  // Start/stop call functions
  const startCall = async () => {
    if (!speechSupported || callActive) return;
    
    setCallConnecting(true);
    setError("");
    
    try {
      // Request microphone access
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create Firestore session
      const newSessionId = await createSession();
      
      // Reset state
      capturedSpeechRef.current = "";
      setInterimText("");
      setCallActive(true);
      callActiveRef.current = true;
      
      // Start recognition
      recognitionRef.current.start();
      
      // Add welcome message if it's the first message
      if (messages.length <= 1) {
        const welcomeMsg = {
          id: createId(),
          role: "assistant",
          text: "Hi! I'm your English practice partner. Start speaking and I'll help you improve!",
        };
        setMessages([welcomeMsg]);
      }
    } catch (err) {
      console.error('Error starting call:', err);
      setError("Unable to access the microphone. Please check your permissions and try again.");
    } finally {
      setCallConnecting(false);
    }
  };

  const endCall = async () => {
    stopSpeaking();
    
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      console.error('Error stopping recognition:', e);
    }
    
    setCallActive(false);
    callActiveRef.current = false;
    setListening(false);
    setInterimText("");
    recognitionPausedRef.current = false;
    stopAllTimers();

    // Generate and show summary
    if (sessionId && messages.length > 1) {
      await generateSessionSummary();
    }
  };

  // Text-to-speech functions
  const stopSpeaking = () => {
    if (synthRef.current?.speaking) {
      synthRef.current.cancel();
    }
    setSpeakingMessageId(null);
    setIsProcessing(false);
  };

  const speakMessage = (message) => {
    if (!ttsSupported || !synthRef.current) {
      setIsProcessing(false);
      return;
    }

    // Stop any current speech and pause recognition
    stopSpeaking();
    pauseRecognitionForSpeech();

    const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.lang = "en-US";
    utterance.pitch = 1;
    utterance.rate = 1;
    
    // Mark as speaking and update UI
    setSpeakingMessageId(message.id);
    
    // Clean up and resume recognition when done
    const onEnd = () => {
      setSpeakingMessageId(null);
      setIsProcessing(false);
      // Small delay before resuming recognition
      setTimeout(resumeRecognitionAfterSpeech, 500);
    };
    
    utterance.onend = onEnd;
    utterance.onerror = (event) => {
      console.error('SpeechSynthesis error:', event);
      onEnd();
    };
    
    // Store and speak the utterance
    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const pauseRecognitionForSpeech = () => {
    if (!callActiveRef.current || recognitionPausedRef.current) return;
    
    recognitionPausedRef.current = true;
    try {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    } catch (e) {
      console.error('Error pausing recognition:', e);
    }
  };

  const resumeRecognitionAfterSpeech = () => {
    if (!callActiveRef.current || speakingMessageId) return;
    
    recognitionPausedRef.current = false;
    
    // Clear any pending timeouts to prevent multiple restarts
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
    }
    
    resumeTimeoutRef.current = setTimeout(() => {
      try {
        if (recognitionRef.current && !speakingMessageId) {
          // Set up the onend handler
          recognitionRef.current.onend = () => {
            setListening(false);
            const spoken = (capturedSpeechRef.current || "").trim();
            capturedSpeechRef.current = "";
            if (spoken && !speakingMessageId && !isProcessing) {
              handleTranscript(spoken);
            } else {
              setInterimText("");
            }
            // Don't auto-restart here, let the silence timer handle it
          };
          
          // Start recognition if not already active
          if (!listening) {
            recognitionRef.current.start();
          }
        }
      } catch (e) {
        console.error('Error resuming recognition:', e);
        if (callActiveRef.current && !speakingMessageId) {
          resumeTimeoutRef.current = setTimeout(resumeRecognitionAfterSpeech, 500);
        }
      }
    }, 500); // Slightly longer delay to ensure clean state
  };

  // Generate session summary
  const generateSessionSummary = async () => {
    setGeneratingSummary(true);
    
    try {
      // Build conversation text
      const conversationText = messages
        .filter(m => m.role === "user")
        .map(m => m.text)
        .join(" ");

      if (!conversationText.trim()) {
        setGeneratingSummary(false);
        navigate("/");
        return;
      }

      // Generate session title from conversation
      const firstUserMessage = messages.find(m => m.role === "user");
      let sessionTitle = "Voice practice session";
      
      if (firstUserMessage && firstUserMessage.text) {
        // Clean up the title - remove extra spaces, capitalize first letter
        const rawTitle = firstUserMessage.text.trim();
        sessionTitle = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1, 50);
        if (rawTitle.length > 50) {
          sessionTitle += "...";
        }
      }

      // Call evaluation endpoint
      const response = await fetch(`${API_BASE}/api/oral-quiz/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.uid || "anonymous",
          questionId: "voice_practice_session",
          userResponse: conversationText,
          questionText: "Voice practice session evaluation"
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      const evaluation = await response.json();
      
      const summary = {
        mistakes: evaluation.corrections || [],
        corrections: evaluation.corrections || [],
        tips: evaluation.suggestions?.[0] || "Keep practicing!",
        final_feedback: evaluation.feedback || "Good job!"
      };

      setSessionSummary(summary);
      setShowSummary(true);

      // Update session in Firestore
      if (sessionId) {
        const sessionRef = doc(db, "voice_sessions", sessionId);
        await updateDoc(sessionRef, {
          status: "completed",
          endedAt: serverTimestamp(),
          summary,
          title: sessionTitle,
          messages: messages.map(m => {
            const msg = {
              role: m.role,
              content: m.text,
              timestamp: new Date().toISOString()
            };
            if (m.audioUrl) {
              msg.audioUrl = m.audioUrl;
            }
            return msg;
          })
        });
      }
    } catch (err) {
      console.error('Error generating summary:', err);
      navigate("/");
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Close summary and redirect
  const closeSummary = () => {
    setShowSummary(false);
    navigate("/");
  };

  // Message handling
  const sendMessage = async (text) => {
    if (!text.trim() || isProcessing) return;
    
    setError("");
    const userMessage = { id: createId(), role: "user", text };
    setMessages(prev => [...prev, userMessage]);
    setInterimText("");
    setLoadingReply(true);
    setIsProcessing(true);

    // Save user message to Firestore
    await saveMessageToFirestore("user", text);

    // Abort any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE}/voice_chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          user_name: user?.displayName || user?.email || undefined,
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "The AI coach could not respond right now.");
      }

      const data = await response.json();
      const replyText = data.reply || "I'm having trouble responding at the moment.";
      
      const aiMessage = { 
        id: createId(), 
        role: "assistant", 
        text: replyText
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Save AI message to Firestore
      await saveMessageToFirestore("assistant", replyText);
      
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Request was aborted');
        return;
      }
      
      console.error('Error sending message:', err);
      setError(err.message || "Something went wrong. Please try again.");
      
      setMessages(prev => [
        ...prev,
        {
          id: createId(),
          role: "assistant",
          text: "I'm having trouble connecting to the AI coach. Please try again in a moment.",
        }
      ]);
    } finally {
      setLoadingReply(false);
      setIsProcessing(false);
    }
  };

  // UI helper functions
  const handleReplay = (message) => {
    if (!isProcessing && !speakingMessageId) {
      // Allow replaying any message, not just the last one
      speakMessage(message);
    }
  };

  const handleResetConversation = () => {
    stopSpeaking();
    setMessages([
      {
        id: createId(),
        role: "assistant",
        text: "Hi! I'm your English practice partner. Start speaking and I'll help you improve!",
      },
    ]);
    setError("");
  };

  const handleExit = () => {
    // Abort any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    stopSpeaking();
    endCall();
    navigate("/");
  };

  // UI rendering
  const micStateClass = speakingMessageId
    ? "speaking"
    : callActive && listening
    ? "listening"
    : callActive
    ? "connected"
    : "idle";

  return (
    <div className="voice-practice-page">
      {/* Summary Modal */}
      {showSummary && sessionSummary && (
        <div className="summary-modal-overlay">
          <div className="summary-modal">
            <h2>Session Summary</h2>
            
            <div className="summary-section">
              <h3>Your Performance</h3>
              <p className="summary-feedback">{sessionSummary.final_feedback}</p>
            </div>

            {sessionSummary.corrections && sessionSummary.corrections.length > 0 && (
              <div className="summary-section">
                <h3>Mistakes & Corrections</h3>
                <ul className="corrections-list">
                  {sessionSummary.corrections.slice(0, 3).map((correction, idx) => (
                    <li key={idx}>
                      <span className="mistake">❌ {correction.original}</span>
                      <span className="arrow">→</span>
                      <span className="correction">✅ {correction.corrected}</span>
                      {correction.explanation && (
                        <p className="explanation">{correction.explanation}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="summary-section">
              <h3>Improvement Tip</h3>
              <p className="tip">{sessionSummary.tips}</p>
            </div>

            <button className="close-summary-btn" onClick={closeSummary}>
              Continue to Home
            </button>
          </div>
        </div>
      )}

      {/* Loading overlay for summary generation */}
      {generatingSummary && (
        <div className="summary-loading-overlay">
          <div className="summary-loading">
            <Loader2 size={40} className="spin" />
            <p>Generating your feedback summary...</p>
          </div>
        </div>
      )}

      <header className="voice-header sticky-controls">
        <div className="control-bar">
          <button className="ghost-btn" onClick={handleExit}>
            <ArrowLeft size={18} />
            Back to Dashboard
          </button>
          <button className="ghost-btn" onClick={handleResetConversation}>
            <RotateCcw size={18} />
            Reset Chat
          </button>
          <button
            className="ghost-btn danger"
            onClick={endCall}
            disabled={!callActive}
          >
            <MicOff size={18} />
            End Call
          </button>
        </div>
        <div className="voice-status">
          <span className={`status ${callActive ? "live" : "idle"}`}>
            {callActive ? (listening ? "Listening..." : "Call active") : "Call idle"}
          </span>
          {loadingReply && <span className="status thinking">AI responding...</span>}
          {!speechSupported && <span className="status warning">Speech recognition unavailable</span>}
        </div>
      </header>

      <main className="voice-body">
        <section className={`voice-panel ${callActive ? "active-call" : ""}`}>
          <div className="voice-panel-header">
            <div>
              <p className="panel-title">Voice Practice</p>
              <p className="panel-subtitle">
                Speak naturally — the AI will reply and read it back to you.
              </p>
            </div>
            <div className="panel-actions">
              {ttsSupported ? (
                <div className="tts-status">🔊 Auto speech enabled</div>
              ) : (
                <div className="tts-status warn">🔇 TTS not supported</div>
              )}
              <div className={`call-visual ${callActive ? "pulse" : ""}`}>
                <div className="wave" />
                <div className="wave" />
                <div className="wave" />
              </div>
            </div>
          </div>

          <div className="voice-messages" ref={feedRef}>
            {messages.map((msg) => (
              <article
                key={msg.id}
                className={`voice-message ${msg.role} ${
                  speakingMessageId === msg.id ? "speaking" : ""
                }`}
              >
                <div className="message-meta">
                  <span>{msg.role === "assistant" ? "TalkBuddy" : "You"}</span>
                  {msg.role === "assistant" && ttsSupported && (
                    <button
                      className="replay-btn"
                      type="button"
                      onClick={() => handleReplay(msg)}
                      aria-label="Replay response"
                      disabled={isProcessing}
                    >
                      <Volume2 size={16} />
                      Replay
                    </button>
                  )}
                </div>
                <p>{msg.text}</p>
              </article>
            ))}

            {interimText && (
              <article className="voice-message user ghost">
                <div className="message-meta">
                  <span>Listening...</span>
                </div>
                <p>{interimText}</p>
              </article>
            )}

            {loadingReply && (
              <article className="voice-message assistant ghost">
                <div className="message-meta">
                  <span>TalkBuddy</span>
                </div>
                <p>Thinking of a response...</p>
              </article>
            )}
          </div>
        </section>
      </main>

      <footer className="voice-controls">
        {error && (
          <div className="voice-error" role="alert">
            {error}
          </div>
        )}
        <div className="call-controls">
          <div className={`mic-orb ${micStateClass}`}>
            <span className="mic-icon">
              {speakingMessageId ? <Volume2 size={18} /> : <Mic size={18} />}
            </span>
            <span className="mic-ring ring-1" />
            <span className="mic-ring ring-2" />
          </div>
          <div className="call-cta">
            {!callActive ? (
              <button
                className="call-btn start"
                onClick={startCall}
                disabled={!speechSupported || callConnecting || isProcessing}
              >
                {callConnecting ? <Loader2 size={20} className="spin" /> : <Mic size={22} />}
                {callConnecting ? "Connecting..." : "Start Call"}
              </button>
            ) : (
              <button 
                className="call-btn end" 
                onClick={endCall}
                disabled={isProcessing}
              >
                <MicOff size={22} />
                End Call
              </button>
            )}
            <div className="mic-hint">
              {speechSupported
                ? callActive
                  ? "Speak naturally — I'll respond when you're done."
                  : "Click Start Call to begin practicing"
                : "Your browser doesn't support speech recognition. Try Chrome or Edge."}
            </div>
          </div>
        </div>

        <div className="ai-progress-bar">
          <div className={`dot ${callActive && listening ? "active" : ""}`} />
          <div className={`dot ${loadingReply ? "active" : ""}`} />
          <div className={`dot ${speakingMessageId ? "active" : ""}`} />
        </div>
      </footer>
    </div>
  );
};

export default VoicePractice;
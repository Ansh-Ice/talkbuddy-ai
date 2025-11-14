import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Mic, MicOff, RotateCcw, Volume2 } from "lucide-react";
import "./VoicePractice.css";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const VoicePractice = ({ user }) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState(() => [
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

  const recognitionRef = useRef(null);
  const capturedSpeechRef = useRef("");
  const synthRef = useRef(null);
  const utteranceRef = useRef(null);
  const feedRef = useRef(null);
  const messagesRef = useRef(messages);
  const callActiveRef = useRef(false);

  const greeting = useMemo(() => {
    const name =
      user?.displayName ||
      user?.profile?.name ||
      (user?.email ? user.email.split("@")[0] : "there");
    return `Hi ${name}! I'm ready whenever you want to practice. Tap the microphone, speak naturally, and I'll guide you.`;
  }, [user]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setMessages((prev) => {
      if (!prev.length || prev[0].role !== "assistant") return prev;
      const updated = [...prev];
      updated[0] = { ...updated[0], text: greeting };
      return updated;
    });
  }, [greeting]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, interimText]);

  useEffect(() => {
    callActiveRef.current = callActive;
  }, [callActive]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

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
    };

    recognition.onerror = (event) => {
      setListening(false);
      const friendlyMessage =
        event.error === "no-speech"
          ? "We couldn't hear anything. Try speaking a bit louder."
          : event.error === "not-allowed"
          ? "Microphone permission is required for voice practice."
          : "Speech recognition had an issue. Please try again.";
      setError(friendlyMessage);
    };

    recognition.onresult = (event) => {
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
      if (spoken) {
        handleTranscript(spoken);
      } else {
        setInterimText("");
      }
      if (callActiveRef.current) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch {
            /* no-op */
          }
        }, 200);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, []);

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

  const handleTranscript = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
  };

  const startCall = () => {
    if (!speechSupported || callActive) return;
    setCallConnecting(true);
    setError("");
    try {
      recognitionRef.current?.start();
      setCallActive(true);
      callActiveRef.current = true;
      setCallConnecting(false);
    } catch (err) {
      setCallConnecting(false);
      setError("Unable to access the microphone. Close other apps using it and try again.");
    }
  };

  const endCall = () => {
    setCallActive(false);
    callActiveRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText("");
    stopSpeaking();
  };

  const stopSpeaking = () => {
    if (synthRef.current?.speaking) {
      synthRef.current.cancel();
    }
    setSpeakingMessageId(null);
  };

  const speakMessage = (message) => {
    if (!ttsSupported || !synthRef.current) return;
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.lang = "en-US";
    utterance.pitch = 1;
    utterance.rate = 1;
    utterance.onstart = () => setSpeakingMessageId(message.id);
    utterance.onend = () => setSpeakingMessageId((prev) => (prev === message.id ? null : prev));
    utterance.onerror = () => setSpeakingMessageId(null);
    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const handleReplay = (message) => {
    speakMessage(message);
  };

  const sendMessage = async (text) => {
    setError("");
    const userMessage = { id: createId(), role: "user", text };
    setMessages((prev) => [...prev, userMessage]);

    const payloadHistory = [...messagesRef.current, userMessage].map((msg) => ({
      role: msg.role,
      content: msg.text,
    }));

    setLoadingReply(true);
    try {
      const response = await fetch(`${API_BASE}/voice_chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payloadHistory,
          user_name: user?.displayName || user?.email || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("The AI coach could not respond right now.");
      }

      const data = await response.json();
      const replyText = (data.reply || "I'm having trouble responding at the moment.").trim();
      const aiMessage = { id: createId(), role: "assistant", text: replyText };
      setMessages((prev) => [...prev, aiMessage]);
      speakMessage(aiMessage);
    } catch (err) {
      setError(
        err.message ||
          "Something went wrong reaching the AI coach. Please check the server and try again."
      );
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "assistant",
          text: "I couldn't reach our AI coach just now. Let's try again in a moment.",
        },
      ]);
    } finally {
      setLoadingReply(false);
    }
  };

  const handleExit = () => {
    stopSpeaking();
    endCall();
    navigate("/");
  };

  return (
    <div className="voice-practice-page">
      <header className="voice-header">
        <button className="ghost-btn" onClick={handleExit}>
          <ArrowLeft size={18} />
          Back to Dashboard
        </button>
        <div className="voice-status">
          <span className={`status ${callActive ? "live" : "idle"}`}>
            {callActive ? (listening ? "Listening live…" : "Call active") : "Call idle"}
          </span>
          {loadingReply && <span className="status thinking">AI responding…</span>}
          {!speechSupported && <span className="status warning">Speech recognition unavailable</span>}
        </div>
        <button className="ghost-btn" onClick={() => setMessages([
          {
            id: createId(),
            role: "assistant",
            text: greeting,
          },
        ])}>
          <RotateCcw size={18} />
          Reset Chat
        </button>
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
                  <span>Listening…</span>
                </div>
                <p>{interimText}</p>
              </article>
            )}

            {loadingReply && (
              <article className="voice-message assistant ghost">
                <div className="message-meta">
                  <span>TalkBuddy</span>
                </div>
                <p>Thinking of a response…</p>
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
          {!callActive ? (
            <button
              className="call-btn start"
              onClick={startCall}
              disabled={!speechSupported || callConnecting}
            >
              {callConnecting ? <Loader2 size={20} className="spin" /> : <Mic size={22} />}
              {callConnecting ? "Connecting…" : "Start Call"}
            </button>
          ) : (
            <button className="call-btn end" onClick={endCall}>
              <MicOff size={22} />
              End Call
            </button>
          )}
          <div className="mic-hint">
            {speechSupported
              ? callActive
                ? "Speak anytime — we'll capture it automatically."
                : "Start the call to begin hands-free practice."
              : "Upgrade to a browser that supports the Web Speech API for voice practice."}
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


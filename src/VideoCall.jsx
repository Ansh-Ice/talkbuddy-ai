import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, AlertTriangle, CameraOff, Mic, MicOff, Volume2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Canvas } from '@react-three/fiber';
import Avatar3D from './components/Avatar3D';
import './VideoCall.css';

const wasmAssetsPath = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const faceModelAsset =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const defaultMood = { label: 'Neutral', confidence: 0, color: '#94a3b8', description: 'Relax and breathe.' };

const moodPalette = {
  joy: { label: 'Happy', color: '#34d399', description: 'You look energized and positive!' },
  sorrow: { label: 'Sad', color: '#60a5fa', description: 'Take a deep breath, everything will be okay.' },
  surprise: { label: 'Surprised', color: '#fbbf24', description: 'Something exciting caught your attention!' },
  anger: { label: 'Frustrated', color: '#f87171', description: 'Let’s slow down and reset together.' },
  disgust: { label: 'Displeased', color: '#f472b6', description: 'Shake it off—we can refocus.' },
  fear: { label: 'Anxious', color: '#a78bfa', description: 'You’re safe here; let’s build confidence.' },
  neutral: defaultMood,
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const SILENCE_DELAY = 3000; // 3 seconds of silence to send message
const MAX_RECORDING_TIME = 60000; // 1 minute max recording time

const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const VideoCall = () => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animationRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const [streamError, setStreamError] = useState('');
  const [loadingModels, setLoadingModels] = useState(true);
  const [mood, setMood] = useState(defaultMood);
  const [avatarState, setAvatarState] = useState('listening');
  const avatarRef = useRef();

  // Voice chat states
  const [messages, setMessages] = useState([
    {
      id: createId(),
      role: "assistant",
      text: "Hi there! I'm TalkBuddy, your speaking partner. Let's practice speaking together!",
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

  // Start/stop call functions
  const startCall = async () => {
    if (!speechSupported || callActive) return;
    
    setCallConnecting(true);
    setError("");
    
    try {
      // Request microphone access
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
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
    
    // Update avatar mouth movement during speech
    if (avatarRef.current) {
      // Simulate mouth movement during speech
      const updateMouth = () => {
        if (synthRef.current?.speaking) {
          // Generate random mouth openness between 0.3 and 0.8
          const mouthOpenness = 0.3 + Math.random() * 0.5;
          avatarRef.current.setMouthOpenness(mouthOpenness);
          requestAnimationFrame(updateMouth);
        } else {
          avatarRef.current.setMouthOpenness(0);
        }
      };
      updateMouth();
    }
    
    // Mark as speaking and update UI
    setSpeakingMessageId(message.id);
    
    // Clean up and resume recognition when done
    const onEnd = () => {
      setSpeakingMessageId(null);
      setIsProcessing(false);
      if (avatarRef.current) {
        avatarRef.current.setMouthOpenness(0);
      }
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

  // Message handling
  const sendMessage = async (text) => {
    if (!text.trim() || isProcessing) return;
    
    setError("");
    const userMessage = { id: createId(), role: "user", text };
    setMessages(prev => [...prev, userMessage]);
    setInterimText("");
    setLoadingReply(true);
    setIsProcessing(true);

    try {
      const response = await fetch(`${API_BASE}/voice_chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          user_name: "User",
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

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(wasmAssetsPath);
        landmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: faceModelAsset },
          numFaces: 1,
          runningMode: 'VIDEO',
          outputFaceBlendshapes: true,
        });
      } catch (err) {
        console.error('Failed to load face landmarker', err);
        setStreamError('Could not initialize mood detection. Please refresh or try later.');
      } finally {
        setLoadingModels(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStreamError('');
      } catch (err) {
        console.error('Camera access denied', err);
        setStreamError('We cannot access your camera. Please allow permissions and try again.');
      }
    };
    startCamera();
    return () => {
      stopCamera();
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // ---------------------------
  // 🔥 UPDATED EMOTION ANALYZER
  // ---------------------------
  const translateMood = useCallback((blendShapes) => {
    if (!blendShapes?.length) return moodPalette.neutral;

    const cat = {};
    blendShapes[0].categories.forEach((c) => {
      cat[c.categoryName] = c.score;
    });

    // More sensitive smile detection
    const smile =
      (cat.mouthSmileLeft || 0) * 0.55 +
      (cat.mouthSmileRight || 0) * 0.55 +
      (cat.cheekPuff || 0) * 0.15 +
      (cat.eyeSmileLeft || 0) * 0.15 +
      (cat.eyeSmileRight || 0) * 0.15;

    // Sadness = raised inner brows + downturned lips
    const sadness =
      (cat.browInnerUpLeft || 0) * 0.4 +
      (cat.browInnerUpRight || 0) * 0.4 +
      (cat.mouthFrownLeft || 0) * 0.3 +
      (cat.mouthFrownRight || 0) * 0.3 +
      (cat.eyeLookDownLeft || 0) * 0.1 +
      (cat.eyeLookDownRight || 0) * 0.1;

    // Surprise = big eyes + open jaw
    const surprise =
      (cat.eyeWideLeft || 0) * 0.5 +
      (cat.eyeWideRight || 0) * 0.5 +
      (cat.jawOpen || 0) * 0.4 +
      (cat.mouthOpen || 0) * 0.3;

    // Anger = tight lips + brows down
    const anger =
      (cat.browDownLeft || 0) * 0.6 +
      (cat.browDownRight || 0) * 0.6 +
      (cat.lipPressLeft || 0) * 0.4 +
      (cat.lipPressRight || 0) * 0.4;

    const scores = { smile, sadness, surprise, anger };

    // Lower threshold -> more sensitive
    let best = 'neutral';
    let bestScore = 0.15;

    Object.entries(scores).forEach(([label, score]) => {
      if (score > bestScore) {
        best = label;
        bestScore = score;
      }
    });

    const moodKey =
      best === 'smile'
        ? 'joy'
        : best === 'sadness'
        ? 'sorrow'
        : best === 'surprise'
        ? 'surprise'
        : best === 'anger'
        ? 'anger'
        : 'neutral';

    return {
      ...moodPalette[moodKey],
      confidence: Math.round(bestScore * 100),
    };
  }, []);

  // ---------------------------
  // 🔥 ANALYZE (SMOOTHING FIX)
  // ---------------------------
  const analyzeMood = useCallback(
    (timestamp) => {
      if (
        !videoRef.current ||
        !landmarkerRef.current ||
        videoRef.current.readyState < 2 ||
        typeof timestamp !== 'number'
      ) {
        animationRef.current = requestAnimationFrame(analyzeMood);
        return;
      }

      if (timestamp === lastVideoTimeRef.current) {
        animationRef.current = requestAnimationFrame(analyzeMood);
        return;
      }
      lastVideoTimeRef.current = timestamp;

      const video = videoRef.current;
      const detections = landmarkerRef.current.detectForVideo(video, timestamp);

      if (detections?.faceBlendshapes?.length) {
        const updatedMood = translateMood(detections.faceBlendshapes);

        // 🔥 Step 2: smoothing
        const SMOOTHING = 0.65;
        setMood((prev) => {
          if (!prev) return updatedMood;
          return {
            ...updatedMood,
            confidence: Math.round(
              prev.confidence * SMOOTHING + updatedMood.confidence * (1 - SMOOTHING)
            ),
          };
        });

        setAvatarState(updatedMood.label === 'Happy' ? 'smiling' : 'listening');

        if (canvasRef.current && detections.faceLandmarks?.length) {
          const ctx = canvasRef.current.getContext('2d');
          canvasRef.current.width = video.videoWidth;
          canvasRef.current.height = video.videoHeight;
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.strokeStyle = updatedMood.color;
          ctx.lineWidth = 2;

          detections.faceLandmarks[0].forEach((point) => {
            ctx.fillStyle = updatedMood.color;
            ctx.fillRect(point.x * canvasRef.current.width, point.y * canvasRef.current.height, 2, 2);
          });
        }
      }

      animationRef.current = requestAnimationFrame(analyzeMood);
    },
    [translateMood]
  );

  useEffect(() => {
    if (!loadingModels && !streamError) {
      animationRef.current = requestAnimationFrame(analyzeMood);
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [loadingModels, streamError, analyzeMood]);

  // UI rendering
  const micStateClass = speakingMessageId
    ? "speaking"
    : callActive && listening
    ? "listening"
    : callActive
    ? "connected"
    : "idle";

  return (
    <div className="video-call-page">
      <header className="video-call-header">
        <button
          className="ghost-btn"
          onClick={() => {
            stopCamera();
            endCall();
            navigate(-1);
          }}
        >
          <ArrowLeft size={18} />
          Back to dashboard
        </button>

        <div>
          <p className="session-label">AI video buddy</p>
          <h1>Mood-aware practice</h1>
        </div>

        <div className="status-stack">
          {loadingModels && <span className="status-chip">Loading mood detector…</span>
          }
          {streamError && <span className="status-chip warn">Camera unavailable</span>
          }
          {!streamError && !loadingModels && <span className="status-chip live">Live</span>
          }
        </div>
      </header>

      <div className="video-call-layout">
        {/* Left side - AI 3D Avatar */}
        <section className="ai-avatar-section">
          <div className="ai-avatar-container">
            <Canvas className="ai-avatar-canvas">
              <ambientLight intensity={0.5} />
              <pointLight position={[10, 10, 10]} />
              <Avatar3D 
                ref={avatarRef}
                isSpeaking={!!speakingMessageId} 
                mood={mood} 
              />
            </Canvas>
          </div>

          <div className="mood-card" style={{ borderColor: mood.color }}>
            <p className="mood-label">Detected mood</p>
            <h2 style={{ color: mood.color }}>{mood.label}</h2>
            <p className="mood-confidence">Confidence {mood.confidence}%</p>
            <p className="mood-description">{mood.description}</p>
          </div>
        </section>

        {/* Right side - User video and chat */}
        <section className="right-panel">
          {/* Chat messages */}
          <div className="chat-section">
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

            <div className="voice-controls">
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
                      {callConnecting ? <span className="spin">Connecting...</span> : <Mic size={22} />}
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
            </div>
          </div>
        </section>
      </div>

      {/* User video in corner - moved outside the main layout */}
      <div className="user-video-corner">
        <div className="video-wrapper">
          {!streamError ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted />
              <canvas ref={canvasRef} className="landmark-canvas" />
            </>
          ) : (
            <div className="video-error">
              <CameraOff size={28} />
              <p>{streamError}</p>
            </div>
          )}
        </div>
        <div className="video-hint">
          {streamError ? (
            <p>
              Grant camera permissions and reload this page.{' '}
              <button className="text-link" onClick={() => navigate(0)}>
                Retry
              </button>
            </p>
          ) : (
            <p>Stay within the frame so we can read your expression accurately.</p>
          )}
        </div>
      </div>

      {streamError && (
        <div className="video-alert">
          <AlertTriangle size={18} />
          <span>{streamError}</span>
        </div>
      )}
    </div>
  );
};

export default VideoCall;
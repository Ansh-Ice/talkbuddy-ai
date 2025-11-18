import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, Volume2, Save, Loader2 } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import './GuidedRoutine.css';

const ROUTINES = {
  'breathe-peace': {
    title: 'Breathe & Peace',
    tag: 'Mindful warm-up',
    subtitle: 'Warm-up your mouth muscles before speaking.',
    speechScript:
      'Welcome to Breathe and Peace. Start with ten seconds of deep breathing, inhale through your nose and exhale through your mouth. Next, do ten seconds of lip rolls making a gentle bbbrrr sound. Finally, stretch your tongue for ten seconds by repeating la-la-la and ta-ta-ta with clear articulation. Keep your shoulders relaxed and continue breathing calmly.',
    steps: [
      { duration: '10 seconds', cue: 'Deep breathing (inhale–exhale)' },
      { duration: '10 seconds', cue: 'Lip rolls (bbbbrrr… sound)' },
      { duration: '10 seconds', cue: 'Tongue stretching (la-la-la, ta-ta-ta)' },
    ],
    tip: 'Keep shoulders relaxed and focus on slow, intentional movement.',
  },
  'confidence-booster': {
    title: 'Confidence Booster',
    tag: 'Voice prompt',
    subtitle: 'Build your speaking confidence with a guided introduction.',
    speechScript:
      'Confidence booster time. Say your name, your city, one thing you like, and how you feel today. For example: “My name is Rahul. I live in Delhi. I like football. Today I feel excited.” After that, answer these quick questions: What did you eat today? What is your plan after this? Who is your favorite actor? What do you want to learn this week? What made you smile recently? Speak clearly and take your time.',
    prompt: 'Say your name, your city, one thing you like, and how you feel today.',
    example: '“My name is Rahul. I live in Delhi. I like football. Today I feel excited.”',
    rapidQuestions: [
      'What did you eat today?',
      'What is your plan after this?',
      'Who is your favorite actor?',
      'What do you want to learn this week?',
      'What made you smile recently?',
    ],
  },
};

const GuidedRoutine = ({ user }) => {
  const { routineId } = useParams();
  const routine = ROUTINES[routineId] || ROUTINES['breathe-peace'];

  const navigate = useNavigate();
  const recognitionRef = useRef(null);
  const synthRef = useRef(null);
  const utteranceRef = useRef(null);

  const [speechSupported, setSpeechSupported] = useState(true);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [transcript, setTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const routineName = useMemo(() => routine.title, [routine]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setError('Speech recognition is not supported on this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setListening(true);
      setStatusMessage('Listening…');
      setError('');
    };

    recognition.onerror = (event) => {
      setListening(false);
      setStatusMessage('');
      const friendly =
        event.error === 'not-allowed'
          ? 'Microphone permission denied. Enable it in your browser settings.'
          : event.error === 'no-speech'
          ? "We couldn't hear anything. Try again."
          : 'Speech recognition had an issue. Please retry.';
      setError(friendly);
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          setTranscript((prev) => `${prev} ${text}`.trim());
        } else {
          interim += text;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onend = () => {
      setListening(false);
      setStatusMessage('');
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, []);

  useEffect(() => {
    if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      synthRef.current = window.speechSynthesis;
      setTtsSupported(true);
    } else {
      setTtsSupported(false);
    }

    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    setTranscript('');
    setInterimTranscript('');
    setStatusMessage('');
    setError('');
  }, [routineId]);

  const playPrompt = () => {
    if (!ttsSupported || !routine.speechScript) {
      setError('Text-to-speech is not supported here.');
      return;
    }

    if (synthRef.current?.speaking) {
      synthRef.current.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(routine.speechScript);
    utterance.lang = 'en-US';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setError('Unable to play the voice prompt. Please try again.');
    };
    utteranceRef.current = utterance;
    synthRef.current?.speak(utterance);
  };

  const startRecording = () => {
    if (!speechSupported) return;
    setTranscript('');
    setInterimTranscript('');
    try {
      recognitionRef.current?.start();
    } catch (err) {
      setError('Microphone is busy or not accessible. Close other apps and retry.');
    }
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
  };

  const handleSave = async () => {
    if (!transcript.trim()) {
      setError('Record your response before saving.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      await addDoc(collection(db, 'guidedSessions'), {
        userId: user?.uid || 'anonymous',
        userEmail: user?.email || null,
        routineId,
        routineName,
        transcript: transcript.trim(),
        createdAt: serverTimestamp(),
      });
      setStatusMessage('Response saved successfully.');
    } catch (err) {
      setError('Could not save your response. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="guided-page">
      <header className="guided-header">
        <button className="ghost-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
          Back
        </button>
        <div>
          <p className="guided-label">{routine.tag}</p>
          <h1>{routine.title}</h1>
        </div>
        <button className="ghost-btn" onClick={playPrompt} disabled={!ttsSupported}>
          <Volume2 size={18} />
          Play Prompt
        </button>
      </header>

      <main className="guided-body">
        <section className="guided-panel">
          <p className="guided-subtitle">{routine.subtitle}</p>

          {routine.steps && (
            <ul className="guided-steps">
              {routine.steps.map((step, idx) => (
                <li key={step.cue + idx}>
                  <span className="step-duration">{step.duration}</span>
                  <span className="step-cue">{step.cue}</span>
                </li>
              ))}
            </ul>
          )}

          {routine.tip && <p className="guided-tip">Tip: {routine.tip}</p>}

          {routine.prompt && (
            <div className="guided-script">
              <p>{routine.prompt}</p>
              {routine.example && (
                <p className="guided-example">
                  Example:
                  <br />
                  <span>{routine.example}</span>
                </p>
              )}
            </div>
          )}

          {routine.rapidQuestions && (
            <div className="guided-rapid">
              <p>Rapid-fire follow ups:</p>
              <ul>
                {routine.rapidQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="guided-panel recorder">
          <div className="recorder-header">
            <div>
              <p className="guided-label">Voice capture</p>
              <h2>Your response</h2>
            </div>
            <span className={`status-chip ${listening ? 'live' : ''}`}>
              {listening ? 'Recording…' : 'Idle'}
            </span>
          </div>

          <div className="recorder-controls">
            {!listening ? (
              <button className="call-btn start" onClick={startRecording} disabled={!speechSupported}>
                <Mic size={18} />
                Start recording
              </button>
            ) : (
              <button className="call-btn end" onClick={stopRecording}>
                <MicOff size={18} />
                Stop recording
              </button>
            )}
            <button className="call-btn secondary" onClick={playPrompt} disabled={!ttsSupported}>
              <Volume2 size={18} />
              Hear prompt
            </button>
          </div>

          <div className="transcript-box" aria-live="polite">
            {transcript ? <p>{transcript}</p> : <p className="placeholder">Your words will appear here.</p>}
            {interimTranscript && <p className="interim">{interimTranscript}</p>}
          </div>

          <div className="save-row">
            <button className="primary-btn" onClick={handleSave} disabled={!transcript.trim() || saving}>
              {saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
              {saving ? 'Saving…' : 'Save response'}
            </button>
            {statusMessage && <span className="status-msg">{statusMessage}</span>}
          </div>

          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default GuidedRoutine;


import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, AlertTriangle, CameraOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
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

const VideoCall = () => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const avatarRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animationRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const [streamError, setStreamError] = useState('');
  const [loadingModels, setLoadingModels] = useState(true);
  const [mood, setMood] = useState(defaultMood);
  const [avatarState, setAvatarState] = useState('listening');

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
      avatarRef.current = null;
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

  return (
    <div className="video-call-page">
      <header className="video-call-header">
        <button
          className="ghost-btn"
          onClick={() => {
            stopCamera();
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
          {loadingModels && <span className="status-chip">Loading mood detector…</span>}
          {streamError && <span className="status-chip warn">Camera unavailable</span>}
          {!streamError && !loadingModels && <span className="status-chip live">Live</span>}
        </div>
      </header>

      <main className="video-call-body">
        <section className="ai-stage">
          <div className={`ai-avatar ${avatarState}`}>
            <div className="avatar-face">
              <div className="avatar-eyes">
                <span />
                <span />
              </div>
              <div className={`avatar-mouth ${mood.label.toLowerCase()}`} />
            </div>
          </div>

          <div className="mood-card" style={{ borderColor: mood.color }}>
            <p className="mood-label">Detected mood</p>
            <h2 style={{ color: mood.color }}>{mood.label}</h2>
            <p className="mood-confidence">Confidence {mood.confidence}%</p>
            <p className="mood-description">{mood.description}</p>
          </div>
        </section>

        <section className="user-video-panel">
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
        </section>
      </main>

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

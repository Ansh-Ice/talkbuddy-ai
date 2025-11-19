# Video Call Feature Implementation

## Overview
The Video Call feature integrates:
1. AI 3D Avatar using Three.js and Ready Player Me
2. User video feed with emotion detection
3. Voice chat with speech recognition and text-to-speech

## Key Components

### 1. VideoCall Component (`src/VideoCall.jsx`)
- Combines all functionality in a single component
- Manages user camera and microphone access
- Integrates emotion detection using MediaPipe
- Implements voice chat with speech recognition and synthesis

### 2. Avatar3D Component (`src/components/Avatar3D.jsx`)
- Renders a 3D avatar using Three.js and React Three Fiber
- Supports facial expressions based on detected mood
- Implements lip sync during speech

### 3. Voice Chat Integration
- Speech recognition using Web Speech API
- Text-to-speech using Web Speech Synthesis API
- Real-time conversation with AI assistant

## Features

### AI 3D Avatar
- Displays in the left panel of the video call interface
- Responds to user emotions with appropriate facial expressions
- Animates mouth movement during speech synthesis

### User Video Feed
- Displayed in the top-right corner
- Real-time emotion detection using MediaPipe Face Landmarker
- Visual feedback with facial landmarks overlay

### Voice Chat
- Start/End call controls
- Real-time speech recognition
- AI responses with text-to-speech
- Conversation history display

## Implementation Details

### Emotion Detection
- Uses MediaPipe Face Landmarker model
- Detects facial expressions in real-time
- Maps expressions to mood categories (Happy, Sad, Surprise, Anger, Neutral)
- Smooths mood transitions for better UX

### 3D Avatar
- Loads Ready Player Me avatar model
- Supports morph targets for facial expressions
- Animates based on detected mood
- Lip sync during speech synthesis

### Voice Chat
- Continuous speech recognition
- Automatic silence detection (3s timeout)
- Maximum recording time (60s)
- Text-to-speech with avatar lip sync

## Usage

1. Navigate to the Video Call page
2. Grant camera and microphone permissions
3. Click "Start Call" to begin
4. Speak naturally - the AI will respond
5. View your emotion detection results
6. Click "End Call" when finished

## Technical Notes

### Dependencies
- `@react-three/fiber` for 3D rendering
- `three` for Three.js core
- `@mediapipe/tasks-vision` for emotion detection
- Web Speech API for voice features

### Performance Considerations
- Facial landmark detection runs efficiently using requestAnimationFrame
- Avatar animations are optimized with React Three Fiber
- Speech recognition is paused during AI responses to prevent feedback

### Browser Support
- Requires a modern browser with Web Speech API support
- Camera and microphone access required
- WebGL support needed for 3D rendering
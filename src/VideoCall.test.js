import React from 'react';
import { render, screen } from '@testing-library/react';
import VideoCall from './VideoCall';

// Mock the necessary modules
jest.mock('@react-three/fiber', () => ({
  Canvas: ({ children }) => <div data-testid="canvas">{children}</div>,
  useFrame: jest.fn(),
  useLoader: jest.fn(),
}));

jest.mock('./components/Avatar3D', () => {
  return React.forwardRef((props, ref) => <div data-testid="avatar-3d" />);
});

jest.mock('@mediapipe/tasks-vision', () => ({
  FaceLandmarker: jest.fn(),
  FilesetResolver: {
    forVisionTasks: jest.fn(),
  },
}));

jest.mock('lucide-react', () => ({
  ArrowLeft: () => <div>ArrowLeft</div>,
  AlertTriangle: () => <div>AlertTriangle</div>,
  CameraOff: () => <div>CameraOff</div>,
  Mic: () => <div>Mic</div>,
  MicOff: () => <div>MicOff</div>,
  Volume2: () => <div>Volume2</div>,
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

// Mock window.speechSynthesis and related APIs
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: jest.fn(),
    cancel: jest.fn(),
    speaking: false,
  },
  writable: true,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: jest.fn().mockImplementation(() => ({})),
  writable: true,
});

Object.defineProperty(window, 'SpeechRecognition', {
  value: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    continuous: true,
    interimResults: true,
    lang: 'en-US',
    onstart: jest.fn(),
    onresult: jest.fn(),
    onerror: jest.fn(),
    onend: jest.fn(),
  })),
  writable: true,
});

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }],
    }),
  },
  writable: true,
});

describe('VideoCall Component', () => {
  test('renders without crashing', () => {
    render(<VideoCall />);
    
    // Check if the main elements are rendered
    expect(screen.getByText('AI video buddy')).toBeInTheDocument();
    expect(screen.getByText('Mood-aware practice')).toBeInTheDocument();
    
    // Check if the AI avatar container is rendered
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    
    // Check if the user video panel is rendered
    expect(screen.getByText('Stay within the frame so we can read your expression accurately.')).toBeInTheDocument();
  });

  test('renders voice chat controls', () => {
    render(<VideoCall />);
    
    // Check if voice chat elements are rendered
    expect(screen.getByText('Click Start Call to begin practicing')).toBeInTheDocument();
  });
});
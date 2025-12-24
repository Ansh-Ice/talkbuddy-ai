/**
 * Centralized API client for all backend calls
 * Uses environment variable VITE_API_BASE_URL for the backend URL
 * Falls back to localhost:8000 for development if not set
 */

let API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Ensure API_BASE_URL does not have a trailing slash
API_BASE_URL = API_BASE_URL.replace(/\/$/, '');

console.log('API Base URL:', API_BASE_URL);

/**
 * Generic fetch wrapper with error handling
 * Safely constructs URLs by ensuring endpoint starts with /
 */
async function fetchAPI(endpoint, options = {}) {
  // Ensure endpoint starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${normalizedEndpoint}`;
  
  console.debug(`[API] ${options.method || 'GET'} ${url}`);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw new Error(data.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    return data;
  } catch (error) {
    console.error(`API Error [${normalizedEndpoint}]:`, error.message);
    throw error;
  }
}

// ==================== Quiz Assessment APIs ====================

export const generateAssessment = (userId) => {
  return fetchAPI('/generate_assessment/', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
};

export const submitQuiz = (userId, quizId, responses, scores, totalScore, percentage) => {
  return fetchAPI('/submit_quiz/', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      quiz_id: quizId,
      responses,
      scores,
      total_score: totalScore,
      percentage,
    }),
  });
};

// ==================== Oral Quiz Evaluation APIs ====================

export const evaluateOralResponse = (userId, questionId, userResponse, questionText) => {
  return fetchAPI('/api/oral-quiz/evaluate', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      questionId,
      userResponse,
      questionText,
    }),
  });
};

// ==================== Account Deletion APIs ====================

export const confirmAccountDeletion = (token, uid) => {
  const endpoint = `/confirm-deletion?token=${encodeURIComponent(token)}&uid=${encodeURIComponent(uid)}`;
  return fetchAPI(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

// ==================== Voice Chat API ====================

export const voiceChat = (messages, userName) => {
  return fetchAPI('/voice_chat/', {
    method: 'POST',
    body: JSON.stringify({
      messages,
      user_name: userName,
    }),
  });
};

// ==================== Email APIs ====================

export const sendDeletionEmail = (userId, email, displayName, deletionToken, confirmationUrl) => {
  return fetchAPI('/send-deletion-email', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      email,
      displayName,
      deletionToken,
      confirmationUrl,
    }),
  });
};

// ==================== Health Check API ====================

export const healthCheck = () => {
  return fetchAPI('/health');
};

export default {
  generateAssessment,
  submitQuiz,
  evaluateOralResponse,
  voiceChat,
  sendDeletionEmail,
  confirmAccountDeletion,
  healthCheck,
};

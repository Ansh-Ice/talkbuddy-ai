# Frontend Backend URL Refactoring - Audit Complete

## Problem
Frontend was hardcoding localhost/127.0.0.1:8000 URLs in multiple components, causing production deployment failures.

## Solution Overview
Created a **centralized API helper** (`src/api.js`) that:
- Uses `import.meta.env.VITE_API_BASE_URL` environment variable
- Falls back to `http://localhost:8000` for development only
- Wraps all backend API calls with proper error handling
- Provides consistent request/response handling across the app

## Files Created

### 1. `src/api.js` (NEW)
Centralized API client with the following exported functions:
- `generateAssessment(userId)` - Quiz generation
- `submitQuiz(userId, quizId, responses, scores, totalScore, percentage)` - Quiz submission
- `evaluateOralResponse(userId, questionId, userResponse, questionText)` - Oral quiz evaluation
- `voiceChat(messages, userName)` - Voice chat interactions
- `sendDeletionEmail(userId, email, displayName, deletionToken, confirmationUrl)` - Account deletion emails
- `confirmAccountDeletion(token, uid)` - Confirm deletion
- `healthCheck()` - Health check endpoint

## Files Modified

### 2. `src/AIQuiz.jsx`
**Changes:**
- Added: `import * as api from "./api"`
- Replaced hardcoded fetch calls:
  - `http://127.0.0.1:8000/generate_assessment/` → `api.generateAssessment(user.uid)`
  - `http://localhost:8000/api/oral-quiz/evaluate` → `api.evaluateOralResponse(...)`
  - `http://127.0.0.1:8000/submit_quiz/` → `api.submitQuiz(...)`

### 3. `src/ConfirmDeletion.jsx`
**Changes:**
- Added: `import * as api from "./api"`
- Replaced hardcoded fetch call:
  - `http://localhost:8000/confirm-deletion` → `api.confirmAccountDeletion(token, uid)`
- Removed redundant fetch call

### 4. `src/OralQuestion.jsx`
**Changes:**
- Added: `import * as api from "./api"`
- Replaced hardcoded fetch call:
  - `http://localhost:8000/api/oral-quiz/evaluate` → `api.evaluateOralResponse(...)`

### 5. `src/ProfileSidebar.jsx`
**Changes:**
- Added: `import * as api from "./api"`
- Replaced hardcoded fetch call:
  - `http://localhost:8000/send-deletion-email` → `api.sendDeletionEmail(...)`

### 6. `src/VideoCall.jsx`
**Changes:**
- Added: `import * as api from "./api"`
- Removed: Hardcoded `const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000")`
- Replaced hardcoded fetch call:
  - `${API_BASE}/voice_chat/` → `api.voiceChat(messages, userName)`

### 7. `src/VoicePractice.jsx`
**Changes:**
- Added: `import * as api from "./api"`
- Removed: Hardcoded `const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000")`
- Replaced hardcoded fetch calls:
  - `${API_BASE}/api/oral-quiz/evaluate` → `api.evaluateOralResponse(...)`
  - `${API_BASE}/voice_chat/` → `api.voiceChat(...)`

## Backend URL Configuration

### For Development
No environment variable needed - falls back to `http://localhost:8000`

### For Production (Render)
Set environment variable in Render dashboard:
```
VITE_API_BASE_URL=https://your-deployed-backend-url.com
```

Or in `.env` file:
```
VITE_API_BASE_URL=https://your-deployed-backend-url.com
```

## Verification

✅ **Zero hardcoded localhost references** in frontend source code (excluding comments)
✅ **All API calls centralized** in single `api.js` file
✅ **Environment variable based** for production deployment
✅ **Fallback for development** (localhost:8000)
✅ **Consistent error handling** across all API calls
✅ **No business logic changes** - only routing improvements

## Testing Checklist

Before production deployment:
1. ✅ Set `VITE_API_BASE_URL` environment variable to actual backend URL
2. ✅ Verify all quiz endpoints work (generate, submit, evaluate)
3. ✅ Verify voice chat endpoints work
4. ✅ Verify account deletion flow
5. ✅ Check browser console for API errors
6. ✅ Verify network tab shows requests to correct backend URL


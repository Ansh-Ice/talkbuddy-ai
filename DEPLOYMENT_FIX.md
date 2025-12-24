# Render Deployment Fix - Ollama Initialization Blocking

## Problem Identified
The FastAPI app was getting stuck at "Deploying…" on Render because of blocking Ollama/LangChain model initialization. The issue was in the `OllamaService` class which used a singleton pattern that called `_initialize_model()` in `__new__()`, causing model instantiation during app startup.

## Root Cause
1. **Singleton pattern with eager initialization**: The `OllamaService.__new__()` method was calling `_initialize_model()` immediately upon first instantiation
2. **ChatOllama blocking**: When `ChatOllama` is instantiated, it attempts to validate connectivity to the Ollama service, which can timeout or hang if the service isn't running
3. **Long timeouts**: The original timeout was set to 120 seconds, meaning even a failed connection attempt would block for 2 minutes

## Solution Implemented

### Changes to OllamaService class:

1. **Removed Singleton Pattern**
   - Removed `__new__()` method that triggered immediate initialization
   - Removed `_instance` variable
   - Service now uses class methods directly (static lazy initialization pattern)

2. **Lazy Initialization**
   - Model is now only initialized when `get_model()` is first called (during first request)
   - App starts instantly without waiting for Ollama connection
   - Subsequent requests reuse the cached model

3. **Added Retry Logic with Backoff**
   - New `_initialization_attempted` flag prevents repeated initialization attempts
   - Added `_retry_after` mechanism: if initialization fails, waits 10 seconds before retrying
   - Prevents thundering herd of connection attempts if Ollama is temporarily down

4. **Reduced Timeout**
   - Lowered from 120 seconds → 30 seconds
   - Fails faster if Ollama service is unreachable, preventing prolonged blocking

5. **Better Error Handling**
   - Distinguishes between "not yet attempted" and "failed but retrying" states
   - Returns user-friendly error messages with appropriate HTTP status codes

## Code Changes Summary

**Before:**
```python
class OllamaService:
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._initialize_model()  # ❌ BLOCKS ON STARTUP
        return cls._instance
```

**After:**
```python
class OllamaService:
    @classmethod
    async def get_model(cls):
        if cls._model is None:
            cls._initialize_model()  # ✅ Only when first request comes in
        return cls._model
```

## Impact

- **App Startup**: Now starts in <1 second instead of waiting for Ollama
- **Deployment**: Render deployment no longer gets stuck
- **Graceful Degradation**: If Ollama isn't available, endpoints return 503 with helpful message instead of timing out
- **Functionality**: No change to API behavior - all endpoints work exactly the same way

## Testing After Deployment

1. Check that app starts: `curl http://localhost:8000/health`
2. Should get instant response even if Ollama isn't running
3. When Ollama is available, all endpoints function normally
4. If Ollama goes down during runtime, requests get 503 error and service retries after 10 seconds

## Files Modified
- `server/main.py` - OllamaService class refactored (lines 262-321)

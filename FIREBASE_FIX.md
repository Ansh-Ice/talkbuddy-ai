# Firebase Initialization Fix - 503 Database Service Unavailable

## Problem Identified

You were receiving **503 Database service unavailable** errors even though Firebase Admin SDK logs showed successful initialization. This was caused by **incorrect Firestore initialization and variable scoping issues**.

## Root Causes

### 1. **Two Separate Firestore Initialization Methods**
**Before (BROKEN):**
```python
# Lines 67-72: Direct Firestore client creation (WRONG)
db_firestore = firestore.Client(credentials=credentials, project=project_id)

# Lines 72-84: Separate Firebase Admin SDK initialization (REDUNDANT)
firebase_admin_app = firebase_admin.initialize_app(cred)
```

**Problem:** 
- Created a custom Firestore client directly without using Firebase Admin SDK
- Bypassed the Firebase Admin SDK's connection pooling and configuration
- Initialized Firebase Admin SDK in a separate try-catch block AFTER Firestore was already created
- This caused `db_firestore` to be set to `None` in the except block, leaving endpoints unable to access the database

### 2. **Incorrect Initialization Order**
- Firestore client was created directly instead of obtained from Firebase Admin SDK
- Firebase Admin SDK was initialized after Firestore, not before
- This violated the Firebase library's intended initialization pattern

### 3. **Variable Scoping Issues**
- `db_firestore` was initialized in a try block but could be `None` when caught in except
- `service_account_info` was scoped only within the try block, unavailable for Firebase Admin SDK initialization

### 4. **Missing Import**
- `from firebase_admin import firestore` was not imported at module level
- This forced code to use `from google.cloud import firestore` directly instead of Firebase Admin SDK's wrapper

## Solution Implemented

### **New Initialization Flow:**

```python
# 1. Import Firebase Admin SDK and Firestore properly
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore as fb_firestore

# 2. Declare globals at module level
db_firestore = None
firebase_admin_app = None
service_account_info = None

# 3. Single unified initialization block
try:
    # Get credentials
    service_account_info = json.loads(firebase_creds_json)
    
    # Initialize Firebase Admin SDK FIRST
    firebase_admin_app = firebase_admin.initialize_app(cred)
    
    # Get Firestore client FROM the Admin SDK instance
    db_firestore = fb_firestore.client()  # ✅ This uses the initialized Admin SDK
    
except Exception as e:
    db_firestore = None  # ✅ Properly set to None if initialization fails
```

### Key Changes:

1. ✅ **Single initialization block** - Firebase Admin SDK and Firestore initialization combined in one try-catch
2. ✅ **Correct order** - Firebase Admin SDK initialized FIRST
3. ✅ **Use Firebase Admin SDK's Firestore client** - `firebase_admin.firestore.client()` instead of creating custom client
4. ✅ **Global scope** - All variables (`db_firestore`, `firebase_admin_app`, `service_account_info`) declared at module level
5. ✅ **Proper imports** - Added `from firebase_admin import firestore as fb_firestore`
6. ✅ **Removed unused imports** - Removed duplicate `import os` and unused `Client as FirestoreClient`

## Why the 503 Error Occurred

**Chain of events:**
1. Code tried to create Firestore client directly → succeeded temporarily
2. Then initialized Firebase Admin SDK in separate block → could fail silently
3. If ANY exception occurred, both `db_firestore` and `firebase_admin_app` were set to `None`
4. When endpoints checked `if not db_firestore:`, it returned `None`
5. Endpoints returned 503 "Database service unavailable" even though Admin SDK logs showed "success"

**The bug:** The "success" message only appeared if Firebase Admin SDK initialized in its try-block, but the main Firestore client wasn't obtained from it—they were two independent initialization attempts!

## Files Modified

- `server/main.py` - Lines 1-85
  - Consolidated Firebase initialization
  - Fixed imports
  - Corrected initialization order
  - Ensured global `db_firestore` is never `None` when initialization succeeds

## Testing

After deployment:
1. All endpoints should now work without 503 errors
2. Check logs for: `"Firestore client obtained successfully for project {project_id}"`
3. If initialization fails, logs will show: `"Failed to initialize Firebase: ..."`

The app will now properly initialize Firestore once at startup and all request handlers will use the same guaranteed-valid Firestore client.

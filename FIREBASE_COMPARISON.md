# Firebase Initialization - Before & After Comparison

## BEFORE (BROKEN - Caused 503 Errors)

```python
# PROBLEM 1: Missing import
# from firebase_admin import firestore  ❌

# PROBLEM 2: Global declared but no guarantee of value
db_firestore = None

# PROBLEM 3: First try-catch creates custom Firestore client (WRONG)
try:
    from google.cloud import firestore  # ❌ Bypasses Firebase Admin SDK
    credentials = service_account.Credentials.from_service_account_info(...)
    db_firestore = firestore.Client(credentials=credentials, project=project_id)  # ❌ Direct client
except:
    db_firestore = None  # ❌ db_firestore becomes None

# PROBLEM 4: Second separate try-catch initializes Firebase Admin SDK
try:
    firebase_admin_app = firebase_admin.initialize_app(cred)  # ⚠️ Too late! Firestore already created
except:
    firebase_admin_app = None  # ❌ Falls back to None

# RESULT: Endpoints check "if not db_firestore:" → 503 Database service unavailable
```

**Why 503 errors occurred:**
- If the first try-catch succeeded, `db_firestore` had a client created OUTSIDE Firebase Admin SDK
- If the first try-catch failed, `db_firestore` was set to `None`
- The second initialization of Firebase Admin SDK couldn't help because `db_firestore` was already set
- Endpoints had no valid Firestore client → **503 Service Unavailable**

---

## AFTER (FIXED)

```python
# ✅ CORRECT IMPORTS
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore as fb_firestore

# ✅ GLOBALS AT MODULE LEVEL
db_firestore = None
firebase_admin_app = None
service_account_info = None

# ✅ SINGLE UNIFIED INITIALIZATION
try:
    # Step 1: Get credentials
    service_account_info = json.loads(firebase_creds_json)
    project_id = service_account_info.get('project_id')
    
    # Step 2: Initialize Firebase Admin SDK FIRST
    if not firebase_admin._apps:
        from firebase_admin import credentials as fb_credentials
        cred = fb_credentials.Certificate(service_account_info)
        firebase_admin_app = firebase_admin.initialize_app(cred)  # ✅ Initialize Admin SDK
    
    # Step 3: Get Firestore client FROM the Admin SDK
    db_firestore = fb_firestore.client()  # ✅ Uses the initialized Admin SDK
    
except Exception as e:
    logger.error(f"Failed to initialize Firebase: {e}", exc_info=True)
    db_firestore = None  # ✅ Only set to None if EVERYTHING fails
    firebase_admin_app = None

# RESULT: Endpoints have guaranteed valid db_firestore or proper error handling
```

**Why this works:**
1. ✅ Firebase Admin SDK is initialized FIRST
2. ✅ Firestore client is obtained FROM the Admin SDK (proper connection pooling)
3. ✅ Single try-catch ensures consistency
4. ✅ If anything fails, both variables are `None` AND logged
5. ✅ Endpoints have valid database or clear error message

---

## Key Differences

| Aspect | BEFORE | AFTER |
|--------|--------|-------|
| **Firestore Init** | Custom client created directly ❌ | Obtained from Firebase Admin SDK ✅ |
| **Initialization Order** | Firebase Admin SDK after Firestore | Firebase Admin SDK first |
| **Number of try-catch blocks** | 2 separate blocks | 1 unified block |
| **Firestore Import** | Missing | Added ✅ |
| **Error handling** | Could partially succeed | All-or-nothing approach |
| **Result** | 503 errors even on "success" | 503 only on actual failure |


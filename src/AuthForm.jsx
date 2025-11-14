// src/AuthForm.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

const AuthForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", message: "", code: "" });
  const navigate = useNavigate();

  function extractAuthCode(err) {
    if (err && typeof err.code === 'string' && err.code) return err.code;
    const msg = typeof err?.message === 'string' ? err.message : '';
    // Firebase often embeds code in message like: "Firebase: Error (auth/email-already-in-use)."
    const m = msg.match(/\((auth\/[\w-]+)\)/i);
    if (m && m[1]) return m[1];
    return 'unknown';
  }

  function formatFirebaseError(err) {
    const code = extractAuthCode(err);
    switch (code) {
      case "auth/email-already-in-use":
        return { title: "Email already in use", message: "An account with this email already exists. Try logging in instead.", code };
      case "auth/invalid-email":
        return { title: "Invalid email", message: "Please enter a valid email address.", code };
      case "auth/weak-password":
        return { title: "Weak password", message: "Password must be at least 6 characters.", code };
      case "auth/wrong-password":
        return { title: "Incorrect password", message: "The password you entered is incorrect.", code };
      case "auth/user-not-found":
        return { title: "Account not found", message: "No account exists with this email. Please register first.", code };
      case "auth/account-exists-with-different-credential":
        return { title: "Use different sign-in method", message: "This email is linked to another provider. Try a different method or reset your password.", code };
      case "auth/too-many-requests":
        return { title: "Too many attempts", message: "Access to this account has been temporarily disabled due to many failed attempts. Try again later.", code };
      case "auth/popup-closed-by-user":
        return { title: "Google sign-in cancelled", message: "The sign-in popup was closed before completing. Please try again.", code };
      case "auth/popup-blocked":
        return { title: "Popup blocked", message: "Your browser blocked the sign-in popup. Allow popups and try again.", code };
      case "auth/operation-not-allowed":
        return { title: "Sign-in not allowed", message: "This sign-in method is disabled. Please contact support.", code };
      case "auth/user-disabled":
        return { title: "Account disabled", message: "This account has been disabled. Contact support for help.", code };
      case "auth/network-request-failed":
        return { title: "Network error", message: "We couldn't reach the server. Check your internet connection and try again.", code };
      case "auth/invalid-credential":
        return { title: "Invalid credentials", message: "Your credentials are invalid or expired. Please try again.", code };
      case "auth/account-not-registered":
        return { title: "Account not registered", message: "This Google account isn't registered here. Please sign up with email/password first.", code };
      default:
        return { title: "Something went wrong", message: err?.message || "Please try again.", code };
    }
  }

  function showError(err) {
    const { title, message, code } = formatFirebaseError(err);
    setErrorDialog({ open: true, title, message, code });
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setErrorDialog((s) => ({ ...s, open: false }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isAdminUsername = !isRegister && (email || '').trim() && !(email || '').includes('@');

  async function handleAuth(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorDialog((s) => ({ ...s, open: false }));
    try {
      // Admin login via Firestore (only when username style without @)
      if (!isRegister && isAdminUsername) {
        try {
          const cfgRef = doc(db, 'admin', 'config');
          let cfgSnap = await getDoc(cfgRef);
          if (!cfgSnap.exists()) {
            await setDoc(cfgRef, { username: 'sneh', password: 'sneh123', seededAt: Date.now() }, { merge: true });
            cfgSnap = await getDoc(cfgRef);
          }

          const adminDocsSnapshot = await getDocs(collection(db, 'admin'));
          const adminRecords = adminDocsSnapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...(docSnap.data() || {})
          }));

          const inputUser = (email || '').trim().toLowerCase();
          const inputPass = password;

          const matchedAdmin = adminRecords.find(record => {
            const usernameCandidate = (record.username || record.id || '').trim().toLowerCase();
            return usernameCandidate && usernameCandidate === inputUser;
          });

          if (matchedAdmin && inputPass === (matchedAdmin.password || '')) {
            const resolvedUsername = matchedAdmin.username || matchedAdmin.id;
            const sessionPayload = {
              username: resolvedUsername,
              docId: matchedAdmin.id,
              loginTime: Date.now(),
              isAdmin: true,
              method: 'firestore'
            };
            localStorage.setItem('adminSession', JSON.stringify(sessionPayload));
            navigate('/admin/dashboard', { replace: true });
            return;
          }

          // If admin username path, do NOT fall through to Firebase email/password
          showError({ code: 'auth/invalid-credential', message: 'Invalid admin credentials' });
          return;
        } catch (e) {
          // If Firestore unreachable, allow static fallback
          // if ((email || '').trim() === 'sneh' && password === 'sneh123') {
          //   localStorage.setItem('adminSession', JSON.stringify({
          //     username: 'sneh',
          //     loginTime: Date.now(),
          //     isAdmin: true,
          //     method: 'static-fallback'
          //   }));
          //   navigate('/admin/dashboard', { replace: true });
          //   return;
          // }
          showError({ code: 'auth/network-request-failed', message: 'Could not verify admin. Check connection or try again.' })
          return;
        }
      }

      if (isRegister) {
        if (!name.trim()) {
          setError("Please enter your name.");
          setIsSubmitting(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Set display name in Firebase Auth
        await updateProfile(cred.user, { displayName: name.trim() });
        // Save registration registry (keyed by normalized email)
        const emailKey = (cred.user.email || "").trim().toLowerCase();
        await setDoc(doc(db, "registeredEmails", emailKey), {
          email: cred.user.email,
          createdAt: Date.now(),
        });
        // Save user profile document
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          email: cred.user.email,
          name: name.trim(),
          goal: goal.trim(),
          createdAt: Date.now(),
          assessmentCompleted: false,
          quizCompleted: false,
          oralTestCompleted: false,
        });
        try {
          await sendEmailVerification(cred.user);
          console.log("Email verification sent successfully");
        } catch (emailError) {
          console.error("Error sending email verification:", emailError);
          // Continue with navigation even if email verification fails
        }
        navigate("/verify-email", { replace: true });
      } else {
        // Guard: only attempt Firebase auth for real emails
        if (!(email || '').includes('@')) {
          showError({ code: 'auth/invalid-email', message: 'Enter a valid email to sign in, or use admin username without @' })
          return;
        }
        const cred = await signInWithEmailAndPassword(auth, email, password);
        // Do NOT send verification on login. If not verified, require verification first.
        if (cred.user.emailVerified) {
          navigate("/", { replace: true });
        } else {
          navigate("/verify-email", { replace: true });
        }
      }
    } catch (err) {
      showError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleAuth() {
    const provider = new GoogleAuthProvider();
    setIsSubmitting(true);
    setErrorDialog((s) => ({ ...s, open: false }));
    try {
      const cred = await signInWithPopup(auth, provider);
      // Enforce: only allow Google sign-in if email was registered via our flow
      const email = (cred.user.email || "").trim().toLowerCase();
      const regDoc = await getDoc(doc(db, "registeredEmails", email));
      if (!regDoc.exists()) {
        // Not allowed: sign the user out and show error with specific code
        await signOut(auth);
        throw { code: 'auth/account-not-registered', message: 'This Google account is not registered. Please sign up first with email/password.' };
      }
      // Do NOT send verification on login. If not verified, require verification first.
      if (cred.user.emailVerified) {
        navigate("/", { replace: true });
      } else {
        navigate("/verify-email", { replace: true });
      }
    } catch (err) {
      showError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setErrorDialog({ open: true, title: "Email required", message: "Enter your email to reset your password.", code: "validation" });
      return;
    }
    setIsSubmitting(true);
    setErrorDialog((s) => ({ ...s, open: false }));
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email sent.");
    } catch (err) {
      showError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      <div className={`auth-card ${isRegister ? 'signup-mode' : 'login-mode'}`}>
        <div className="brand">
          <div className="brand-logo" aria-hidden="true">🗣️</div>
          <div>
            <h1 className="brand-title">TalkBuddy</h1>
            <p className="brand-subtitle">AI English Coach</p>
          </div>
        </div>

        <div className="auth-header">
          <h2 className="auth-title">{isRegister ? "Create your account" : "Welcome back"}</h2>
          <p className="auth-subtitle">{isRegister ? "Start learning with confidence" : "Sign in to continue"}</p>
          <div className="mode-indicator">
            {isRegister ? "🆕 New to TalkBuddy?" : "👋 Returning user?"}
          </div>
        </div>

        {errorDialog.open && (
          <div className="modal-overlay" role="presentation" onClick={() => setErrorDialog((s) => ({ ...s, open: false }))}>
            <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="err-title" aria-describedby="err-desc" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 id="err-title">{errorDialog.title}</h3>
                <button className="icon-btn" aria-label="Close" onClick={() => setErrorDialog((s) => ({ ...s, open: false }))}>✕</button>
              </div>
              <div id="err-desc" className="modal-body">{errorDialog.message}</div>
              <div className="modal-footer">
                <button className="primary" onClick={() => setErrorDialog((s) => ({ ...s, open: false }))}>OK</button>
              </div>
            </div>
          </div>
        )}

        <form className="auth-form" onSubmit={handleAuth} noValidate autoComplete="off">
          {isRegister && (
            <>
              <div className="form-field">
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="goal">Your English goal (optional)</label>
                <input
                  id="goal"
                  name="goal"
                  type="text"
                  placeholder="Crack interviews / fluency / travel, etc."
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="form-field">
            <label htmlFor="email">Email or admin username</label>
            <input
              id="email"
              name="email"
              type = "text"
              // type={isAdminUsername ? 'text' : 'email'}
              placeholder={isAdminUsername ? "admin username (e.g. 'sneh')" : "you@example.com"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              // autoComplete={isAdminUsername ? 'username' : 'email'}
              // inputMode={isAdminUsername ? 'text' : 'email'}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name={isAdminUsername ? 'admin-password' : 'password'}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isAdminUsername ? 'new-password' : (isRegister ? 'new-password' : 'current-password')}
              required
            />
          </div>

          {!isRegister && (
            <div className="form-row between">
              <button type="button" className="link" onClick={handleForgotPassword}>
                Forgot password?
              </button>
            </div>
          )}

          <button className="primary" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="divider"><span>or</span></div>

        <div className="social-logins">
          <button className="google" onClick={handleGoogleAuth} disabled={isSubmitting}>Continue with Google</button>
        </div>

        <p className="switch-mode">
          {isRegister ? (
            <>
              Already have an account?{' '}
              <button className="link" type="button" onClick={() => setIsRegister(false)}>Sign in</button>
            </>
          ) : (
            <>
              New to TalkBuddy?{' '}
              <button className="link" type="button" onClick={() => setIsRegister(true)}>Create an account</button>
            </>
          )}
        </p>

        {/* Admin link removed; admin login handled on this form via Firestore */}
      </div>
    </div>
  );
};

export default AuthForm;

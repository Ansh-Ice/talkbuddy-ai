// src/AuthForm.jsx
import React, { useState } from "react";
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
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

const AuthForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleAuth(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      if (isRegister) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Save email into registration registry (keyed by normalized email)
        const emailKey = (cred.user.email || "").trim().toLowerCase();
        await setDoc(doc(db, "registeredEmails", emailKey), {
          email: cred.user.email,
          createdAt: Date.now(),
        });
        await sendEmailVerification(cred.user);
        navigate("/verify-email", { replace: true });
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        if (cred.user.emailVerified) {
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/verify-email", { replace: true });
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleAuth() {
    const provider = new GoogleAuthProvider();
    setIsSubmitting(true);
    setError("");
    try {
      const cred = await signInWithPopup(auth, provider);
      // Enforce: only allow Google sign-in if email was registered via our flow
      const email = (cred.user.email || "").trim().toLowerCase();
      const regDoc = await getDoc(doc(db, "registeredEmails", email));
      if (!regDoc.exists()) {
        // Not allowed: sign the user out and show error
        await signOut(auth);
        throw new Error("This Google account is not registered. Please sign up first with email/password.");
      }
      if (cred.user.emailVerified) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/verify-email", { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email to reset password.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="brand">
          <div className="brand-logo" aria-hidden="true">🗣️</div>
          <div>
            <h1 className="brand-title">TalkBuddy</h1>
            <p className="brand-subtitle">AI English Coach</p>
          </div>
        </div>

        <h2 className="auth-title">{isRegister ? "Create your account" : "Welcome back"}</h2>
        <p className="auth-subtitle">{isRegister ? "Start learning with confidence" : "Sign in to continue"}</p>

        {error && <div className="error" role="alert">{error}</div>}

        <form className="auth-form" onSubmit={handleAuth} noValidate>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
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
      </div>
    </div>
  );
};

export default AuthForm;

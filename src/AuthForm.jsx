// src/components/AuthForm.jsx
import React, { useState } from "react";
import { auth } from "./firebase"; // import your firebase instance
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";

const AuthForm = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);

  // 🔹 Email & Password Login/Register
  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Registration successful!");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        alert("Login successful!");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // 🔹 Google Login
  const handleGoogleAuth = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      alert("Google login successful!");
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="auth-container">
      <h2>{isRegister ? "Register" : "Login"}</h2>
      <form onSubmit={handleAuth}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit">
          {isRegister ? "Register" : "Login"}
        </button>
      </form>

      <p onClick={() => setIsRegister(!isRegister)} style={{ cursor: "pointer" }}>
        {isRegister
          ? "Already have an account? Login"
          : "Don't have an account? Register"}
      </p>

      <hr />
      <button onClick={handleGoogleAuth}>Continue with Google</button>
    </div>
  );
};

export default AuthForm;

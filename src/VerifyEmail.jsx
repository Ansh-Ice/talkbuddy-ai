// src/VerifyEmail.jsx
import React, { useState, useEffect } from "react";
import { auth } from "./firebase";
import { sendEmailVerification, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";


const VerifyEmail = () => {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Poll every 3 seconds to check if email is verified
  useEffect(() => {
    const interval = setInterval(async () => {
      await auth.currentUser?.reload();
      if (auth.currentUser?.emailVerified) {
        clearInterval(interval);
        navigate("/", { replace: true });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [navigate]);

  async function resendEmail() {
    if (!auth.currentUser) return;
    setIsSending(true);

    try {
      await sendEmailVerification(auth.currentUser);
      alert("Verification email sent again!");
    } catch (err) {
      console.error("Resend email failed:", err);
      alert("Could not send verification email.");
    }

    setIsSending(false);
  }

  return (
    <div className="verify-page">
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            
            {/* MODAL HEADER */}
            <div className="modal-header">
              <h2>Email Verification Required</h2>
              <button className="icon-btn" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="modal-body">
              <p>
                A verification email has been sent to:  
                <strong>{auth.currentUser?.email}</strong>
              </p>
              <p>Please click the verification link in your inbox.</p>
            </div>
            
            {/* MODAL FOOTER */}
            <div className="modal-footer">
              <button
                className="primary"
                disabled={isSending}
                onClick={resendEmail}
              >
                {isSending ? "Sending…" : "Resend Email"}
              </button>

              <button className="secondary" onClick={() => setModalOpen(false)}>
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Main Page Content Behind Modal */}
      <div className="verify-content">
        <h1>Verify your email</h1>
        <p>Once verified, you will automatically be redirected.</p>

        <button
          className="primary"
          onClick={resendEmail}
          disabled={isSending}
        >
          {isSending ? "Resending…" : "Resend Verification Email"}
        </button>

        <button
            className="secondary"
            onClick={async () => {
            await signOut(auth);  // logout the unverified user
            navigate("/auth");    // redirect to signup/login page
            }}
        >
        Back to Signup
        </button>


      </div>
    </div>
  );
};

export default VerifyEmail;

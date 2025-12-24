import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import * as api from "./api";

export default function ConfirmDeletion() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletionData, setDeletionData] = useState(null);

  const token = searchParams.get("token");
  const uid = searchParams.get("uid");

  useEffect(() => {
    if (!token || !uid) {
      setError("Invalid deletion link. Missing required parameters.");
      setIsLoading(false);
      return;
    }

    verifyDeletionRequest();
  }, [token, uid]);

  const verifyDeletionRequest = async () => {
    try {
      const deletionDoc = await getDoc(doc(db, "deletionRequests", uid));
      
      if (!deletionDoc.exists()) {
        setError("Deletion request not found or has expired.");
        setIsLoading(false);
        return;
      }

      const data = deletionDoc.data();
      
      if (data.deletionToken !== token) {
        setError("Invalid deletion token.");
        setIsLoading(false);
        return;
      }

      if (data.status !== "pending") {
        setError("This deletion request has already been processed.");
        setIsLoading(false);
        return;
      }

      // Check if request is not too old (24 hours)
      const requestAge = Date.now() - data.requestedAt;
      if (requestAge > 24 * 60 * 60 * 1000) {
        setError("This deletion request has expired. Please request a new one.");
        setIsLoading(false);
        return;
      }

      setDeletionData(data);
      setIsLoading(false);
    } catch (error) {
      setError("Failed to verify deletion request: " + error.message);
      setIsLoading(false);
    }
  };

  const handleConfirmDeletion = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Call backend to confirm deletion and delete all user data
      const response = await api.confirmAccountDeletion(token, uid).then(data => ({
        ok: true,
        json: async () => data
      })).catch(error => ({
        ok: false,
        json: async () => ({ detail: error.message })
      }));

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to confirm deletion');
      }

      const result = await response.json();
      
      setSuccess("Account has been successfully deleted. All your data has been permanently removed.");
      
      // Redirect to home page after 3 seconds
      setTimeout(() => {
        navigate("/", { replace: true });
      }, 3000);

    } catch (error) {
      setError("Failed to delete account: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelDeletion = () => {
    navigate("/", { replace: true });
  };

  if (isLoading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Verifying Deletion Request</h2>
          <p>Please wait while we verify your deletion request...</p>
        </div>
      </div>
    );
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

        <h2 className="auth-title">Confirm Account Deletion</h2>
        
        {error && <div className="error" role="alert">{error}</div>}
        {success && <div className="success" role="alert">{success}</div>}

        {deletionData && !success && (
          <>
            <div className="deletion-info">
              <p>You are about to permanently delete the account for:</p>
              <div className="account-details">
                <p><strong>Email:</strong> {deletionData.email}</p>
                <p><strong>Display Name:</strong> {deletionData.displayName}</p>
                <p><strong>Requested:</strong> {new Date(deletionData.requestedAt).toLocaleString()}</p>
              </div>
            </div>

            <div className="deletion-warning">
              <h3>⚠️ Warning</h3>
              <p>This action cannot be undone. Deleting your account will permanently remove:</p>
              <ul>
                <li>Your profile information</li>
                <li>All chat history and conversations</li>
                <li>Your learning progress and statistics</li>
                <li>All associated data</li>
              </ul>
            </div>

            <div className="deletion-actions">
              <button 
                className="cancel-deletion-btn" 
                onClick={handleCancelDeletion}
                disabled={isLoading}
              >
                Cancel Deletion
              </button>
              
              <button 
                className="confirm-deletion-btn" 
                onClick={handleConfirmDeletion}
                disabled={isLoading}
              >
                {isLoading ? 'Deleting Account...' : 'Yes, Delete My Account'}
              </button>
            </div>
          </>
        )}

        {success && (
          <div className="deletion-success">
            <p>Your account has been successfully deleted.</p>
            <p>You will be redirected to the home page shortly.</p>
          </div>
        )}
      </div>
    </div>
  );
}
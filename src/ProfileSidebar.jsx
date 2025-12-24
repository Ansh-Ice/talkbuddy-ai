import React, { useState, useEffect } from "react";
import { 
  signOut, 
  updateProfile, 
  updatePassword,
  sendPasswordResetEmail
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";
import * as api from "./api";

export default function ProfileSidebar({ user, isOpen, onClose }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    displayName: user?.displayName || ""
  });

  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        displayName: user.displayName || ""
      });
    }
  }, [user, isOpen]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // Only allow updating displayName, not email
    if (name === "displayName") {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      // Only update display name since we're restricting email editing
      if (formData.displayName !== user.displayName) {
        await updateProfile(user, {
          displayName: formData.displayName
        });
        setSuccess("Display name updated");
      } else {
        setSuccess("No changes to save");
      }
      setIsEditing(false);
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Logout button removed from profile section as per request

const handleChangePassword = async () => {
  setIsLoading(true);
  setError("");
  setSuccess("");

  try {
    await sendPasswordResetEmail(auth, user.email);
    setSuccess("Password reset email sent! Check your inbox.");
  } catch (error) {
    setError("Failed to send password reset email: " + error.message);
  } finally {
    setIsLoading(false);
  }
};


  const handleDeleteProfile = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Store deletion request in database with unique token
      const deletionToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const confirmationUrl = `${window.location.origin}/confirm-deletion?token=${deletionToken}&uid=${user.uid}`;
      
      // Store in database first
      await setDoc(doc(db, "deletionRequests", user.uid), {
        userId: user.uid,
        email: user.email,
        displayName: user.displayName || "User",
        requestedAt: Date.now(),
        status: "pending",
        deletionToken: deletionToken,
        confirmationUrl: confirmationUrl
      });

      // Send email via backend API
      await api.sendDeletionEmail(
        user.uid,
        user.email,
        user.displayName || "User",
        deletionToken,
        confirmationUrl
      );

      setSuccess("Account deletion confirmation email sent! You will be logged out in 3 seconds. Please check your email and follow the link to confirm account deletion.");
      
      // Logout user after showing success message
      setTimeout(async () => {
        try {
          await signOut(auth);
          onClose();
        } catch (logoutError) {
          console.error("Logout error:", logoutError);
        }
      }, 3000); // 3 seconds to read the message
      
      setShowDeleteConfirm(false);
    } catch (error) {
      setError("Failed to send deletion confirmation email: " + error.message);
      setShowDeleteConfirm(false);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="sidebar-backdrop" onClick={onClose}></div>
      
      {/* Sidebar */}
      <div className="profile-sidebar">
        <div className="sidebar-header">
          <h2>Profile Settings</h2>
          <button className="close-btn" onClick={onClose}>
            <span>×</span>
          </button>
        </div>

        <div className="sidebar-content">
          {error && <div className="error" role="alert">{error}</div>}
          {success && <div className="success" role="alert">{success}</div>}

          <div className="profile-section">
            <div className="section-header">
              <h3>Personal Information</h3>
              {!isEditing && (
                <button 
                  className="edit-btn" 
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="profile-form">
                <div className="form-field">
                  <label htmlFor="displayName">Display Name</label>
                  <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    value={formData.displayName}
                    onChange={handleInputChange}
                    placeholder="Enter your display name"
                  />
                </div>

                <div className="form-actions">
                  <button 
                    type="button" 
                    className="cancel-btn" 
                    onClick={() => {
                      setIsEditing(false);
                      setError("");
                      setSuccess("");
                      setFormData({
                        displayName: user.displayName || ""
                      });
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="save-btn" 
                    disabled={isLoading}
                  >
                    {isLoading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="profile-info">
                <div className="info-item">
                  <label>Display Name:</label>
                  <span>{user.displayName || "Not set"}</span>
                </div>
                <div className="info-item">
                  <label>Email:</label>
                  <span>{user.email}</span>
                </div>
                <div className="info-item">
                  <label>Email Verified:</label>
                  <span className={user.emailVerified ? "verified" : "unverified"}>
                    {user.emailVerified ? "✓ Verified" : "✗ Not verified"}
                  </span>
                </div>
                <div className="info-item">
                  <label>Account Created:</label>
                  <span>{formatDate(user.metadata.creationTime)}</span>
                </div>
                <div className="info-item">
                  <label>Last Sign In:</label>
                  <span>{formatDate(user.metadata.lastSignInTime)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="profile-section">
            <div className="section-header">
              <h3>Account Actions</h3>
            </div>
            
            <div className="account-actions">
              <button 
                className="password-btn" 
                onClick={handleChangePassword}
                disabled={isLoading}
              >
                Change Password
              </button>

              <button 
                className="delete-btn" 
                onClick={handleDeleteProfile}
                disabled={isLoading}
              >
                {showDeleteConfirm ? 'Confirm Delete' : 'Delete Profile'}
              </button>
            </div>

            {showDeleteConfirm && (
              <div className="delete-warning">
                <p><strong>Warning:</strong> This will send a confirmation email to your registered email address and immediately log you out. You will need to confirm the deletion by clicking the link in the email to permanently delete your account and all associated data.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
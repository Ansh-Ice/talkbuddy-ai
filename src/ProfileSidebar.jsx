import React, { useState, useEffect } from "react";
import { 
  signOut, 
  updateProfile, 
  updateEmail, 
  updatePassword,
  sendPasswordResetEmail
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";

export default function ProfileSidebar({ user, isOpen, onClose }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [showChatHistory, setShowChatHistory] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    displayName: user?.displayName || "",
    email: user?.email || ""
  });

  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        displayName: user.displayName || "",
        email: user.email || ""
      });
      loadChatHistory();
    }
  }, [user, isOpen]);

  const loadChatHistory = async () => {
    try {
      const chatHistoryRef = collection(db, "chatHistory");
      const q = query(chatHistoryRef, where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const history = [];
      querySnapshot.forEach((doc) => {
        history.push({ id: doc.id, ...doc.data() });
      });
      setChatHistory(history.sort((a, b) => b.timestamp - a.timestamp));
    } catch (error) {
      console.error("Error loading chat history:", error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const updates = [];

      // Update display name
      if (formData.displayName !== user.displayName) {
        await updateProfile(user, {
          displayName: formData.displayName
        });
        updates.push("Display name updated");
      }

      // Update email
      if (formData.email !== user.email) {
        await updateEmail(user, formData.email);
        updates.push("Email updated");
      }

      if (updates.length > 0) {
        setSuccess(updates.join(", "));
        setIsEditing(false);
      } else {
        setSuccess("No changes to save");
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onClose();
    } catch (error) {
      setError("Failed to logout: " + error.message);
    }
  };

  const handleChangePassword = async () => {
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      // Send password reset email via backend API
      const emailResponse = await fetch('http://localhost:8000/send-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email
        })
      });

      if (!emailResponse.ok) {
        throw new Error('Failed to send password reset email');
      }

      setSuccess("Password reset email sent! Please check your email and follow the link to change your password.");
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
      const emailResponse = await fetch('http://localhost:8000/send-deletion-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          email: user.email,
          displayName: user.displayName || "User",
          deletionToken: deletionToken,
          confirmationUrl: confirmationUrl
        })
      });

      if (!emailResponse.ok) {
        throw new Error('Failed to send deletion email');
      }

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

  const clearChatHistory = async () => {
    try {
      const chatHistoryRef = collection(db, "chatHistory");
      const q = query(chatHistoryRef, where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      
      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      setChatHistory([]);
      setSuccess("Chat history cleared successfully");
    } catch (error) {
      setError("Failed to clear chat history: " + error.message);
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

                <div className="form-field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter your email"
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
                        displayName: user.displayName || "",
                        email: user.email || ""
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
              <h3>Chat History</h3>
              <div className="section-actions">
                <button 
                  className="toggle-btn" 
                  onClick={() => setShowChatHistory(!showChatHistory)}
                >
                  {showChatHistory ? 'Hide' : 'Show'}
                </button>
                {chatHistory.length > 0 && (
                  <button 
                    className="clear-btn" 
                    onClick={clearChatHistory}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {showChatHistory && (
              <div className="chat-history">
                {chatHistory.length === 0 ? (
                  <p className="no-data">No chat history found.</p>
                ) : (
                  <div className="chat-list">
                    {chatHistory.map((chat) => (
                      <div key={chat.id} className="chat-item">
                        <div className="chat-header">
                          <span className="chat-date">{formatDate(chat.timestamp)}</span>
                          <span className="chat-messages-count">
                            {chat.messages?.length || 0} messages
                          </span>
                        </div>
                        {chat.title && (
                          <div className="chat-title">{chat.title}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
                className="logout-btn" 
                onClick={handleLogout}
                disabled={isLoading}
              >
                Logout
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

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, orderBy, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { ArrowLeft, MessageSquare, Calendar, Volume2, Mic, Play } from "lucide-react";
import "./ChatHistory.css";

const ChatHistory = ({ user }) => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchSessions();
  }, [user, navigate]);

  const fetchSessions = async () => {
    try {
      const sessionsRef = collection(db, "voice_sessions");
      
      // Try simple query first - just get user's sessions
      const q = query(
        sessionsRef,
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      
      const snapshot = await getDocs(q);
      const sessionList = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(session => session.status === "completed"); // Filter completed in memory
      
      console.log('Fetched sessions:', sessionList);
      setSessions(sessionList);
      if (sessionList.length > 0) {
        setSelectedSession(sessionList[0]);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
      // Fallback - try without orderBy if composite index doesn't exist
      try {
        const sessionsRef = collection(db, "voice_sessions");
        const q = query(
          sessionsRef,
          where("userId", "==", user.uid)
        );
        const snapshot = await getDocs(q);
        const sessionList = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          .filter(session => session.status === "completed")
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
            const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
            return bTime - aTime;
          });
        
        console.log('Fetched sessions (fallback):', sessionList);
        setSessions(sessionList);
        if (sessionList.length > 0) {
          setSelectedSession(sessionList[0]);
        }
      } catch (fallbackErr) {
        console.error('Fallback query also failed:', fallbackErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSessionClick = (session) => {
    setSelectedSession(session);
    setShowSummary(false);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Recent';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (err) {
      console.error('Error formatting date:', err);
      return 'Recent';
    }
  };

  const playAudio = (text) => {
    if (!text) return;
    
    // Use Web Speech API to synthesize and play the text
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1;
      utterance.pitch = 1;
      
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="chat-history-page">
      <header className="chat-history-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate("/")}>
            <ArrowLeft size={20} />
            Back to Home
          </button>
        </div>
        <h1>Chat History</h1>
        <div className="header-right">
          <button className="new-chat-btn" onClick={() => navigate("/voice-practice")}>
            <Mic size={18} />
            New Voice Chat
          </button>
        </div>
      </header>

      <div className="chat-history-container">
        {/* Left Sidebar - Session List */}
        <aside className="sessions-sidebar">
          <div className="sidebar-header">
            <h2>Your Conversations</h2>
            <span className="session-count">{sessions.length} sessions</span>
          </div>
          
          {loading ? (
            <div className="loading-state">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="empty-state">
              <MessageSquare size={48} />
              <p>No chat history yet</p>
              <button onClick={() => navigate("/voice-practice")}>
                Start Your First Session
              </button>
            </div>
          ) : (
            <div className="sessions-list">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${selectedSession?.id === session.id ? 'active' : ''}`}
                  onClick={() => handleSessionClick(session)}
                >
                  <div className="session-item-header">
                    <h3>{session.title || "Voice Practice Session"}</h3>
                    <span className="session-date">
                      <Calendar size={14} />
                      {formatDate(session.createdAt)}
                    </span>
                  </div>
                  <p className="session-preview">
                    {session.messages && session.messages.length > 0 
                      ? (session.messages.find(m => m.role === 'user')?.content?.slice(0, 60) || "No messages")
                      : "No messages"}...
                  </p>
                  <div className="session-stats">
                    <span>{session.messages?.length || 0} messages</span>
                    {session.summary && (
                      <span className="has-summary">✓ Summary</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Right Side - Chat Viewer */}
        <main className="chat-viewer">
          {!selectedSession ? (
            <div className="no-selection">
              <MessageSquare size={64} />
              <p>Select a conversation to view</p>
            </div>
          ) : showSummary && selectedSession.summary ? (
            <div className="summary-view">
              <div className="summary-header">
                <h2>Session Summary</h2>
                <button className="close-summary-btn" onClick={() => setShowSummary(false)}>
                  View Messages
                </button>
              </div>

              <div className="summary-content">
                <div className="summary-section">
                  <h3>Overall Feedback</h3>
                  <p className="summary-feedback">{selectedSession.summary.final_feedback}</p>
                </div>

                {selectedSession.summary.corrections && selectedSession.summary.corrections.length > 0 && (
                  <div className="summary-section">
                    <h3>Mistakes & Corrections</h3>
                    <ul className="corrections-list">
                      {selectedSession.summary.corrections.map((correction, idx) => (
                        <li key={idx}>
                          <div className="correction-item">
                            <span className="mistake">❌ {correction.original}</span>
                            <span className="arrow">→</span>
                            <span className="correction">✅ {correction.corrected}</span>
                          </div>
                          {correction.explanation && (
                            <p className="explanation">{correction.explanation}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="summary-section">
                  <h3>Improvement Tips</h3>
                  <p className="tip">💡 {selectedSession.summary.tips}</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="chat-viewer-header">
                <div>
                  <h2>{selectedSession.title || "Voice Practice Session"}</h2>
                  <span className="chat-date">{formatDate(selectedSession.createdAt)}</span>
                </div>
                {selectedSession.summary && (
                  <button className="view-summary-btn" onClick={() => setShowSummary(true)}>
                    View Summary
                  </button>
                )}
              </div>

              <div className="messages-container">
                {selectedSession.messages && selectedSession.messages.length > 0 ? (
                  selectedSession.messages.map((message, idx) => (
                    <div key={idx} className={`message-bubble ${message.role}`}>
                      <div className="message-header">
                        <span className="message-role">
                          {message.role === 'user' ? 'You' : 'TalkBuddy'}
                        </span>
                        <span className="message-time">
                          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          }) : ''}
                        </span>
                      </div>
                      <p className="message-content">{message.content}</p>
                      {message.role === 'assistant' && (
                        <button 
                          className="audio-replay-btn" 
                          onClick={() => playAudio(message.content)}
                          title="Play audio"
                        >
                          <Play size={14} />
                          Listen
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="no-messages">No messages in this session</div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default ChatHistory;

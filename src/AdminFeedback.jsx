import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, orderBy, query, where, deleteDoc, doc } from 'firebase/firestore';
import { 
  FileText, 
  Filter, 
  Calendar, 
  Star, 
  User, 
  Mail, 
  MessageSquare, 
  Trash2,
  Search
} from 'lucide-react';

const AdminFeedback = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: 'All',
    dateRange: 'All',
    search: ''
  });
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState('desc');

  // Load feedback data
  useEffect(() => {
    const loadFeedback = async () => {
      try {
        let q = query(collection(db, 'feedback'), orderBy(sortBy, sortOrder));
        const querySnapshot = await getDocs(q);
        
        const feedbackData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
        }));
        
        setFeedbacks(feedbackData);
      } catch (error) {
        console.error('Error loading feedback:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFeedback();
  }, [sortBy, sortOrder]);

  // Filter feedback based on filters
  const filteredFeedback = feedbacks.filter(fb => {
    // Type filter
    if (filters.type !== 'All' && fb.feedback_type !== filters.type) {
      return false;
    }

    // Date range filter
    if (filters.dateRange !== 'All') {
      const now = new Date();
      const feedbackDate = new Date(fb.timestamp);
      
      if (filters.dateRange === 'Today' && 
          feedbackDate.toDateString() !== now.toDateString()) {
        return false;
      }
      
      if (filters.dateRange === 'This Week' && 
          feedbackDate < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) {
        return false;
      }
      
      if (filters.dateRange === 'This Month' && 
          feedbackDate < new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())) {
        return false;
      }
    }

    // Search filter
    if (filters.search && 
        !fb.message.toLowerCase().includes(filters.search.toLowerCase()) &&
        !fb.name.toLowerCase().includes(filters.search.toLowerCase()) &&
        !fb.email.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }

    return true;
  });

  // Delete feedback
  const handleDelete = async (feedbackId) => {
    if (window.confirm('Are you sure you want to delete this feedback?')) {
      try {
        await deleteDoc(doc(db, 'feedback', feedbackId));
        setFeedbacks(prev => prev.filter(fb => fb.id !== feedbackId));
      } catch (error) {
        console.error('Error deleting feedback:', error);
      }
    }
  };

  // Feedback types for filter
  const feedbackTypes = [
    'All',
    'Bug / Issue',
    'Feature Request',
    'UI/UX Feedback',
    'General Feedback'
  ];

  // Date ranges for filter
  const dateRanges = [
    'All',
    'Today',
    'This Week',
    'This Month'
  ];

  // Sort options
  const sortOptions = [
    { value: 'timestamp', label: 'Date' },
    { value: 'name', label: 'Name' },
    { value: 'feedback_type', label: 'Type' },
    { value: 'rating', label: 'Rating' }
  ];

  if (loading) {
    return (
      <div className="admin-feedback">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading feedback...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-feedback">
      <div className="section-header">
        <div>
          <h2>Feedback Management</h2>
          <p>View and manage user feedback submissions</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="feedback-filters">
        <div className="filter-group">
          <label>
            <Filter size={16} />
            Type
          </label>
          <select
            value={filters.type}
            onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
          >
            {feedbackTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>
            <Calendar size={16} />
            Date Range
          </label>
          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
          >
            {dateRanges.map(range => (
              <option key={range} value={range}>{range}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>
            <Search size={16} />
            Sort By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {sortOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>
            Order
          </label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        <div className="search-group">
          <label>
            <Search size={16} />
            Search
          </label>
          <input
            type="text"
            placeholder="Search feedback..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>
      </div>

      {/* Feedback List */}
      <div className="feedback-list">
        {filteredFeedback.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <h3>No Feedback Found</h3>
            <p>No feedback matches your current filters.</p>
          </div>
        ) : (
          <div className="feedback-grid">
            {filteredFeedback.map((feedback) => (
              <div key={feedback.id} className="feedback-card">
                <div className="feedback-header">
                  <div className="feedback-type">
                    <span className="type-badge">{feedback.feedback_type}</span>
                    <span className="feedback-date">
                      {feedback.timestamp.toLocaleDateString()} {feedback.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <button 
                    className="delete-btn"
                    onClick={() => handleDelete(feedback.id)}
                    title="Delete feedback"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="feedback-user">
                  <div className="user-info">
                    <User size={16} />
                    <span>{feedback.name}</span>
                  </div>
                  <div className="email-info">
                    <Mail size={16} />
                    <span>{feedback.email}</span>
                  </div>
                </div>

                <div className="feedback-content">
                  <div className="message">
                    <MessageSquare size={16} />
                    <p>{feedback.message}</p>
                  </div>
                  
                  {feedback.rating && (
                    <div className="rating">
                      <Star size={16} fill="#fbbf24" color="#fbbf24" />
                      <span>{feedback.rating} / 5</span>
                    </div>
                  )}
                </div>

                {feedback.user_id && (
                  <div className="user-id">
                    <small>User ID: {feedback.user_id}</small>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="feedback-stats">
        <div className="stat-card">
          <h4>Total Feedback</h4>
          <p>{feedbacks.length}</p>
        </div>
        <div className="stat-card">
          <h4>Filtered Results</h4>
          <p>{filteredFeedback.length}</p>
        </div>
        <div className="stat-card">
          <h4>Bug Reports</h4>
          <p>{feedbacks.filter(fb => fb.feedback_type === 'Bug / Issue').length}</p>
        </div>
        <div className="stat-card">
          <h4>Avg Rating</h4>
          <p>{feedbacks.length ? (feedbacks.reduce((sum, fb) => sum + (fb.rating || 0), 0) / feedbacks.length).toFixed(1) : 'N/A'}</p>
        </div>
      </div>
    </div>
  );
};

export default AdminFeedback;
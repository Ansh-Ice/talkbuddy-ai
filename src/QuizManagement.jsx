import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X, 
  Search,
  Filter,
  MoreVertical
} from 'lucide-react';
import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc,
  query,
  orderBy 
} from 'firebase/firestore';

const QuizManagement = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('all');

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const questionsSnapshot = await getDocs(
        query(collection(db, 'questions'))
      );
      const questionsData = questionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setQuestions(questionsData);
    } catch (error) {
      console.error('Error loading questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = async (questionData) => {
    try {
      await addDoc(collection(db, 'questions'), {
        ...questionData,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setShowAddForm(false);
      loadQuestions();
    } catch (error) {
      console.error('Error adding question:', error);
    }
  };

  const handleEditQuestion = async (questionId, updatedData) => {
    try {
      await updateDoc(doc(db, 'questions', questionId), {
        ...updatedData,
        updatedAt: Date.now()
      });
      setEditingQuestion(null);
      loadQuestions();
    } catch (error) {
      console.error('Error updating question:', error);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      try {
        await deleteDoc(doc(db, 'questions', questionId));
        loadQuestions();
      } catch (error) {
        console.error('Error deleting question:', error);
      }
    }
  };

  const filteredQuestions = questions.filter(question => {
    const matchesSearch = question.question.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDifficulty = filterDifficulty === 'all' || question.difficulty === filterDifficulty;
    return matchesSearch && matchesDifficulty;
  });

  const QuestionCard = ({ question, isEditing }) => (
    <div className="question-card">
      <div className="question-header">
        <div className="question-meta">
          <span className={`difficulty-badge ${question.difficulty}`}>
            {question.difficulty}
          </span>
          <span className="category-badge">{question.category}</span>
        </div>
        <div className="question-actions">
          <button
            className="action-btn edit"
            onClick={() => setEditingQuestion(question.id)}
          >
            <Edit size={16} />
          </button>
          <button
            className="action-btn delete"
            onClick={() => handleDeleteQuestion(question.id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      
      <div className="question-content">
        <h4>{question.question}</h4>
        <div className="options-list">
          {question.options.map((option, index) => (
            <div
              key={index}
              className={`option-item ${index === question.correctAnswer ? 'correct' : ''}`}
            >
              <span className="option-label">{String.fromCharCode(65 + index)}.</span>
              <span className="option-text">{option}</span>
              {index === question.correctAnswer && (
                <span className="correct-indicator">✓</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const EditQuestionForm = ({ question }) => {
    const [editData, setEditData] = useState({
      question: question.question,
      options: [...question.options],
      correctAnswer: question.correctAnswer,
      difficulty: question.difficulty,
      category: question.category
    });

    const handleOptionChange = (index, value) => {
      const newOptions = [...editData.options];
      newOptions[index] = value;
      setEditData({ ...editData, options: newOptions });
    };

    const handleSubmit = (e) => {
      e.preventDefault();
      handleEditQuestion(question.id, editData);
    };

    return (
      <div className="edit-question-form">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Question</label>
            <textarea
              value={editData.question}
              onChange={(e) => setEditData({ ...editData, question: e.target.value })}
              required
              style={{ color: 'black' }}
            />
          </div>

          <div className="form-group">
            <label>Options</label>
            {editData.options.map((option, index) => (
              <div key={index} className="option-input-group">
                <span className="option-label">{String.fromCharCode(65 + index)}.</span>
                <input
                  type="text"
                  value={option}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                  required
                  style={{ color: 'black' }}
                />
                <input
                  type="radio"
                  name="correctAnswer"
                  checked={editData.correctAnswer === index}
                  onChange={() => setEditData({ ...editData, correctAnswer: index })}
                />
                <label>Correct</label>
              </div>
            ))}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Difficulty</label>
              <select
                value={editData.difficulty}
                onChange={(e) => setEditData({ ...editData, difficulty: e.target.value })}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="form-group">
              <label>Category</label>
              <input
                type="text"
                value={editData.category}
                onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                placeholder="Category"
                style={{ color: 'black' }}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="save-btn">
              <Save size={16} />
              Save Changes
            </button>
            <button
              type="button"
              className="cancel-btn"
              onClick={() => setEditingQuestion(null)}
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  };

  const AddQuestionForm = () => {
    // Local state so typing doesn't reset focus
    const [localQuestion, setLocalQuestion] = useState({
      question: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
      difficulty: 'medium',
      category: 'general'
    });

    const handleOptionChange = (index, value) => {
      const newOptions = [...localQuestion.options];
      newOptions[index] = value;
      setLocalQuestion({ ...localQuestion, options: newOptions });
    };

    const handleSubmit = (e) => {
      e.preventDefault();
      handleAddQuestion(localQuestion);
    };

    return (
      <div className="add-question-form">
        <div className="form-header">
          <h3>Add New Question</h3>
          <button
            className="close-btn"
            onClick={() => setShowAddForm(false)}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Question</label>
            <textarea
              value={localQuestion.question}
              onChange={(e) => setLocalQuestion({ ...localQuestion, question: e.target.value })}
              placeholder="Enter the question..."
              required
            />
          </div>

          <div className="form-group">
            <label>Options</label>
            {localQuestion.options.map((option, index) => (
              <div key={index} className="option-input-group">
                <span className="option-label">{String.fromCharCode(65 + index)}.</span>
                <input
                  type="text"
                  value={option}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                  required
                  style={{ color: 'black' }}
                />
                <input
                  type="radio"
                  name="correctAnswer"
                  checked={localQuestion.correctAnswer === index}
                  onChange={() => setLocalQuestion({ ...localQuestion, correctAnswer: index })}
                />
                <label>Correct</label>
              </div>
            ))}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Difficulty</label>
              <select
                value={localQuestion.difficulty}
                onChange={(e) => setLocalQuestion({ ...localQuestion, difficulty: e.target.value })}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="form-group">
              <label>Category</label>
              <input
                type="text"
                value={localQuestion.category}
                onChange={(e) => setLocalQuestion({ ...localQuestion, category: e.target.value })}
                placeholder="Category"
                style={{ color: 'black' }}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="add-btn">
              <Plus size={16} />
              Add Question
            </button>
          </div>
        </form>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="quiz-management-loading">
        <div className="loading-spinner"></div>
        <p>Loading quiz questions...</p>
      </div>
    );
  }

  return (
    <div className="quiz-management">
      <div className="quiz-header">
        <div className="header-content">
          <h2>Quiz Management</h2>
          <p>Manage quiz questions and options</p>
        </div>
        <button
          className="add-question-btn"
          onClick={() => setShowAddForm(true)}
        >
          <Plus size={20} />
          Add Question
        </button>
      </div>

      {/* Filters and Search */}
      <div className="quiz-filters">
        <div className="search-box">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="filter-select">
          <Filter size={20} />
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      {/* Add Question Form */}
      {showAddForm && <AddQuestionForm />}

      {/* Questions List */}
      <div className="questions-list">
        {filteredQuestions.length === 0 ? (
          <div className="no-questions">
            <p>No questions found matching your criteria.</p>
          </div>
        ) : (
          filteredQuestions.map(question => (
            <div key={question.id}>
              {editingQuestion === question.id ? (
                <EditQuestionForm question={question} />
              ) : (
                <QuestionCard question={question} />
              )}
            </div>
          ))
        )}
      </div>

      {/* Stats */}
      <div className="quiz-stats">
        <div className="stat-item">
          <h4>Total Questions</h4>
          <p>{questions.length}</p>
        </div>
        <div className="stat-item">
          <h4>Filtered Results</h4>
          <p>{filteredQuestions.length}</p>
        </div>
        <div className="stat-item">
          <h4>Categories</h4>
          <p>{new Set(questions.map(q => q.category)).size}</p>
        </div>
      </div>
    </div>
  );
};

export default QuizManagement;

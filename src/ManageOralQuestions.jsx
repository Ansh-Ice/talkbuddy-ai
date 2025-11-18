import React, { useEffect, useState } from 'react';
import { FileText, RefreshCcw, Edit3, Save, X, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, orderBy, query, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const ManageOralQuestions = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [formState, setFormState] = useState({ prompt: '', type: '', skill_tested: '' });
  const [status, setStatus] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addForm, setAddForm] = useState({
    prompt: '',
    type: '',
    skill_tested: ''
  });

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const oralQuery = query(collection(db, 'OralQuestions'), orderBy('prompt'));
      const snapshot = await getDocs(oralQuery);
      const data = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setQuestions(data);
    } catch (error) {
      console.error('Failed to load oral questions', error);
      setStatus({ type: 'error', message: 'Unable to load oral questions. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (question) => {
  setEditingId(question.id);
  setFormState({
    prompt: question.prompt || '',
    type: question.type || '',
    skill_tested: Array.isArray(question.skill_tested)
      ? question.skill_tested.join(", ") 
      : question.skill_tested || ''
  });
  setStatus(null);
};


  const cancelEditing = () => {
    setEditingId(null);
    setFormState({ prompt: '', type: '', skill_tested: '' });
  };

const handleUpdate = async (event) => {
  event.preventDefault();

  if (!formState.prompt.trim() || !formState.type.trim() || !formState.skill_tested.trim()) {
    setStatus({ type: 'error', message: 'Prompt, type, and skill tested are required.' });
    return;
  }

  try {
    const skillArray = formState.skill_tested
      .split(',')
      .map(item => item.trim())
      .filter(item => item !== '');

    await updateDoc(doc(db, 'OralQuestions', editingId), {
      prompt: formState.prompt.trim(),
      type: formState.type.trim(),
      skill_tested: skillArray,     // <-- FIXED
      updatedAt: serverTimestamp()
    });

    setStatus({ type: 'success', message: 'Question updated successfully.' });
    setEditingId(null);
    setFormState({ prompt: '', type: '', skill_tested: '' });
    await loadQuestions();

  } catch (error) {
    console.error('Failed to update oral question', error);
    setStatus({ type: 'error', message: 'Could not update the question. Please try again.' });
  }
};


  const handleAddQuestion = async (event) => {
    event.preventDefault();
    if (!addForm.prompt.trim() || !addForm.type.trim() || !addForm.skill_tested.trim()) {
      setStatus({ type: 'error', message: 'Prompt, type, and skill tested are required.' });
      return;
    }
    try {
      setSaving(true);
      await addDoc(collection(db, 'OralQuestions'), {
      prompt: addForm.prompt.trim(),
      type: addForm.type.trim(),
      skill_tested: addForm.skill_tested
      .split(',')
      .map(item => item.trim())
      .filter(item => item !== ''),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
      });

      setStatus({ type: 'success', message: 'New oral question added.' });
      setAddForm({ prompt: '', type: '', skill_tested: '' });
      setShowAddForm(false);
      await loadQuestions();
    } catch (error) {
      console.error('Failed to add oral question', error);
      setStatus({ type: 'error', message: 'Unable to add question. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Delete this oral question? This action cannot be undone.')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'OralQuestions', questionId));
      if (editingId === questionId) {
        cancelEditing();
      }
      setStatus({ type: 'success', message: 'Question removed successfully.' });
      await loadQuestions();
    } catch (error) {
      console.error('Failed to delete oral question', error);
      setStatus({ type: 'error', message: 'Unable to delete question. Please try again.' });
    }
  };

  if (loading) {
    return (
      <div className="oral-management">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading oral questions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="oral-management">
      <div className="section-header">
        <div>
          <h2>Manage Oral Questions</h2>
          <p>Update prompts and question types stored in the `OralQuestions` collection.</p>
        </div>
        <div className="section-actions">
          <button className="refresh-btn" onClick={loadQuestions}>
            <RefreshCcw size={18} />
            Refresh
          </button>
          <button className="primary-btn" onClick={() => setShowAddForm((prev) => !prev)}>
            <Plus size={18} />
            {showAddForm ? 'Close Form' : 'Add Oral Question'}
          </button>
        </div>
      </div>

      {status && (
        <div className={`status-banner ${status.type}`}>
          <AlertCircle size={18} />
          <span>{status.message}</span>
        </div>
      )}

      {showAddForm && (
        <div className="oral-add-form">
          <div className="form-header">
            <h3>New Oral Question</h3>
            <button className="close-btn" onClick={() => setShowAddForm(false)}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleAddQuestion}>
            <div className="form-group">
              <label>Question Prompt</label>
              <textarea
                value={addForm.prompt}
                onChange={(e) => setAddForm({ ...addForm, prompt: e.target.value })}
                placeholder="Enter the question prompt..."
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Question Type</label>
                <input
                  type="text"
                  value={addForm.type}
                  onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
                  placeholder="e.g. fluency, pronunciation"
                  required
                  style={{ color: "black" }}
                />
              </div>
              <div className="form-group">
                <label>Skill Tested</label>
                <input
                  type="text"
                  value={addForm.skill_tested}
                  onChange={(e) => setAddForm({ ...addForm, skill_tested: e.target.value })}
                  placeholder="e.g. communication"
                  required
                  style={{ color: "black" }}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="save-btn" disabled={saving}>
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Question'}
              </button>
              <button type="button" className="cancel-btn" onClick={() => setShowAddForm(false)}>
                <X size={16} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {questions.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <p>No oral questions found. Add some questions to the `OralQuestions` collection.</p>
        </div>
      ) : (
        <div className="oral-question-list">
          {questions.map((question) => (
            <div key={question.id} className="oral-card">
              {editingId === question.id ? (
                <form onSubmit={handleUpdate} className="oral-edit-form">
                  <div className="form-group">
                    <label>Question Prompt</label>
                    <textarea
                      value={formState.prompt}
                      onChange={(e) => setFormState({ ...formState, prompt: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Question Type</label>
                      <input
                        type="text"
                        value={formState.type}
                        onChange={(e) => setFormState({ ...formState, type: e.target.value })}
                        placeholder="e.g. fluency, pronunciation"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Skill Tested</label>
                      <input
                        type="text"
                        value={formState.skill_tested}
                        onChange={(e) => setFormState({ ...formState, skill_tested: e.target.value })}
                        placeholder="e.g. communication"
                        required
                      />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="save-btn">
                      <Save size={16} />
                      Save
                    </button>
                    <button type="button" className="cancel-btn" onClick={cancelEditing}>
                      <X size={16} />
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="oral-card-header">
                    <div>
                      <p className="oral-card-label">Question</p>
                      <h4>{question.prompt}</h4>
                    </div>
                    <div className="oral-card-actions">
                      <button className="action-btn edit" onClick={() => startEditing(question)}>
                        <Edit3 size={16} />
                        Edit
                      </button>
                      <button
                        className="action-btn delete"
                        type="button"
                        onClick={() => handleDeleteQuestion(question.id)}
                      >
                        <Trash2 size={16} />
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="oral-card-type">
                    <span>Type</span>
                    <strong>{question.type || 'Not set'}</strong>
                  </div>
                  <div className="oral-card-type secondary">
                    <span>Skill Tested</span>
                    <strong>
                      {Array.isArray(question.skill_tested)
                      ? question.skill_tested.join(", ")
                      : question.skill_tested || "Not captured"}
                    </strong>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ManageOralQuestions;


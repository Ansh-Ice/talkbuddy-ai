import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';

const AdminAccountManager = () => {
  const [session, setSession] = useState(null);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [passwordStatus, setPasswordStatus] = useState(null);
  const [adminStatus, setAdminStatus] = useState(null);
  const [changeForm, setChangeForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [addForm, setAddForm] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('adminSession');
    if (stored) {
      try {
        setSession(JSON.parse(stored));
      } catch (error) {
        console.error('Failed to parse admin session', error);
      }
    }
  }, []);

  useEffect(() => {
    const loadCurrentAdmin = async () => {
      if (!session) return;
      try {
        const normalizedUsername = (session.username || '').trim().toLowerCase();
        let adminDocRef = session.docId ? doc(db, 'admin', session.docId) : null;
        let adminSnap = adminDocRef ? await getDoc(adminDocRef) : null;

        if (!adminSnap || !adminSnap.exists()) {
          const adminSnapshot = await getDocs(collection(db, 'admin'));
          const fallbackDoc = adminSnapshot.docs.find(docSnap => {
            const candidate = (docSnap.data().username || docSnap.id || '').trim().toLowerCase();
            return candidate === normalizedUsername;
          });
          if (fallbackDoc) {
            adminDocRef = doc(db, 'admin', fallbackDoc.id);
            adminSnap = fallbackDoc;
            if (!session.docId) {
              const updatedSession = { ...session, docId: fallbackDoc.id };
              localStorage.setItem('adminSession', JSON.stringify(updatedSession));
              setSession(updatedSession);
            }
          }
        }

        if (adminSnap && adminSnap.exists()) {
          setCurrentAdmin({ id: adminDocRef.id, ...adminSnap.data() });
        } else {
          setPasswordStatus({ type: 'error', message: 'Active admin record could not be located.' });
        }
      } catch (error) {
        console.error('Unable to load admin record', error);
        setPasswordStatus({ type: 'error', message: 'Failed to load admin data. Please refresh.' });
      }
    };

    loadCurrentAdmin();
  }, [session]);

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (!currentAdmin) {
      setPasswordStatus({ type: 'error', message: 'No admin record found for this session.' });
      return;
    }
    if (changeForm.newPassword !== changeForm.confirmNewPassword) {
      setPasswordStatus({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    if (changeForm.newPassword.trim().length < 6) {
      setPasswordStatus({ type: 'error', message: 'New password must be at least 6 characters.' });
      return;
    }
    if (changeForm.oldPassword !== (currentAdmin.password || '')) {
      setPasswordStatus({ type: 'error', message: 'Old password is incorrect.' });
      return;
    }
    if (changeForm.oldPassword === changeForm.newPassword) {
      setPasswordStatus({ type: 'error', message: 'New password must be different from the old password.' });
      return;
    }

    try {
      setChangingPassword(true);
      await updateDoc(doc(db, 'admin', currentAdmin.id), {
        password: changeForm.newPassword.trim(),
        updatedAt: serverTimestamp()
      });
      setCurrentAdmin(prev => prev ? { ...prev, password: changeForm.newPassword.trim() } : prev);
      setPasswordStatus({ type: 'success', message: 'Password updated successfully.' });
      setChangeForm({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
    } catch (error) {
      console.error('Failed to update admin password', error);
      setPasswordStatus({ type: 'error', message: 'Could not update password. Please try again.' });
    } finally {
      setChangingPassword(false);
    }
  };

  const validateNewAdmin = async (username) => {
    const normalized = username.trim().toLowerCase();
    const adminSnapshot = await getDocs(collection(db, 'admin'));
    const existsInAdmin = adminSnapshot.docs.some(docSnap => {
      const candidate = (docSnap.data().username || docSnap.id || '').trim().toLowerCase();
      return candidate === normalized;
    });
    if (existsInAdmin) {
      throw new Error('An admin with this username already exists.');
    }

    const registeredMatch = await getDocs(
      query(collection(db, 'registeredEmails'), where('email', '==', username.trim()))
    );
    if (!registeredMatch.empty) {
      throw new Error('Username conflicts with an existing registered user email.');
    }
  };

  const handleAddAdmin = async (event) => {
    event.preventDefault();
    setAdminStatus(null);
    const username = addForm.username.trim();
    if (!username) {
      setAdminStatus({ type: 'error', message: 'Username is required.' });
      return;
    }
    if (username.includes('@')) {
      setAdminStatus({ type: 'error', message: 'Username cannot contain @ or look like an email.' });
      return;
    }
    if (addForm.password !== addForm.confirmPassword) {
      setAdminStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }
    if (addForm.password.trim().length < 6) {
      setAdminStatus({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }

    try {
      setCreatingAdmin(true);
      await validateNewAdmin(username);
      const normalized = username.toLowerCase();
      const docId = normalized === 'config' ? `config_${Date.now()}` : normalized;
      await setDoc(doc(db, 'admin', docId), {
        username,
        password: addForm.password.trim(),
        seededAt: serverTimestamp(),
        createdBy: session?.username || 'unknown'
      });
      setAdminStatus({ type: 'success', message: `Admin "${username}" added successfully.` });
      setAddForm({ username: '', password: '', confirmPassword: '' });
    } catch (error) {
      console.error('Failed to add admin', error);
      setAdminStatus({ type: 'error', message: error.message || 'Could not create admin.' });
    } finally {
      setCreatingAdmin(false);
    }
  };

  return (
    <div className="admin-account-manager">
      <div className="section-header">
        <div>
          <h2>Admin Account Controls</h2>
          <p>Update your credentials and create additional admin accounts safely.</p>
        </div>
      </div>

      <div className="account-sections">
        <section className="account-section">
          <header>
            <KeyRound size={24} />
            <div>
              <h3>Change Password</h3>
              <p>Validate using your old password before setting a new one.</p>
            </div>
          </header>

          {passwordStatus && (
            <div className={`status-banner ${passwordStatus.type}`}>
              {passwordStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{passwordStatus.message}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="account-form">
            <label>
              Old password
              <input
                type="password"
                value={changeForm.oldPassword}
                onChange={(e) => setChangeForm({ ...changeForm, oldPassword: e.target.value })}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={changeForm.newPassword}
                onChange={(e) => setChangeForm({ ...changeForm, newPassword: e.target.value })}
                minLength={6}
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={changeForm.confirmNewPassword}
                onChange={(e) => setChangeForm({ ...changeForm, confirmNewPassword: e.target.value })}
                minLength={6}
                required
              />
            </label>
            <button type="submit" className="primary-btn" disabled={changingPassword}>
              {changingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </section>

        <section className="account-section">
          <header>
            <ShieldPlus size={24} />
            <div>
              <h3>Add Admin</h3>
              <p>Create a new admin credential stored under the `admin` collection.</p>
            </div>
          </header>

          {adminStatus && (
            <div className={`status-banner ${adminStatus.type}`}>
              {adminStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{adminStatus.message}</span>
            </div>
          )}

          <form onSubmit={handleAddAdmin} className="account-form">
            <label>
              Username
              <input
                type="text"
                value={addForm.username}
                onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                placeholder="e.g. superadmin"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                minLength={6}
                required
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={addForm.confirmPassword}
                onChange={(e) => setAddForm({ ...addForm, confirmPassword: e.target.value })}
                minLength={6}
                required
              />
            </label>
            <button type="submit" className="primary-btn" disabled={creatingAdmin}>
              {creatingAdmin ? 'Creating...' : 'Create Admin'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default AdminAccountManager;


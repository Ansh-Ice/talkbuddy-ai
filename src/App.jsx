import './App.css'
import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { onAuthStateChanged, sendEmailVerification } from 'firebase/auth'
import { auth } from './firebase'
import AuthForm from './AuthForm'
import Home from './Home'
// import Dashboard from './Dashboard'
import ConfirmDeletion from './ConfirmDeletion'
import QuizTest from './QuizTest'
import OralQuestion from './OralQuestion'


function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
      
      if (!firebaseUser) {
        sessionStorage.clear()
        localStorage.removeItem('user')
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const handleRouteProtection = () => {
      const currentPath = window.location.pathname
      const protectedRoutes = ['/', '/dashboard']
      const isProtectedRoute = protectedRoutes.includes(currentPath)
      
      if (isProtectedRoute && !user && !loading) {
        sessionStorage.clear()
        localStorage.removeItem('user')
        navigate('/auth', { replace: true })
      }
    }

    handleRouteProtection()
    window.addEventListener('popstate', handleRouteProtection)
    
    return () => {
      window.removeEventListener('popstate', handleRouteProtection)
    }
  }, [user, loading, navigate])

  if (loading) return null

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            user && !user.emailVerified
              ? <Navigate to="/verify-email" replace />
              : <Home user={user} />
          }
        />
        <Route
          path="/auth"
          element={user ? <Navigate to="/" replace /> : <AuthForm />}
        />
        {/* <Route
          path="/dashboard"
          element={user ? <Dashboard user={user} /> : <Navigate to="/auth" replace />}
        /> */}
        <Route
          path="/verify-email"
          element={user ? (user.emailVerified ? <Navigate to="/" replace /> : <VerifyEmailView user={user} />) : <Navigate to="/auth" replace />}
        />
        <Route
          path="/confirm-deletion"
          element={<ConfirmDeletion />}
        />

        {/* 🔹 Add quiz test route separately */}
        <Route path="/quiztest" element={<QuizTest />} />
        <Route path="/oralquestion" element={<OralQuestion />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

function VerifyEmailView({ user }) {
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  async function handleSend() {
    setSending(true)
    try {
      await sendEmailVerification(user)
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Verify your email</h2>
        <p>We sent a verification link to {user.email}. Please verify to continue.</p>
        <button className="primary" onClick={handleSend} disabled={sending}>
          {sending ? 'Sending…' : sent ? 'Resent' : 'Resend verification email'}
        </button>
      </div>
    </div>
  )
}

export default App

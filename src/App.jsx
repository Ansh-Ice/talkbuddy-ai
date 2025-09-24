import './App.css'
import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { onAuthStateChanged, sendEmailVerification } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import AuthForm from './AuthForm'
import Home from './Home'
import ConfirmDeletion from './ConfirmDeletion'
import QuizTest from './QuizTest'
import OralQuestion from './OralQuestion'

function App() {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(undefined) // undefined = not yet loaded
  const [loading, setLoading] = useState(true)
  const [authStateStable, setAuthStateStable] = useState(false)
  const navigate = useNavigate()

  // 🔹 Refresh user profile
  //poorav commit
  const refreshUserProfile = async () => {
    if (!user) return
    try {
      const snap = await getDoc(doc(db, "users", user.uid))
      if (snap.exists()) {
        const data = snap.data()
        console.log("User profile refreshed:", data)
        setUserProfile(data)
      } else {
        console.log("User profile does not exist")
        setUserProfile(null)
      }
    } catch (err) {
      console.error("Error refreshing profile:", err)
      setUserProfile(null)
    }
  }

  // 🔹 Listen for auth changes with debouncing
  useEffect(() => {
    let timeoutId
    let isStable = false
    
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser ? "User logged in" : "User logged out")
      
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      
      // Debounce auth state changes to prevent rapid toggling
      timeoutId = setTimeout(async () => {
        if (isStable) return // Prevent multiple rapid changes
        
        isStable = true
        setUser(firebaseUser)

        if (firebaseUser) {
          console.log("User details:", {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            emailVerified: firebaseUser.emailVerified
          })
          
          try {
            const snap = await getDoc(doc(db, "users", firebaseUser.uid))
            if (snap.exists()) {
              console.log("User profile found:", snap.data())
              setUserProfile(snap.data())
            } else {
              console.log("No user profile found → new user")
              setUserProfile(null)
            }
          } catch (err) {
            console.error("Error fetching profile:", err)
            setUserProfile(null)
          }
        } else {
          console.log("User logged out, clearing profile")
          setUserProfile(null)
        }

        setLoading(false)
        setAuthStateStable(true)
        
        // Reset stability flag after a delay
        setTimeout(() => {
          isStable = false
        }, 1000)
      }, 200) // 200ms debounce
    })

    return () => {
      unsub()
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [])

  // 🔹 Route protection logic
  useEffect(() => {
    if (loading || !authStateStable) return
    const currentPath = window.location.pathname

    if (!user) {
      if (currentPath !== '/auth') {
        console.log("No user → redirecting to /auth")
        navigate('/auth', { replace: true })
      }
      return
    }

    // Prevent redirect loops by checking if user is already authenticated
    if (user && currentPath === '/auth') {
      console.log("User already authenticated → redirecting to home")
      navigate('/', { replace: true })
      return
    }

    if (!user.emailVerified) {
      if (currentPath !== '/verify-email') {
        console.log("Email not verified → redirecting")
        navigate('/verify-email', { replace: true })
      }
      return
    }

    // New user (no profile yet) → go to quiz
    if (userProfile === null && currentPath !== '/quiztest') {
      console.log("New user → redirecting to /quiztest")
      navigate('/quiztest', { replace: true })
      return
    }

    // Existing profile but not completed assessment
    if (userProfile && !userProfile.assessmentCompleted) {
      if (!userProfile.quizCompleted && currentPath !== '/quiztest') {
        console.log("Needs quiz → redirecting to /quiztest")
        navigate('/quiztest', { replace: true })
        return
      }
      if (userProfile.quizCompleted && !userProfile.oralTestCompleted && currentPath !== '/oralquestion') {
        console.log("Needs oral test → redirecting to /oralquestion")
        navigate('/oralquestion', { replace: true })
        return
      }
    }

    // Finished assessment → block test routes
    if (userProfile?.assessmentCompleted && ['/quiztest', '/oralquestion'].includes(currentPath)) {
      console.log("Assessment done → redirecting to home")
      navigate('/', { replace: true })
    }
  }, [user, userProfile, loading, authStateStable, navigate])

  if (loading) return <div>Loading...</div>

  return (
    <Routes>
      <Route
        path="/"
        element={<Home user={user} userProfile={userProfile} />}
      />
      <Route
        path="/auth"
        element={user ? <Navigate to="/" replace /> : <AuthForm />}
      />
      <Route
        path="/verify-email"
        element={
          user ? (
            user.emailVerified ? <Navigate to="/" replace /> : <VerifyEmailView user={user} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route path="/confirm-deletion" element={<ConfirmDeletion />} />
      <Route
        path="/quiztest"
        element={
          user ? (
            <QuizTest
              user={user}
              userProfile={userProfile}
              refreshUserProfile={refreshUserProfile}
            />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route
        path="/oralquestion"
        element={
          user ? (
            <OralQuestion
              user={user}
              userProfile={userProfile}
              refreshUserProfile={refreshUserProfile}
            />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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

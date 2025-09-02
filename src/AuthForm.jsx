import { useEffect, useMemo, useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'

const initialLoginValues = { email: '', password: '' }
const initialRegisterValues = { name: '', email: '', password: '', confirmPassword: '' }

export default function AuthForm({ defaultMode = 'login', onSubmit }) {
  const [mode, setMode] = useState(defaultMode)
  const [values, setValues] = useState(mode === 'login' ? initialLoginValues : initialRegisterValues)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setValues(mode === 'login' ? initialLoginValues : initialRegisterValues)
    setErrors({})
  }, [mode])

  const title = mode === 'login' ? 'Welcome back' : 'Create your account'
  const subtitle = mode === 'login' ? 'Sign in to continue your English journey' : 'Start learning and speaking with confidence'

  const validate = useMemo(() => {
    return (currentValues) => {
      const currentErrors = {}
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

      if (mode === 'register') {
        if (!currentValues.name || currentValues.name.trim().length < 2) {
          currentErrors.name = 'Please enter your full name'
        }
      }

      if (!currentValues.email || !emailRegex.test(currentValues.email)) {
        currentErrors.email = 'Enter a valid email address'
      }

      if (!currentValues.password || currentValues.password.length < 6) {
        currentErrors.password = 'Password must be at least 6 characters'
      }

      if (mode === 'register') {
        if (!currentValues.confirmPassword) {
          currentErrors.confirmPassword = 'Please confirm your password'
        } else if (currentValues.password !== currentValues.confirmPassword) {
          currentErrors.confirmPassword = "Passwords don't match"
        }
      }

      return currentErrors
    }
  }, [mode])

  function handleChange(event) {
    const { name, value } = event.target
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      const payload = { mode, ...values }
      if (onSubmit) {
        await onSubmit(payload)
      } else {
        await new Promise((r) => setTimeout(r, 600))
        /* eslint-disable no-console */
        console.log('Auth payload', payload)
        /* eslint-enable no-console */
        alert(`${mode === 'login' ? 'Logged in' : 'Registered'} successfully!`)
      }
    } catch (error) {
      alert('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card" role="region" aria-live="polite">
        <div className="brand">
          <div className="brand-logo" aria-hidden="true">🗣️</div>
          <div>
            <h1 className="brand-title">TalkBuddy</h1>
            <p className="brand-subtitle">AI English Coach</p>
          </div>
        </div>

        <h2 className="auth-title">{title}</h2>
        <p className="auth-subtitle">{subtitle}</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {mode === 'register' && (
            <div className="form-field">
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Jane Doe"
                value={values.name}
                onChange={handleChange}
                autoComplete="name"
              />
              {errors.name && <span className="error" role="alert">{errors.name}</span>}
            </div>
          )}

          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={values.email}
              onChange={handleChange}
              autoComplete="email"
              inputMode="email"
            />
            {errors.email && <span className="error" role="alert">{errors.email}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={values.password}
              onChange={handleChange}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {errors.password && <span className="error" role="alert">{errors.password}</span>}
          </div>

          {mode === 'login' && (
            <div className="form-row between">
              <label className="checkbox">
                <input type="checkbox" name="remember" />
                <span>Remember me</span>
              </label>
              <button type="button" className="link" onClick={() => alert('Password reset flow coming soon!')}>
                Forgot password?
              </button>
            </div>
          )}

          {mode === 'register' && (
            <div className="form-field">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={values.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
              />
              {errors.confirmPassword && <span className="error" role="alert">{errors.confirmPassword}</span>}
            </div>
          )}

          <button className="primary" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="divider"><span>or</span></div>

        <div className="social-logins">
          <GoogleLogin
            theme="filled_blue"
            shape="pill"
            text="continue_with"
            onSuccess={async (credentialResponse) => {
              const idToken = credentialResponse?.credential
              if (!idToken) {
                alert('Google login failed: No credential received')
                return
              }
              try {
                if (onSubmit) {
                  await onSubmit({ provider: 'google', idToken })
                } else {
                  /* eslint-disable no-console */
                  console.log('Google ID token', idToken)
                  /* eslint-enable no-console */
                  alert('Signed in with Google!')
                }
              } catch (e) {
                alert('Google sign-in error. Please try again.')
              }
            }}
            onError={() => {
              alert('Google login failed. Please try again.')
            }}
          />
        </div>

        <p className="switch-mode">
          {mode === 'login' ? (
            <>
              New to TalkBuddy?{' '}
              <button className="link" type="button" onClick={() => setMode('register')}>Create an account</button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button className="link" type="button" onClick={() => setMode('login')}>Sign in</button>
            </>
          )}
        </p>

        <p className="terms">
          By continuing, you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}



import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the hash fragment from the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const type = hashParams.get('type')
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        // If we have tokens in the URL, Supabase will automatically handle them
        // via the onAuthStateChange listener. We just need to wait for the session.

        // Give Supabase a moment to process the tokens
        await new Promise(resolve => setTimeout(resolve, 500))

        // Check if session was established
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('[AuthCallback] Session error:', sessionError)
          setError('Failed to authenticate. Please try again.')
          return
        }

        if (!session && accessToken) {
          // Try to set the session manually if auto-detection didn't work
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          })

          if (setSessionError) {
            console.error('[AuthCallback] Set session error:', setSessionError)
            setError('Failed to establish session. The link may have expired.')
            return
          }
        }

        // Redirect based on the auth flow type
        switch (type) {
          case 'recovery':
            // Password reset flow
            navigate('/reset-password', { replace: true })
            break
          case 'invite':
            // New user invitation flow
            navigate('/set-password', { replace: true })
            break
          case 'magiclink':
          case 'signup':
          default:
            // Magic link or default - go to dashboard
            navigate('/dashboard', { replace: true })
            break
        }
      } catch (err) {
        console.error('[AuthCallback] Error:', err)
        setError('An unexpected error occurred. Please try again.')
      }
    }

    handleAuthCallback()
  }, [navigate])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-md p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Authentication Error</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Return to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Completing authentication...</p>
      </div>
    </div>
  )
}

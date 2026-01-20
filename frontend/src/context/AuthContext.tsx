import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserProfile, UserRole } from '../types/database'

interface UserProfileWithRole extends UserProfile {
  role?: UserRole
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfileWithRole | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  // Role helpers
  isSuperuser: boolean
  isAdmin: boolean
  hasRole: (role: 'superuser' | 'admin' | 'viewer') => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfileWithRole | null>(null)
  const [loading, setLoading] = useState(true)

  // Load user profile from database
  const loadProfile = async (userId: string): Promise<UserProfileWithRole | null> => {
    try {
      // Get user profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) {
        // Table might not exist yet - OK during initial setup
        if (profileError.code === '42P01' || profileError.message.includes('does not exist')) {
          return null
        }
        // No profile found - OK, user may not have profile yet
        if (profileError.code === 'PGRST116') {
          return null
        }
        console.error('[Auth] Error loading profile:', profileError.message)
        return null
      }

      if (!profileData) {
        return null
      }

      // Cast to UserProfile to access properties
      const typedProfile = profileData as unknown as UserProfile

      // Fetch role separately if profile has role_id
      let role: UserRole | undefined
      if (typedProfile.role_id) {
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('id, name, description')
          .eq('id', typedProfile.role_id)
          .single()

        if (roleError) {
          console.error('[Auth] Error loading role:', roleError.message)
        } else {
          role = roleData as UserRole
        }
      }

      return { ...typedProfile, role } as UserProfileWithRole
    } catch (error) {
      console.error('[Auth] Exception loading profile:', error)
      return null
    }
  }

  // Refresh profile (can be called after profile updates)
  const refreshProfile = async () => {
    if (user) {
      const newProfile = await loadProfile(user.id)
      setProfile(newProfile)
    }
  }

  useEffect(() => {
    let mounted = true

    // Get initial session
    const initAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession()

        if (!mounted) return

        setSession(initialSession)
        setUser(initialSession?.user ?? null)

        // Load profile if user exists (with timeout to prevent hanging)
        if (initialSession?.user) {
          try {
            const timeoutPromise = new Promise<null>((resolve) => {
              setTimeout(() => {
                console.warn('[Auth] Profile load timeout - continuing without profile')
                resolve(null)
              }, 5000)
            })

            const userProfile = await Promise.race([
              loadProfile(initialSession.user.id),
              timeoutPromise
            ])

            if (mounted) {
              setProfile(userProfile)
            }
          } catch (profileError) {
            console.error('[Auth] Profile load failed:', profileError)
          }
        }
      } catch (error) {
        console.error('[Auth] Error initializing auth:', error)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initAuth()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return

      // Handle PASSWORD_RECOVERY event - redirect to reset password page
      if (event === 'PASSWORD_RECOVERY') {
        window.location.href = '/reset-password'
        return
      }

      setSession(newSession)
      setUser(newSession?.user ?? null)

      // Load profile on sign in, clear on sign out
      if (newSession?.user) {
        if (event === 'SIGNED_IN') {
          // Only reload on explicit sign in, not INITIAL_SESSION (handled by initAuth)
          const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), 5000)
          })
          const userProfile = await Promise.race([
            loadProfile(newSession.user.id),
            timeoutPromise
          ])
          if (mounted) {
            setProfile(userProfile)
          }
        }
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, []) // Empty deps - only run once on mount

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      return { error }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  // Role checking helpers
  const roleName = profile?.role?.name
  const isSuperuser = roleName === 'superuser'
  const isAdmin = roleName === 'superuser' || roleName === 'admin'

  const hasRole = useCallback((requiredRole: 'superuser' | 'admin' | 'viewer'): boolean => {
    // If no profile exists (tables not set up), grant access
    if (!profile) return true

    // If profile exists but no role, deny access
    if (!roleName) return false

    switch (requiredRole) {
      case 'viewer':
        return ['superuser', 'admin', 'viewer'].includes(roleName)
      case 'admin':
        return ['superuser', 'admin'].includes(roleName)
      case 'superuser':
        return roleName === 'superuser'
      default:
        return false
    }
  }, [profile, roleName])

  const value = {
    user,
    session,
    profile,
    loading,
    signIn,
    signOut,
    refreshProfile,
    isSuperuser,
    isAdmin,
    hasRole,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

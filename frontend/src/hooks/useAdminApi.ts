import { useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import type { UserProfileWithRole, UserInvitationWithDetails } from '../types/database'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface ApiError {
  message: string
  status?: number
}

interface InviteUserParams {
  email: string
  role?: 'admin' | 'viewer'
}

interface UpdateUserRoleParams {
  userId: string
  role: 'admin' | 'viewer'
}

interface UpdateUserStatusParams {
  userId: string
  is_active: boolean
}

export function useAdminApi() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const getAuthHeaders = useCallback(() => {
    if (!session?.access_token) {
      throw new Error('No authentication token')
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    }
  }, [session])

  // Fetch all users
  const fetchUsers = useCallback(async (): Promise<UserProfileWithRole[]> => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/admin/users`, {
        headers: getAuthHeaders(),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch users')
      }

      return data.users || []
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError({ message })
      throw err
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  // Fetch all invitations
  const fetchInvitations = useCallback(async (): Promise<UserInvitationWithDetails[]> => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/admin/invitations`, {
        headers: getAuthHeaders(),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch invitations')
      }

      return data.invitations || []
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError({ message })
      throw err
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  // Invite a new user
  const inviteUser = useCallback(async ({ email, role = 'viewer' }: InviteUserParams): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/admin/invite`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ email, role }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to invite user')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError({ message })
      throw err
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  // Revoke an invitation
  const revokeInvitation = useCallback(async (invitationId: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/admin/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to revoke invitation')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError({ message })
      throw err
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  // Update user role
  const updateUserRole = useCallback(async ({ userId, role }: UpdateUserRoleParams): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ role }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user role')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError({ message })
      throw err
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  // Update user status (activate/deactivate)
  const updateUserStatus = useCallback(async ({ userId, is_active }: UpdateUserStatusParams): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ is_active }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user status')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError({ message })
      throw err
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  return {
    loading,
    error,
    fetchUsers,
    fetchInvitations,
    inviteUser,
    revokeInvitation,
    updateUserRole,
    updateUserStatus,
  }
}

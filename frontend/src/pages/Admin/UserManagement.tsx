import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { useAdminApi } from '../../hooks/useAdminApi'
import { useAuth } from '../../context/AuthContext'
import type { UserProfileWithRole, UserInvitationWithDetails } from '../../types/database'
import { Users, Mail, UserPlus, Shield, ShieldCheck, Eye, X, Check, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

export const UserManagement: React.FC = () => {
  const { user: currentUser, isSuperuser } = useAuth()
  const {
    loading,
    error,
    fetchUsers,
    fetchInvitations,
    inviteUser,
    revokeInvitation,
    updateUserRole,
    updateUserStatus,
  } = useAdminApi()

  const [users, setUsers] = useState<UserProfileWithRole[]>([])
  const [invitations, setInvitations] = useState<UserInvitationWithDetails[]>([])
  const [activeTab, setActiveTab] = useState<'users' | 'invitations' | 'invite'>('users')

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'viewer'>('viewer')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [usersData, invitationsData] = await Promise.all([
        fetchUsers(),
        fetchInvitations(),
      ])
      setUsers(usersData)
      setInvitations(invitationsData)
    } catch (err) {
      console.error('Error loading data:', err)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteLoading(true)
    setInviteError(null)
    setInviteSuccess(null)

    try {
      await inviteUser({ email: inviteEmail, role: inviteRole })
      setInviteSuccess(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      setInviteRole('viewer')
      // Reload invitations
      const newInvitations = await fetchInvitations()
      setInvitations(newInvitations)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return

    try {
      await revokeInvitation(invitationId)
      const newInvitations = await fetchInvitations()
      setInvitations(newInvitations)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke invitation')
    }
  }

  const handleUpdateRole = async (userId: string, newRole: 'admin' | 'viewer') => {
    try {
      await updateUserRole({ userId, role: newRole })
      const newUsers = await fetchUsers()
      setUsers(newUsers)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate'
    if (!confirm(`Are you sure you want to ${action} this user?`)) return

    try {
      await updateUserStatus({ userId, is_active: !currentStatus })
      const newUsers = await fetchUsers()
      setUsers(newUsers)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const getRoleIcon = (roleName?: string) => {
    switch (roleName) {
      case 'superuser':
        return <ShieldCheck className="h-4 w-4 text-purple-600" />
      case 'admin':
        return <Shield className="h-4 w-4 text-blue-600" />
      default:
        return <Eye className="h-4 w-4 text-gray-600" />
    }
  }

  const getRoleBadgeColor = (roleName?: string) => {
    switch (roleName) {
      case 'superuser':
        return 'bg-purple-100 text-purple-800'
      case 'admin':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'accepted':
        return 'bg-green-100 text-green-800'
      case 'expired':
        return 'bg-gray-100 text-gray-800'
      case 'revoked':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (!isSuperuser) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground mt-2">
            You need superuser access to manage users.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground">
          Manage users and invitations for your organization
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">
              {users.filter(u => u.is_active).length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Invitations</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {invitations.filter(i => i.status === 'pending').length}
            </div>
            <p className="text-xs text-muted-foreground">
              {invitations.length} total invitations
            </p>
          </CardContent>
        </Card>

        <button
          className="text-left w-full"
          onClick={() => setActiveTab('invite')}
        >
          <Card className="cursor-pointer hover:bg-gray-50 transition-colors h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Invite User</CardTitle>
              <UserPlus className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-sm text-blue-600 font-medium">Click to invite</div>
              <p className="text-xs text-muted-foreground">
                Send invitation email
              </p>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'invitations'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Invitations ({invitations.length})
          </button>
          <button
            onClick={() => setActiveTab('invite')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'invite'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Invite New User
          </button>
        </nav>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>Manage user roles and access</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
              </div>
            ) : users.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No users found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">User</th>
                      <th className="text-left py-3 px-4 font-medium">Role</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-left py-3 px-4 font-medium">Last Login</th>
                      <th className="text-left py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div>
                            <div className="font-medium">{user.email}</div>
                            {user.display_name && (
                              <div className="text-sm text-muted-foreground">
                                {user.display_name}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(
                              user.role?.name
                            )}`}
                          >
                            {getRoleIcon(user.role?.name)}
                            {user.role?.name || 'viewer'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              user.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {user.is_active ? (
                              <>
                                <Check className="h-3 w-3" /> Active
                              </>
                            ) : (
                              <>
                                <X className="h-3 w-3" /> Inactive
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {user.last_login_at
                            ? format(new Date(user.last_login_at), 'MMM d, yyyy HH:mm')
                            : 'Never'}
                        </td>
                        <td className="py-3 px-4">
                          {user.role?.name !== 'superuser' && user.id !== currentUser?.id && (
                            <div className="flex items-center gap-2">
                              <select
                                value={user.role?.name || 'viewer'}
                                onChange={(e) =>
                                  handleUpdateRole(user.id, e.target.value as 'admin' | 'viewer')
                                }
                                className="text-sm border rounded px-2 py-1"
                                disabled={loading}
                              >
                                <option value="viewer">Viewer</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button
                                onClick={() => handleToggleStatus(user.id, user.is_active)}
                                className={`text-sm px-2 py-1 rounded ${
                                  user.is_active
                                    ? 'text-red-600 hover:bg-red-50'
                                    : 'text-green-600 hover:bg-green-50'
                                }`}
                                disabled={loading}
                              >
                                {user.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          )}
                          {user.role?.name === 'superuser' && (
                            <span className="text-sm text-muted-foreground">Protected</span>
                          )}
                          {user.id === currentUser?.id && (
                            <span className="text-sm text-muted-foreground">You</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invitations Tab */}
      {activeTab === 'invitations' && (
        <Card>
          <CardHeader>
            <CardTitle>Invitations</CardTitle>
            <CardDescription>Track sent invitations</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
              </div>
            ) : invitations.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No invitations sent yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">Email</th>
                      <th className="text-left py-3 px-4 font-medium">Role</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-left py-3 px-4 font-medium">Sent</th>
                      <th className="text-left py-3 px-4 font-medium">Expires</th>
                      <th className="text-left py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((invitation) => (
                      <tr key={invitation.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="font-medium">{invitation.email}</div>
                          {invitation.invited_by_email && (
                            <div className="text-sm text-muted-foreground">
                              by {invitation.invited_by_email}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(
                              invitation.role?.name
                            )}`}
                          >
                            {getRoleIcon(invitation.role?.name)}
                            {invitation.role?.name || 'viewer'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(
                              invitation.status
                            )}`}
                          >
                            {invitation.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {format(new Date(invitation.created_at), 'MMM d, yyyy')}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {format(new Date(invitation.expires_at), 'MMM d, yyyy')}
                        </td>
                        <td className="py-3 px-4">
                          {invitation.status === 'pending' && (
                            <button
                              onClick={() => handleRevokeInvitation(invitation.id)}
                              className="text-sm text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                              disabled={loading}
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite Tab */}
      {activeTab === 'invite' && (
        <Card>
          <CardHeader>
            <CardTitle>Invite New User</CardTitle>
            <CardDescription>
              Send an invitation email to add a new user to the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4 max-w-md">
              {inviteError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  {inviteError}
                </div>
              )}
              {inviteSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
                  {inviteSuccess}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium mb-1">
                  Role
                </label>
                <select
                  id="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'viewer')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="viewer">Viewer - Read-only access</option>
                  <option value="admin">Admin - Can manage data</option>
                </select>
                <p className="mt-1 text-sm text-muted-foreground">
                  {inviteRole === 'viewer'
                    ? 'Viewer can view all dashboard data but cannot make changes.'
                    : 'Admin can view and modify data, but cannot manage users.'}
                </p>
              </div>

              <button
                type="submit"
                disabled={inviteLoading || !inviteEmail}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {inviteLoading ? (
                  <>
                    <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Send Invitation
                  </>
                )}
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          Error: {error.message}
        </div>
      )}
    </div>
  )
}

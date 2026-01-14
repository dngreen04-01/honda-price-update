import { Response } from 'express';
import { getSupabaseClient } from '../database/client.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

// ============================================
// GET /api/auth/profile - Get current user profile
// ============================================
export async function getProfile(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    res.json({
      success: true,
      profile: {
        id: req.user.id,
        email: req.user.email,
        display_name: req.user.profile.display_name,
        role: req.user.role,
        is_superuser: req.user.isSuperuser,
        is_admin: req.user.isAdmin,
      },
    });
  } catch (error) {
    logger.error('Error getting profile', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
}

// ============================================
// GET /api/admin/users - List all users
// ============================================
export async function listUsers(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select(`
        id,
        email,
        display_name,
        role_id,
        role:user_roles(id, name, description),
        invited_by,
        invited_at,
        last_login_at,
        is_active,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error listing users', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to list users' });
      return;
    }

    // Get inviter emails for users who were invited
    const usersWithInviters = await Promise.all(
      (profiles || []).map(async (profile) => {
        let invited_by_email: string | null = null;
        if (profile.invited_by) {
          const { data: inviter } = await supabase
            .from('user_profiles')
            .select('email')
            .eq('id', profile.invited_by)
            .single();
          invited_by_email = inviter?.email || null;
        }
        return {
          ...profile,
          invited_by_email,
        };
      })
    );

    res.json({
      success: true,
      users: usersWithInviters,
    });
  } catch (error) {
    logger.error('Error listing users', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to list users' });
  }
}

// ============================================
// POST /api/admin/invite - Invite a new user
// ============================================
interface InviteUserBody {
  email: string;
  role?: 'admin' | 'viewer';
}

export async function inviteUser(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { email, role = 'viewer' } = req.body as InviteUserBody;

    if (!email || !email.includes('@')) {
      res.status(400).json({ success: false, error: 'Valid email is required' });
      return;
    }

    // Prevent inviting as superuser (runtime check for malformed requests)
    if ((role as string) === 'superuser') {
      res.status(400).json({
        success: false,
        error: 'Cannot invite users as superuser',
      });
      return;
    }

    const supabase = getSupabaseClient();

    // Check if user already exists
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single();

    if (existingProfile) {
      res.status(400).json({
        success: false,
        error: 'User with this email already exists',
      });
      return;
    }

    // Check if there's a pending invitation
    const { data: existingInvitation } = await supabase
      .from('user_invitations')
      .select('id, email, status')
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .single();

    if (existingInvitation) {
      res.status(400).json({
        success: false,
        error: 'Pending invitation already exists for this email',
      });
      return;
    }

    // Get role ID
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('name', role)
      .single();

    if (roleError || !roleData) {
      logger.error('Role not found', { role, error: roleError?.message });
      res.status(400).json({ success: false, error: 'Invalid role' });
      return;
    }

    // Create invitation record
    const { data: invitation, error: inviteError } = await supabase
      .from('user_invitations')
      .insert({
        email: email.toLowerCase(),
        role_id: roleData.id,
        invited_by: req.user!.id,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .select()
      .single();

    if (inviteError) {
      logger.error('Error creating invitation', { error: inviteError.message });
      res.status(500).json({ success: false, error: 'Failed to create invitation' });
      return;
    }

    // Send invitation email via Supabase Auth
    // The redirectTo should point to your app's password setup page
    const siteUrl = process.env.SITE_URL || 'http://localhost:5173';
    const { error: authError } = await supabase.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      {
        redirectTo: `${siteUrl}/set-password`,
      }
    );

    if (authError) {
      // Rollback invitation record if email fails
      await supabase
        .from('user_invitations')
        .update({ status: 'revoked' })
        .eq('id', invitation.id);

      logger.error('Error sending invitation email', {
        error: authError.message,
        email,
      });
      res.status(500).json({
        success: false,
        error: `Failed to send invitation email: ${authError.message}`,
      });
      return;
    }

    logger.info('User invited successfully', {
      email,
      role,
      invitedBy: req.user!.email,
    });

    res.json({
      success: true,
      message: `Invitation sent to ${email}`,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role,
        expires_at: invitation.expires_at,
      },
    });
  } catch (error) {
    logger.error('Error inviting user', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to invite user' });
  }
}

// ============================================
// GET /api/admin/invitations - List invitations
// ============================================
export async function listInvitations(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    const { data: invitations, error } = await supabase
      .from('user_invitations')
      .select(`
        id,
        email,
        role_id,
        role:user_roles(id, name),
        invited_by,
        status,
        expires_at,
        accepted_at,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error listing invitations', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to list invitations' });
      return;
    }

    // Get inviter emails
    const invitationsWithInviters = await Promise.all(
      (invitations || []).map(async (invitation) => {
        let invited_by_email: string | null = null;
        if (invitation.invited_by) {
          const { data: inviter } = await supabase
            .from('user_profiles')
            .select('email')
            .eq('id', invitation.invited_by)
            .single();
          invited_by_email = inviter?.email || null;
        }
        return {
          ...invitation,
          invited_by_email,
        };
      })
    );

    res.json({
      success: true,
      invitations: invitationsWithInviters,
    });
  } catch (error) {
    logger.error('Error listing invitations', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to list invitations' });
  }
}

// ============================================
// DELETE /api/admin/invitations/:id - Revoke invitation
// ============================================
export async function revokeInvitation(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ success: false, error: 'Invitation ID is required' });
      return;
    }

    const supabase = getSupabaseClient();

    // Check if invitation exists and is pending
    const { data: invitation, error: fetchError } = await supabase
      .from('user_invitations')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError || !invitation) {
      res.status(404).json({ success: false, error: 'Invitation not found' });
      return;
    }

    if (invitation.status !== 'pending') {
      res.status(400).json({
        success: false,
        error: `Cannot revoke invitation with status: ${invitation.status}`,
      });
      return;
    }

    // Revoke the invitation
    const { error: updateError } = await supabase
      .from('user_invitations')
      .update({ status: 'revoked' })
      .eq('id', id);

    if (updateError) {
      logger.error('Error revoking invitation', { error: updateError.message });
      res.status(500).json({ success: false, error: 'Failed to revoke invitation' });
      return;
    }

    logger.info('Invitation revoked', { invitationId: id, revokedBy: req.user!.email });

    res.json({
      success: true,
      message: 'Invitation revoked successfully',
    });
  } catch (error) {
    logger.error('Error revoking invitation', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to revoke invitation' });
  }
}

// ============================================
// PATCH /api/admin/users/:id/role - Update user role
// ============================================
interface UpdateRoleBody {
  role: 'admin' | 'viewer';
}

export async function updateUserRole(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { role } = req.body as UpdateRoleBody;

    if (!id) {
      res.status(400).json({ success: false, error: 'User ID is required' });
      return;
    }

    if (!role || !['admin', 'viewer'].includes(role)) {
      res.status(400).json({
        success: false,
        error: 'Valid role is required (admin or viewer)',
      });
      return;
    }

    const supabase = getSupabaseClient();

    // Check if user exists
    const { data: user, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, email, role:user_roles(name)')
      .eq('id', id)
      .single();

    if (fetchError || !user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Prevent changing superuser role
    const userRole = Array.isArray(user.role) ? user.role[0] : user.role;
    if (userRole?.name === 'superuser') {
      res.status(400).json({
        success: false,
        error: 'Cannot change superuser role',
      });
      return;
    }

    // Prevent changing own role
    if (id === req.user!.id) {
      res.status(400).json({
        success: false,
        error: 'Cannot change your own role',
      });
      return;
    }

    // Get new role ID
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('name', role)
      .single();

    if (roleError || !roleData) {
      res.status(400).json({ success: false, error: 'Invalid role' });
      return;
    }

    // Update the role
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ role_id: roleData.id })
      .eq('id', id);

    if (updateError) {
      logger.error('Error updating user role', { error: updateError.message });
      res.status(500).json({ success: false, error: 'Failed to update user role' });
      return;
    }

    logger.info('User role updated', {
      userId: id,
      email: user.email,
      newRole: role,
      updatedBy: req.user!.email,
    });

    res.json({
      success: true,
      message: `User role updated to ${role}`,
    });
  } catch (error) {
    logger.error('Error updating user role', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to update user role' });
  }
}

// ============================================
// PATCH /api/admin/users/:id/status - Update user status
// ============================================
interface UpdateStatusBody {
  is_active: boolean;
}

export async function updateUserStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { is_active } = req.body as UpdateStatusBody;

    if (!id) {
      res.status(400).json({ success: false, error: 'User ID is required' });
      return;
    }

    if (typeof is_active !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'is_active must be a boolean',
      });
      return;
    }

    const supabase = getSupabaseClient();

    // Check if user exists
    const { data: user, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, email, role:user_roles(name)')
      .eq('id', id)
      .single();

    if (fetchError || !user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Prevent deactivating superuser
    const userRole = Array.isArray(user.role) ? user.role[0] : user.role;
    if (userRole?.name === 'superuser') {
      res.status(400).json({
        success: false,
        error: 'Cannot deactivate superuser',
      });
      return;
    }

    // Prevent deactivating self
    if (id === req.user!.id) {
      res.status(400).json({
        success: false,
        error: 'Cannot change your own status',
      });
      return;
    }

    // Update the status
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ is_active })
      .eq('id', id);

    if (updateError) {
      logger.error('Error updating user status', { error: updateError.message });
      res.status(500).json({ success: false, error: 'Failed to update user status' });
      return;
    }

    logger.info('User status updated', {
      userId: id,
      email: user.email,
      is_active,
      updatedBy: req.user!.email,
    });

    res.json({
      success: true,
      message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error) {
    logger.error('Error updating user status', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: 'Failed to update user status' });
  }
}

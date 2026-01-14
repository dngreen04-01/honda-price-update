import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../database/client.js';
import { UserProfile } from '../types/index.js';
import { logger } from '../utils/logger.js';

// Extend Express Request to include user info
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'superuser' | 'admin' | 'viewer';
    isSuperuser: boolean;
    isAdmin: boolean;
    profile: UserProfile;
  };
}

/**
 * Middleware to verify JWT token and load user profile
 * Extracts Bearer token from Authorization header
 */
export async function verifyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const supabase = getSupabaseClient();

    // Verify the JWT token with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      logger.warn('Auth verification failed', {
        error: authError?.message,
        hasUser: !!user,
      });
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
      return;
    }

    // Load user profile with role
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        role:user_roles(id, name, description)
      `)
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      logger.warn('User profile not found', {
        userId: user.id,
        email: user.email,
        error: profileError?.message,
      });
      res.status(403).json({
        success: false,
        error: 'User profile not found. Please contact administrator.',
      });
      return;
    }

    // Check if user is active
    if (!profile.is_active) {
      res.status(403).json({
        success: false,
        error: 'Account is deactivated. Please contact administrator.',
      });
      return;
    }

    const roleName = profile.role?.name || 'viewer';

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email || profile.email,
      role: roleName,
      isSuperuser: roleName === 'superuser',
      isAdmin: roleName === 'superuser' || roleName === 'admin',
      profile: profile as UserProfile,
    };

    next();
  } catch (error) {
    logger.error('Auth middleware error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
}

/**
 * Middleware to require superuser role
 * Must be used after verifyAuth
 */
export function requireSuperuser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (!req.user.isSuperuser) {
    logger.warn('Superuser access denied', {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
    });
    res.status(403).json({
      success: false,
      error: 'Superuser access required',
    });
    return;
  }

  next();
}

/**
 * Middleware to require admin role (admin or superuser)
 * Must be used after verifyAuth
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  if (!req.user.isAdmin) {
    logger.warn('Admin access denied', {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
    });
    res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
    return;
  }

  next();
}

/**
 * Middleware to require viewer role (any authenticated user)
 * Must be used after verifyAuth
 */
export function requireViewer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  // Any authenticated user with a profile has at least viewer access
  next();
}

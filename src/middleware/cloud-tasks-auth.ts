/**
 * Cloud Tasks Authentication Middleware
 * Verifies requests from Google Cloud Tasks using OIDC tokens
 */

import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

// Cloud Tasks request headers
const CLOUD_TASKS_HEADERS = {
  TASK_NAME: 'x-cloudtasks-taskname',
  TASK_RETRY_COUNT: 'x-cloudtasks-taskretrycount',
  TASK_EXECUTION_COUNT: 'x-cloudtasks-taskexecutioncount',
  QUEUE_NAME: 'x-cloudtasks-queuename',
  TASK_ETA: 'x-cloudtasks-tasketa',
};

/** Cloud Tasks metadata structure */
export interface CloudTasksMetadata {
  taskName: string | null;
  retryCount: number;
  executionCount: number;
  queueName: string | null;
  taskEta: string | null;
  isFromCloudTasks: boolean;
}

// Extend Express Request to include Cloud Tasks metadata
export interface CloudTasksRequest extends Request {
  cloudTasks?: CloudTasksMetadata;
}

// OAuth2 client for token verification
let authClient: OAuth2Client | null = null;

function getAuthClient(): OAuth2Client {
  if (!authClient) {
    authClient = new OAuth2Client();
  }
  return authClient;
}

/**
 * Extract Cloud Tasks metadata from request headers
 */
function extractCloudTasksMetadata(req: Request): CloudTasksMetadata {
  const taskName = req.get(CLOUD_TASKS_HEADERS.TASK_NAME) || null;
  const retryCount = parseInt(req.get(CLOUD_TASKS_HEADERS.TASK_RETRY_COUNT) || '0', 10);
  const executionCount = parseInt(req.get(CLOUD_TASKS_HEADERS.TASK_EXECUTION_COUNT) || '0', 10);
  const queueName = req.get(CLOUD_TASKS_HEADERS.QUEUE_NAME) || null;
  const taskEta = req.get(CLOUD_TASKS_HEADERS.TASK_ETA) || null;

  return {
    taskName,
    retryCount,
    executionCount,
    queueName,
    taskEta,
    isFromCloudTasks: !!taskName,
  };
}

/**
 * Verify OIDC token from Cloud Tasks
 * @param token - The bearer token from Authorization header
 * @param audience - Expected audience (service URL)
 */
async function verifyOidcToken(token: string, audience: string): Promise<boolean> {
  try {
    const client = getAuthClient();
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      logger.warn('OIDC token verification failed: no payload');
      return false;
    }

    // Verify the service account email if configured
    if (config.cloudTasks.serviceAccountEmail) {
      if (payload.email !== config.cloudTasks.serviceAccountEmail) {
        logger.warn('OIDC token email mismatch', {
          expected: config.cloudTasks.serviceAccountEmail,
          received: payload.email,
        });
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('OIDC token verification error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Middleware to verify Cloud Tasks requests
 * Validates OIDC token and extracts Cloud Tasks headers
 *
 * In development (no CLOUD_RUN_SERVICE_URL), allows all requests
 * In production, requires valid OIDC token from Cloud Tasks
 */
export async function verifyCloudTasksAuth(
  req: CloudTasksRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Extract Cloud Tasks metadata (always do this for logging)
  const cloudTasksMetadata = extractCloudTasksMetadata(req);
  req.cloudTasks = cloudTasksMetadata;

  // In development mode (no service URL configured), skip auth
  if (!config.cloudTasks.serviceUrl) {
    logger.debug('Cloud Tasks auth skipped (development mode)', {
      taskName: cloudTasksMetadata.taskName,
    });
    next();
    return;
  }

  // Check for Authorization header
  const authHeader = req.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Allow requests with Cloud Tasks headers but no auth in some configurations
    if (cloudTasksMetadata.isFromCloudTasks && process.env.ALLOW_CLOUDTASKS_NO_AUTH === 'true') {
      logger.warn('Cloud Tasks request allowed without auth (ALLOW_CLOUDTASKS_NO_AUTH=true)', {
        taskName: cloudTasksMetadata.taskName,
      });
      next();
      return;
    }

    logger.warn('Cloud Tasks auth failed: missing Authorization header', {
      taskName: cloudTasksMetadata.taskName,
      path: req.path,
    });
    res.status(401).json({
      success: false,
      error: 'Missing authorization header',
    });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const audience = config.cloudTasks.serviceUrl;

  const isValid = await verifyOidcToken(token, audience);
  if (!isValid) {
    logger.warn('Cloud Tasks auth failed: invalid OIDC token', {
      taskName: cloudTasksMetadata.taskName,
      path: req.path,
    });
    res.status(401).json({
      success: false,
      error: 'Invalid OIDC token',
    });
    return;
  }

  logger.info('Cloud Tasks request authenticated', {
    taskName: cloudTasksMetadata.taskName,
    retryCount: cloudTasksMetadata.retryCount,
    queueName: cloudTasksMetadata.queueName,
  });

  next();
}

/**
 * Middleware to log Cloud Tasks metadata (non-blocking)
 * Use this for endpoints that accept both Cloud Tasks and direct requests
 */
export function extractCloudTasksHeaders(
  req: CloudTasksRequest,
  _res: Response,
  next: NextFunction
): void {
  const cloudTasksMetadata = extractCloudTasksMetadata(req);
  req.cloudTasks = cloudTasksMetadata;

  if (cloudTasksMetadata.isFromCloudTasks) {
    logger.info('Request from Cloud Tasks', {
      taskName: cloudTasksMetadata.taskName,
      retryCount: cloudTasksMetadata.retryCount,
      executionCount: cloudTasksMetadata.executionCount,
    });
  }

  next();
}

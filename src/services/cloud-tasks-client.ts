/**
 * Cloud Tasks Client Service
 * Wrapper for Google Cloud Tasks API with OIDC authentication
 */

import { CloudTasksClient, protos } from '@google-cloud/tasks';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

type ITask = protos.google.cloud.tasks.v2.ITask;
type ICreateTaskRequest = protos.google.cloud.tasks.v2.ICreateTaskRequest;

export interface CreateTaskOptions {
  /** Unique task ID for deduplication (optional) */
  taskId?: string;
  /** Request body payload (optional) */
  payload?: Record<string, unknown>;
  /** Schedule time in seconds from now (optional) */
  scheduleDelaySeconds?: number;
  /** Task dispatch deadline in seconds (default: 1800 = 30 min) */
  dispatchDeadlineSeconds?: number;
}

export interface CreateTaskResult {
  success: boolean;
  taskName?: string;
  error?: string;
}

/**
 * Cloud Tasks Client wrapper for creating HTTP tasks
 */
class CloudTasksService {
  private client: CloudTasksClient | null = null;
  private queuePath: string = '';

  /**
   * Initialize the Cloud Tasks client
   * Lazy initialization to support environments without credentials
   */
  private getClient(): CloudTasksClient {
    if (!this.client) {
      this.client = new CloudTasksClient();
      this.queuePath = this.client.queuePath(
        config.cloudTasks.projectId,
        config.cloudTasks.location,
        config.cloudTasks.queueName
      );
    }
    return this.client;
  }

  /**
   * Check if Cloud Tasks is configured
   */
  isConfigured(): boolean {
    return !!(
      config.cloudTasks.projectId &&
      config.cloudTasks.serviceUrl &&
      config.cloudTasks.serviceAccountEmail
    );
  }

  /**
   * Create an HTTP task with OIDC authentication
   * @param endpoint - The endpoint path (e.g., '/api/worker/nightly-scrape')
   * @param options - Task creation options
   */
  async createTask(endpoint: string, options: CreateTaskOptions = {}): Promise<CreateTaskResult> {
    if (!this.isConfigured()) {
      logger.warn('Cloud Tasks not configured, skipping task creation', { endpoint });
      return {
        success: false,
        error: 'Cloud Tasks not configured',
      };
    }

    const client = this.getClient();
    const {
      taskId,
      payload,
      scheduleDelaySeconds,
      dispatchDeadlineSeconds = 1800, // 30 minutes default
    } = options;

    const url = `${config.cloudTasks.serviceUrl}${endpoint}`;

    const task: ITask = {
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: {
          'Content-Type': 'application/json',
        },
        oidcToken: {
          serviceAccountEmail: config.cloudTasks.serviceAccountEmail,
          audience: config.cloudTasks.serviceUrl,
        },
      },
      dispatchDeadline: {
        seconds: dispatchDeadlineSeconds,
      },
    };

    // Add payload if provided
    if (payload && task.httpRequest) {
      task.httpRequest.body = Buffer.from(JSON.stringify(payload)).toString('base64');
    }

    // Add schedule time if provided
    if (scheduleDelaySeconds && scheduleDelaySeconds > 0) {
      task.scheduleTime = {
        seconds: Math.floor(Date.now() / 1000) + scheduleDelaySeconds,
      };
    }

    const request: ICreateTaskRequest = {
      parent: this.queuePath,
      task,
    };

    // Add task ID for deduplication if provided
    if (taskId) {
      request.task = {
        ...task,
        name: `${this.queuePath}/tasks/${taskId}`,
      };
    }

    try {
      const [response] = await client.createTask(request);

      logger.info('Cloud Task created successfully', {
        taskName: response.name,
        endpoint,
        taskId,
        scheduleDelaySeconds,
      });

      return {
        success: true,
        taskName: response.name ?? undefined,
      };
    } catch (error) {
      // Handle duplicate task error gracefully
      if (error instanceof Error && error.message.includes('ALREADY_EXISTS')) {
        logger.info('Task already exists (deduplication)', {
          taskId,
          endpoint,
        });
        return {
          success: true,
          taskName: taskId ? `${this.queuePath}/tasks/${taskId}` : undefined,
        };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create Cloud Task', {
        endpoint,
        taskId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Create a task for the nightly scrape job
   * Uses date-based task ID for deduplication
   */
  async createNightlyScrapeTask(): Promise<CreateTaskResult> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const taskId = `nightly-scrape-${today}`;

    return this.createTask('/api/worker/nightly-scrape', {
      taskId,
      dispatchDeadlineSeconds: 1800, // 30 minutes (Cloud Tasks max)
    });
  }

  /**
   * Create a task for the weekly crawl job
   * Uses date-based task ID for deduplication
   */
  async createWeeklyCrawlTask(): Promise<CreateTaskResult> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const taskId = `weekly-crawl-${today}`;

    return this.createTask('/api/worker/weekly-crawl', {
      taskId,
      dispatchDeadlineSeconds: 1800, // 30 minutes (Cloud Tasks max)
    });
  }

  /**
   * Create a task for the nightly offers crawl job
   * Uses date-based task ID for deduplication
   */
  async createNightlyOffersCrawlTask(): Promise<CreateTaskResult> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const taskId = `nightly-offers-${today}`;

    return this.createTask('/api/worker/nightly-offers', {
      taskId,
      dispatchDeadlineSeconds: 1800, // 30 minutes for offers-only crawl (smaller scope)
    });
  }

  /**
   * Get queue path for logging/debugging
   */
  getQueuePath(): string {
    if (!this.queuePath && this.isConfigured()) {
      this.getClient(); // Initialize to get queue path
    }
    return this.queuePath;
  }
}

/**
 * Singleton instance of the Cloud Tasks service
 */
export const cloudTasksClient = new CloudTasksService();

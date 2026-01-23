import { config as dotenvConfig } from 'dotenv';
import { Config } from '../types/index.js';

dotenvConfig();

function getEnvVar(key: string, required = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

export const config: Config = {
  supabase: {
    url: getEnvVar('SUPABASE_URL'),
    serviceKey: getEnvVar('SUPABASE_SERVICE_KEY'),
  },
  scrapling: {
    serviceUrl: getEnvVar('SCRAPLING_SERVICE_URL', false) || 'http://localhost:8002',
    timeoutMs: parseInt(getEnvVar('SCRAPLING_TIMEOUT_MS', false) || '60000', 10),
    maxRetries: parseInt(getEnvVar('SCRAPLING_MAX_RETRIES', false) || '3', 10),
    renderJs: getEnvVar('SCRAPLING_RENDER_JS', false) !== 'false',
    proxyUrl: getEnvVar('SCRAPLING_PROXY_URL', false) || undefined,
  },
  shopify: {
    storeDomain: getEnvVar('SHOPIFY_STORE_DOMAIN'),
    accessToken: getEnvVar('SHOPIFY_ADMIN_ACCESS_TOKEN'),
    apiVersion: getEnvVar('SHOPIFY_API_VERSION', false) || '2024-01',
  },
  sendgrid: {
    apiKey: getEnvVar('SENDGRID_API_KEY', false) || '',
    fromEmail: getEnvVar('SENDGRID_FROM_EMAIL', false) || '',
    templateId: getEnvVar('SENDGRID_DIGEST_TEMPLATE_ID', false) || '',
    recipients: (getEnvVar('SENDGRID_RECIPIENT_EMAILS', false) || '').split(',').map(e => e.trim()).filter(Boolean),
  },
  gemini: {
    apiKey: getEnvVar('GEMINI_API_KEY', false) || '',
    textModel: getEnvVar('GEMINI_TEXT_MODEL', false) || 'gemini-3-flash-preview',
    imageModel: getEnvVar('GEMINI_IMAGE_MODEL', false) || 'gemini-3-pro-image-preview',
  },
  app: {
    timezone: getEnvVar('TIMEZONE', false) || 'Pacific/Auckland',
    logLevel: getEnvVar('LOG_LEVEL', false) || 'info',
    superuserEmail: getEnvVar('SUPERUSER_EMAIL', false) || '',
  },
  offers: {
    landingPageHandle: getEnvVar('OFFERS_LANDING_PAGE_HANDLE', false) || 'offers',
  },
};

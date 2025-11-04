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
  firecrawl: {
    apiKey: getEnvVar('FIRECRAWL_API_KEY'),
  },
  shopify: {
    storeDomain: getEnvVar('SHOPIFY_STORE_DOMAIN'),
    accessToken: getEnvVar('SHOPIFY_ADMIN_ACCESS_TOKEN'),
    apiVersion: getEnvVar('SHOPIFY_API_VERSION', false) || '2024-01',
  },
  sendgrid: {
    apiKey: getEnvVar('SENDGRID_API_KEY'),
    fromEmail: getEnvVar('SENDGRID_FROM_EMAIL'),
    templateId: getEnvVar('SENDGRID_DIGEST_TEMPLATE_ID'),
    recipients: getEnvVar('SENDGRID_RECIPIENT_EMAILS').split(',').map(e => e.trim()),
  },
  app: {
    timezone: getEnvVar('TIMEZONE', false) || 'Pacific/Auckland',
    logLevel: getEnvVar('LOG_LEVEL', false) || 'info',
  },
};

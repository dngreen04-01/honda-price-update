import sgMail from '@sendgrid/mail';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { EmailDigestData } from '../types/index.js';

sgMail.setApiKey(config.sendgrid.apiKey);

/**
 * SendGrid email client for sending nightly digests
 */
export class SendGridClient {
  /**
   * Send nightly digest email
   */
  async sendNightlyDigest(data: EmailDigestData, attachments?: Array<{
    content: string;
    filename: string;
    type: string;
  }>): Promise<boolean> {
    try {
      logger.info('Sending nightly digest email', {
        recipients: config.sendgrid.recipients.length,
        priceChanges: data.priceChanges.length,
        newOffers: data.newOffers.length,
      });

      const msg = {
        to: config.sendgrid.recipients,
        from: config.sendgrid.fromEmail,
        templateId: config.sendgrid.templateId,
        dynamicTemplateData: {
          subject: `Nightly Price Update - ${new Date().toLocaleDateString('en-NZ')}`,
          priceChanges: data.priceChanges.map(pc => ({
            productUrl: pc.productUrl,
            oldSalePrice: pc.oldSalePrice?.toFixed(2) || 'N/A',
            newSalePrice: pc.newSalePrice?.toFixed(2) || 'N/A',
            oldOriginalPrice: pc.oldOriginalPrice?.toFixed(2) || 'N/A',
            newOriginalPrice: pc.newOriginalPrice?.toFixed(2) || 'N/A',
            changePercent: pc.changePercent.toFixed(1),
            isIncrease: pc.changePercent > 0,
            isDecrease: pc.changePercent < 0,
          })),
          newOffers: data.newOffers.map(offer => ({
            title: offer.title,
            summary: offer.summary || 'No summary available',
            startDate: offer.start_date || 'N/A',
            endDate: offer.end_date || 'N/A',
            offerUrl: offer.offer_url,
          })),
          supplierOnlyProducts: data.supplierOnlyProducts.map(url => ({ url })),
          shopifyOnlyProducts: data.shopifyOnlyProducts.map(url => ({ url })),
          stats: {
            totalProductsScraped: data.stats.totalProductsScraped,
            successfulExtractions: data.stats.successfulExtractions,
            shopifySynced: data.stats.shopifySynced,
            extractionSuccessRate: (
              (data.stats.successfulExtractions / data.stats.totalProductsScraped) *
              100
            ).toFixed(1),
          },
          hasPriceChanges: data.priceChanges.length > 0,
          hasNewOffers: data.newOffers.length > 0,
          hasSupplierOnlyProducts: data.supplierOnlyProducts.length > 0,
          hasShopifyOnlyProducts: data.shopifyOnlyProducts.length > 0,
          date: new Date().toLocaleDateString('en-NZ', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        },
        attachments: attachments || [],
      };

      await sgMail.send(msg);

      logger.info('Nightly digest email sent successfully');
      return true;
    } catch (error) {
      logger.error('Failed to send nightly digest email', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Send simple alert email
   */
  async sendAlertEmail(subject: string, message: string): Promise<boolean> {
    try {
      logger.info('Sending alert email', { subject });

      const msg = {
        to: config.sendgrid.recipients,
        from: config.sendgrid.fromEmail,
        subject,
        text: message,
        html: `<p>${message}</p>`,
      };

      await sgMail.send(msg);

      logger.info('Alert email sent successfully');
      return true;
    } catch (error) {
      logger.error('Failed to send alert email', {
        subject,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

export const sendgridClient = new SendGridClient();

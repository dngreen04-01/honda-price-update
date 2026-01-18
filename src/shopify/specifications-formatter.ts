import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { BikeSpecificationCategory } from '../types/index.js';

/**
 * Format specifications as HTML accordion using Gemini AI
 * Falls back to simple string concatenation if Gemini fails
 */
export async function formatSpecificationsHtml(
  specifications: BikeSpecificationCategory[]
): Promise<string> {
  // Try Gemini first if API key is configured
  if (config.gemini.apiKey) {
    try {
      const geminiResult = await formatWithGemini(specifications);
      if (geminiResult) {
        logger.info('Specifications formatted with Gemini AI');
        return geminiResult;
      }
    } catch (error) {
      logger.warn('Gemini formatting failed, falling back to simple format', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    logger.info('Gemini API key not configured, using simple format');
  }

  // Fallback to simple formatting
  return formatSimple(specifications);
}

/**
 * Format specifications using Gemini AI
 */
async function formatWithGemini(
  specifications: BikeSpecificationCategory[]
): Promise<string | null> {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Convert the following JSON specifications into HTML accordion format.

IMPORTANT: Return ONLY the HTML, no markdown code blocks, no explanations.

The HTML must follow this exact structure:
<div class="spec-accordion">
  <div class="spec-panel">
    <h4>Category Name</h4>
    <table class="product-table"><tbody>
      <tr><td>Label</td><td>Value</td></tr>
    </tbody></table>
  </div>
</div>

Each category in the JSON should become a spec-panel. Each spec in the category should become a table row.

JSON specifications:
${JSON.stringify(specifications, null, 2)}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  if (!text) {
    return null;
  }

  // Clean up any markdown code blocks if present
  let html = text.trim();
  if (html.startsWith('```html')) {
    html = html.slice(7);
  } else if (html.startsWith('```')) {
    html = html.slice(3);
  }
  if (html.endsWith('```')) {
    html = html.slice(0, -3);
  }

  return html.trim();
}

/**
 * Simple fallback formatter - no AI required
 */
function formatSimple(specifications: BikeSpecificationCategory[]): string {
  if (!specifications || specifications.length === 0) {
    return '';
  }

  const panels = specifications.map(category => {
    const rows = category.specs
      .map(spec => `      <tr><td>${escapeHtml(spec.label)}</td><td>${escapeHtml(spec.value)}</td></tr>`)
      .join('\n');

    return `  <div class="spec-panel">
    <h4>${escapeHtml(category.category)}</h4>
    <table class="product-table"><tbody>
${rows}
    </tbody></table>
  </div>`;
  });

  return `<div class="spec-accordion">
${panels.join('\n')}
</div>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

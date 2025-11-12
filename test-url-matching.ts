/**
 * Test URL Canonicalization Matching
 * Tests that URLs are properly canonicalized for matching between scraper and Shopify
 */

import { canonicalizeUrl } from './src/utils/canonicalize.js';

// Test cases: Various URL formats that should all canonicalize to the same value
const testUrls = [
  'https://www.hondaoutdoors.co.nz/gb350/',
  'https://hondaoutdoors.co.nz/gb350/',
  'https://hondaoutdoors.co.nz/gb350',
  'https://www.hondaoutdoors.co.nz/gb350',
  'https://www.hondaoutdoors.co.nz/gb350/?utm_source=google',
  'https://HondaOutdoors.co.nz/GB350/',
];

console.log('Testing URL Canonicalization:\n');
console.log('=' .repeat(80));

const canonicalResults = testUrls.map(url => {
  const canonical = canonicalizeUrl(url);
  console.log(`Original:   ${url}`);
  console.log(`Canonical:  ${canonical}`);
  console.log('-'.repeat(80));
  return canonical;
});

// Check if all URLs canonicalize to the same value
const uniqueCanonicals = new Set(canonicalResults);

console.log('\nResults:');
console.log('=' .repeat(80));
console.log(`Total test URLs: ${testUrls.length}`);
console.log(`Unique canonical URLs: ${uniqueCanonicals.size}`);

if (uniqueCanonicals.size === 1) {
  console.log('✅ SUCCESS: All URLs canonicalize to the same value');
  console.log(`   Canonical URL: ${canonicalResults[0]}`);
} else {
  console.log('❌ FAILURE: URLs canonicalize to different values');
  console.log('   Unique values:', Array.from(uniqueCanonicals));
}

// Expected canonical URL
const expected = 'https://hondaoutdoors.co.nz/gb350';
if (canonicalResults[0] === expected) {
  console.log(`✅ Canonical URL matches expected format: ${expected}`);
} else {
  console.log(`⚠️  Canonical URL differs from expected`);
  console.log(`   Expected: ${expected}`);
  console.log(`   Got:      ${canonicalResults[0]}`);
}

console.log('\n' + '=' .repeat(80));
console.log('Test complete!');

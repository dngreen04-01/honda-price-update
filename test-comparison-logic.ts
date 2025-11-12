// Test the comparison logic
const currentPrice = 200;
const currentCompareAt = null;

const salePrice = 200;
const originalPrice = 398;

const hasActiveSale = originalPrice !== null && originalPrice > salePrice;
const targetCompareAt = hasActiveSale ? originalPrice : null;

console.log('\nComparison Test:');
console.log('Current Price:', currentPrice);
console.log('Current Compare At:', currentCompareAt);
console.log('Sale Price:', salePrice);
console.log('Original Price:', originalPrice);
console.log('Has Active Sale:', hasActiveSale);
console.log('Target Compare At:', targetCompareAt);

const needsUpdate =
  currentPrice !== salePrice ||
  currentCompareAt !== targetCompareAt;

console.log('\nNeedsUpdate Calculation:');
console.log('currentPrice !== salePrice:', currentPrice !== salePrice, `(${currentPrice} !== ${salePrice})`);
console.log('currentCompareAt !== targetCompareAt:', currentCompareAt !== targetCompareAt, `(${currentCompareAt} !== ${targetCompareAt})`);
console.log('Needs Update:', needsUpdate);

/* Preview only. Saved quote totals remain authoritative on the server. */
(() => {
  'use strict';
  const maximum = 999999999999n;
  const rounded = (numerator, denominator) => (numerator + denominator / 2n) / denominator;
  const scaled = (value, places, max, positive = false) => {
    if (typeof value !== 'string' || value.length > 30) return null;
    const normalized = value.trim().replace(',', '.');
    if (!new RegExp('^(?:0|[1-9]\\d{0,9})(?:\\.\\d{1,' + places + '})?$').test(normalized)) return null;
    const [whole, fraction = ''] = normalized.split('.');
    const result = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
    return result > max || positive && result === 0n ? null : result;
  };
  function calculate(items, tax) {
    const result = {lineTotals: [], subtotalKopecks: null, taxKopecks: null, totalKopecks: null, ready: false, reason: 'items'};
    if (!Array.isArray(items) || !items.length || items.length > 50) return result;
    let subtotal = 0n, valid = true;
    for (const item of items) {
      const quantity = scaled(item?.quantity, 3, 1000000000n, true);
      const price = scaled(item?.unitPrice, 2, maximum);
      const line = quantity === null || price === null ? null : rounded(quantity * price, 1000n);
      result.lineTotals.push(line === null || line > maximum ? null : Number(line));
      if (line === null || line > maximum) valid = false;
      else subtotal += line;
    }
    if (!valid || subtotal > maximum) return result;
    result.subtotalKopecks = Number(subtotal);
    result.reason = 'tax';
    if (!tax || !['none', 'included', 'extra'].includes(tax.mode)) return result;
    const rate = scaled(tax.rate, 2, 3000n);
    if (rate === null || tax.mode === 'none' && rate !== 0n) return result;
    const vat = tax.mode === 'none' ? 0n : rounded(subtotal * rate, tax.mode === 'included' ? 10000n + rate : 10000n);
    const total = tax.mode === 'extra' ? subtotal + vat : subtotal;
    result.reason = 'total';
    if (total <= 0n || total > maximum) return result;
    Object.assign(result, {taxKopecks: Number(vat), totalKopecks: Number(total), ready: true, reason: ''});
    return result;
  }
  window.facadeQuotePreview18 = Object.freeze({calculate});
})();

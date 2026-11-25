/**
 * formatters.js
 * Consistent formatting utilities for screener configuration parameters
 * and dynamic screening funnel stage texts (HOM-205).
 */

export function formatPrice(val) {
  if (val === null || val === undefined || val === '') return '-';
  const num = Number(val);
  if (!Number.isFinite(num)) return '-';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${sign}$${abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(2)}`;
}

export function formatCompactNumber(val, prefix = '') {
  if (val === null || val === undefined || val === '') return '-';
  const num = Number(val);
  if (!Number.isFinite(num)) return '-';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  if (abs >= 1e12) {
    const formatted = abs / 1e12;
    return `${sign}${prefix}${formatted % 1 === 0 ? formatted.toFixed(0) : formatted.toFixed(1)}T`;
  }
  if (abs >= 1e9) {
    const formatted = abs / 1e9;
    return `${sign}${prefix}${formatted % 1 === 0 ? formatted.toFixed(0) : formatted.toFixed(1)}B`;
  }
  if (abs >= 1e6) {
    const formatted = abs / 1e6;
    return `${sign}${prefix}${formatted % 1 === 0 ? formatted.toFixed(0) : formatted.toFixed(1)}M`;
  }
  if (abs >= 1e3) {
    const formatted = abs / 1e3;
    return `${sign}${prefix}${formatted % 1 === 0 ? formatted.toFixed(0) : formatted.toFixed(1)}K`;
  }
  return `${sign}${prefix}${abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(2)}`;
}

export function getStage0Summary(config, status) {
  if (status === 'loading') {
    return 'Loading screener settings...';
  }
  if (status === 'error' || !config) {
    return 'Price >= -, Cap >= -, ADV >= -';
  }
  const price = formatPrice(config.min_price);
  const cap = formatCompactNumber(config.min_market_cap, '$');
  const adv = formatCompactNumber(config.min_volume);
  return `Price >= ${price}, Cap >= ${cap}, ADV >= ${adv}`;
}

export function getStage0Detail(config, status) {
  if (status === 'loading') {
    return 'Filter penny stocks, micro-caps, and thin liquidity (loading settings...).';
  }
  if (status === 'error' || !config) {
    return 'Filter penny stocks, micro-caps, and thin liquidity (Price >= -, Market Cap >= -, ADV >= -).';
  }
  const price = formatPrice(config.min_price);
  const cap = formatCompactNumber(config.min_market_cap, '$');
  const adv = formatCompactNumber(config.min_volume);
  return `Filter penny stocks, micro-caps, and thin liquidity (Price >= ${price}, Market Cap >= ${cap}, ADV >= ${adv}).`;
}

export function getStage3Summary(config, status) {
  if (status === 'loading') {
    return 'Momentum & RS Setup vs SPY (loading...)';
  }
  if (status === 'error' || !config) {
    return 'Momentum & RS Setup vs SPY';
  }
  if (config.min_rvol !== undefined && config.min_rvol !== null) {
    return `Momentum (RVOL >= ${config.min_rvol}x) & RS Setup vs SPY`;
  }
  return 'Momentum & RS Setup vs SPY';
}

export function getStage3Detail(config, status) {
  if (status === 'loading') {
    return 'Quantitative separation: Momentum or RS Setup (loading settings...).';
  }
  if (status === 'error' || !config) {
    return 'Quantitative separation: Momentum (strong trend & high RVOL) or RS Setup (tight consolidation near 52W high).';
  }
  if (config.min_rvol !== undefined && config.max_rvol !== undefined) {
    return `Quantitative separation: Momentum (strong trend, RVOL ${config.min_rvol}x-${config.max_rvol}x) or RS Setup (tight consolidation near 52W high).`;
  }
  if (config.min_rvol !== undefined) {
    return `Quantitative separation: Momentum (strong trend, RVOL >= ${config.min_rvol}x) or RS Setup (tight consolidation near 52W high).`;
  }
  return 'Quantitative separation: Momentum (strong trend & high RVOL) or RS Setup (tight consolidation near 52W high).';
}

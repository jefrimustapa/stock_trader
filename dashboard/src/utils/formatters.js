/**
 * formatters.js
 * Utiliti pemformatan konsisten bagi nilai konfigurasi parameter screener
 * dan teks dinamik peringkat corong saringan (HOM-205).
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
    return 'Memuatkan tetapan screener...';
  }
  if (status === 'error' || !config) {
    return 'Harga >= -, Cap >= -, ADV >= -';
  }
  const price = formatPrice(config.min_price);
  const cap = formatCompactNumber(config.min_market_cap, '$');
  const adv = formatCompactNumber(config.min_volume);
  return `Harga >= ${price}, Cap >= ${cap}, ADV >= ${adv}`;
}

export function getStage0Detail(config, status) {
  if (status === 'loading') {
    return 'Penyingkiran saham sen, modal terhad, dan volum nipis (memuatkan tetapan...).';
  }
  if (status === 'error' || !config) {
    return 'Penyingkiran saham sen, modal terhad, dan volum nipis (Harga >= -, Nilai Pasaran >= -, ADV >= -).';
  }
  const price = formatPrice(config.min_price);
  const cap = formatCompactNumber(config.min_market_cap, '$');
  const adv = formatCompactNumber(config.min_volume);
  return `Penyingkiran saham sen, modal terhad, dan volum nipis (Harga >= ${price}, Nilai Pasaran >= ${cap}, ADV >= ${adv}).`;
}

export function getStage3Summary(config, status) {
  if (status === 'loading') {
    return 'Momentum & Setup RS vs SPY (memuatkan...)';
  }
  if (status === 'error' || !config) {
    return 'Momentum & Setup RS vs SPY';
  }
  if (config.min_rvol !== undefined && config.min_rvol !== null) {
    return `Momentum (RVOL >= ${config.min_rvol}x) & Setup RS vs SPY`;
  }
  return 'Momentum & Setup RS vs SPY';
}

export function getStage3Detail(config, status) {
  if (status === 'loading') {
    return 'Pengasingan berasaskan logik kuantitatif: Momentum atau Setup (memuatkan tetapan...).';
  }
  if (status === 'error' || !config) {
    return 'Pengasingan berasaskan logik kuantitatif: Momentum (trend agresif & RVOL tinggi) atau Setup (konsolidasi rapi & hampiran 52W).';
  }
  if (config.min_rvol !== undefined && config.max_rvol !== undefined) {
    return `Pengasingan berasaskan logik kuantitatif: Momentum (trend agresif, RVOL ${config.min_rvol}x-${config.max_rvol}x) atau Setup (konsolidasi rapi & hampiran 52W).`;
  }
  if (config.min_rvol !== undefined) {
    return `Pengasingan berasaskan logik kuantitatif: Momentum (trend agresif, RVOL >= ${config.min_rvol}x) atau Setup (konsolidasi rapi & hampiran 52W).`;
  }
  return 'Pengasingan berasaskan logik kuantitatif: Momentum (trend agresif & RVOL tinggi) atau Setup (konsolidasi rapi & hampiran 52W).';
}

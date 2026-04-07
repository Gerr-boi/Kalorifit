export function priorityWeight(value) {
  return value === 'high' ? 3 : value === 'medium' ? 2 : 1;
}

export function deriveActiveLearningFromRecord(row) {
  const active = row?.active_learning && typeof row.active_learning === 'object' ? row.active_learning : null;
  if (active && active.candidate === true) {
    return {
      candidate: true,
      score: typeof active.score === 'number' ? active.score : 0,
      reasons: Array.isArray(active.reasons) ? active.reasons.map(String) : [],
      domain_key: typeof active.domain_key === 'string' ? active.domain_key : 'unknown',
    };
  }

  const analysis = row?.analysis && typeof row.analysis === 'object' ? row.analysis : {};
  const dataQuality = row?.data_quality && typeof row.data_quality === 'object' ? row.data_quality : {};
  const failureTags = Array.isArray(row?.failure_tags) ? row.failure_tags.map(String) : [];
  const reasons = [];
  let score = 0;

  const topConf = typeof analysis.top_match_confidence === 'number' ? analysis.top_match_confidence : null;
  const topMargin = typeof analysis.top_match_margin === 'number' ? analysis.top_match_margin : null;
  const predictedProduct = typeof row?.predicted_product === 'string' ? row.predicted_product.trim() : '';
  const qualityBucket = typeof dataQuality.quality_bucket === 'string' ? dataQuality.quality_bucket : null;
  const context = row?.context && typeof row.context === 'object' ? row.context : {};
  const deviceInfo = typeof context.device_info === 'string' ? context.device_info.toLowerCase() : '';
  const scanMode = typeof context.scan_mode === 'string' ? context.scan_mode : 'unknown';
  const platform = deviceInfo.includes('android')
    ? 'android'
    : deviceInfo.includes('iphone') || deviceInfo.includes('ios')
      ? 'ios'
      : deviceInfo.includes('win')
        ? 'windows'
        : deviceInfo.includes('mac')
          ? 'mac'
          : 'unknown';
  const browser = deviceInfo.includes('chrome') || deviceInfo.includes('crios')
    ? 'chrome'
    : deviceInfo.includes('safari')
      ? 'safari'
      : deviceInfo.includes('firefox')
        ? 'firefox'
        : deviceInfo.includes('edg')
          ? 'edge'
          : 'unknown';
  const domainKey = `${scanMode}:${platform}:${browser}`;

  if (topConf == null || topConf < 0.72) {
    reasons.push('low_confidence');
    score += 3;
  }
  if (topMargin == null || topMargin < 0.1) {
    reasons.push('candidate_disagreement');
    score += 3;
  }
  if (!predictedProduct) {
    reasons.push('open_set_or_unknown');
    score += 2;
  }
  if (row?.user_confirmed === false || (typeof row?.user_corrected_to === 'string' && row.user_corrected_to.trim()) || row?.not_food === true) {
    reasons.push('user_disagreed');
    score += 4;
  }
  if (qualityBucket === 'low') {
    reasons.push('poor_capture_quality');
    score += 2;
  }
  if (failureTags.includes('hard_negative_non_food')) {
    reasons.push('hard_negative_non_food');
    score += 5;
  }
  if (failureTags.includes('wrong_product_match')) {
    reasons.push('wrong_product_match');
    score += 5;
  }
  if (failureTags.includes('shelf_tag_noise')) {
    reasons.push('ignore_region_noise');
    score += 2;
  }

  return {
    candidate: reasons.length > 0,
    score,
    reasons: [...new Set(reasons)],
    domain_key: domainKey,
  };
}

/* ONE Web Navigation - pure route matching and formatting helpers. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NavCore = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';
  const R = Math.PI / 180;
  function point(obj) {
    if (!obj) return null;
    const lat = Number(typeof obj.lat === 'function' ? obj.lat() : obj.lat);
    const lng = Number(typeof obj.lng === 'function' ? obj.lng() : obj.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  function meters(a, b) {
    a = point(a); b = point(b);
    if (!a || !b) return Infinity;
    const dLat = (b.lat - a.lat) * R, dLng = (b.lng - a.lng) * R;
    const t = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(t)));
  }
  function project(p, a, b) {
    const lat0 = p.lat * R;
    const dx = (b.lng - a.lng) * R * Math.cos(lat0) * 6371000;
    const dy = (b.lat - a.lat) * R * 6371000;
    const px = (p.lng - a.lng) * R * Math.cos(lat0) * 6371000;
    const py = (p.lat - a.lat) * R * 6371000;
    const denominator = dx * dx + dy * dy;
    const t = denominator ? Math.max(0, Math.min(1, (px * dx + py * dy) / denominator)) : 0;
    return { t, crossTrack: Math.hypot(px - t * dx, py - t * dy), segmentLength: Math.hypot(dx, dy) };
  }
  function routeSteps(route) {
    return (route?.legs || []).flatMap(leg => leg.steps || []).map(s => ({
      maneuver: String(s.maneuver || ''), instructions: String(s.instructions || ''),
      distanceMeters: Number(s.distanceMeters || 0),
      path: (s.path || []).map(point).filter(Boolean),
      start: point(s.startLocation), end: point(s.endLocation)
    }));
  }
  function pathFor(step) {
    if (step.path.length >= 2) return step.path;
    return [step.start, step.end].filter(Boolean);
  }
  function matchRoute(position, steps) {
    const p = point(position);
    if (!p || !steps?.length) return null;
    let best = null;
    for (let i = 0; i < steps.length; i++) {
      const pts = pathFor(steps[i]);
      if (!pts.length) continue;
      if (pts.length === 1) {
        const crossTrack = meters(p, pts[0]);
        if (!best || crossTrack < best.crossTrack) best = { stepIndex: i, crossTrack, ratio: 0 };
        continue;
      }
      const lengths = pts.slice(1).map((v, j) => meters(pts[j], v));
      const length = lengths.reduce((a, b) => a + b, 0);
      let traveled = 0;
      for (let j = 0; j < pts.length - 1; j++) {
        const snapped = project(p, pts[j], pts[j + 1]);
        const ratio = length > 0 ? (traveled + snapped.t * lengths[j]) / length : 0;
        // At intersections, prefer the later segment for near-equivalent GPS matches.
        if (!best || snapped.crossTrack < best.crossTrack - 1 ||
            (Math.abs(snapped.crossTrack - best.crossTrack) <= 1 && i >= best.stepIndex)) {
          best = { stepIndex: i, crossTrack: snapped.crossTrack, ratio: Math.max(0, Math.min(1, ratio)) };
        }
        traveled += lengths[j];
      }
    }
    if (!best) return null;
    const i = best.stepIndex;
    const currentRemaining = (steps[i].distanceMeters || 0) * (1 - best.ratio);
    const later = steps.slice(i + 1).reduce((sum, s) => sum + (s.distanceMeters || 0), 0);
    return { ...best, metersToTurn: currentRemaining, metersRemaining: currentRemaining + later,
      nextIndex: Math.min(i + 1, steps.length - 1) };
  }
  function maneuverKind(value, instruction) {
    const s = (value || '').toUpperCase().replaceAll('-', '_');
    const text = (instruction || '').toLowerCase();
    if (s.includes('UTURN') || s.includes('U_TURN') || /quay đầu|quay dau|u-turn/.test(text)) return 'uturn';
    if (/ROUNDABOUT|ROTARY/.test(s) || /vòng xuyến|bùng binh/.test(text)) return 'roundabout';
    if (s.includes('LEFT') || /rẽ trái|chếch trái|bên trái|turn left|keep left/.test(text)) return 'left';
    if (s.includes('RIGHT') || /rẽ phải|chếch phải|bên phải|turn right|keep right/.test(text)) return 'right';
    if (/STRAIGHT|DEPART|MERGE|RAMP|NAME_CHANGE/.test(s) || /đi thẳng|tiếp tục đi|continue straight/.test(text)) return 'straight';
    return 'unknown';
  }
  function directionTitle(kind) {
    return ({ left: 'RẼ TRÁI', right: 'RẼ PHẢI', straight: 'ĐI THẲNG',
      uturn: 'QUAY ĐẦU', roundabout: 'VÒNG XUYẾN', arrived: 'ĐÃ ĐẾN', unknown: 'XEM BẢN ĐỒ' })[kind] || 'XEM BẢN ĐỒ';
  }
  function distanceLabel(n) {
    n = Math.max(0, Number(n) || 0);
    if (n < 100) return `${Math.round(n / 10) * 10} m`;
    if (n < 1000) return `${Math.round(n / 25) * 25} m`;
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')} km`;
  }
  function remainingLabel(n) { return `Còn ${distanceLabel(n)}`; }
  function shortInstruction(value) {
    const s = String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    return s.slice(0, 90) || 'Theo dõi chỉ dẫn trên điện thoại';
  }
  return { point, meters, project, routeSteps, pathFor, matchRoute, maneuverKind,
    directionTitle, distanceLabel, remainingLabel, shortInstruction };
});

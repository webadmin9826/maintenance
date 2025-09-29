// api/ticket/_helper.js
function daysInt(a, b) {
  const A = new Date(a).getTime();
  const B = new Date(b).getTime();
  if (!Number.isFinite(A) || !Number.isFinite(B)) return null;
  const diff = Math.max(0, Math.floor((A - B) / 86400000));
  return diff;
}

function computeProcessingAndTimeliness(doc) {
  const { dateReceived, dateRelease, targetDays } = doc || {};
  if (!dateRelease || !dateReceived) return { processingDays: null, timeliness: '' };
  const d = daysInt(dateRelease, dateReceived);
  if (d === null) return { processingDays: null, timeliness: '' };
  let timeliness = 'On time';
  if (typeof targetDays === 'number' && Number.isFinite(targetDays)) {
    timeliness = d <= targetDays ? 'On time' : `Delayed (${d - targetDays} days)`;
  } else {
    timeliness = d === 0 ? 'On time' : `Delayed (${d} days)`;
  }
  return { processingDays: d, timeliness };
}

module.exports = { computeProcessingAndTimeliness };

const TRIGGERS = {
  th: ['สำคัญ', 'สรุป', 'วิธี', 'ต้องรู้', 'ห้ามพลาด', 'เคล็ดลับ'],
  en: ['important', 'summary', 'how', 'must know', 'tip', 'secret'],
};

function overlap(range, selected) {
  return selected.some(
    (item) => Math.max(range.start, item.start) < Math.min(range.end, item.end),
  );
}

function segmentScore(segment, language, tone) {
  const text = segment.text.toLowerCase();
  const triggers = TRIGGERS[language] ?? TRIGGERS.en;
  const triggerHits = triggers.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
  const emphasis = (segment.text.match(/[!?]/g) ?? []).length;
  const toneBoost =
    tone === 'educational'
      ? Number(text.includes('วิธี') || text.includes('how'))
      : tone === 'energetic'
        ? emphasis
        : 0;

  return triggerHits * 5 + emphasis * 2 + toneBoost + Math.min(segment.text.length / 48, 4);
}

function buildCandidate(segments, index, targetLength, language, tone) {
  let startIndex = index;
  let endIndex = index;
  let duration = segments[index].end - segments[index].start;

  while (duration < targetLength && (startIndex > 0 || endIndex < segments.length - 1)) {
    const prev = startIndex > 0 ? segments[startIndex - 1] : null;
    const next = endIndex < segments.length - 1 ? segments[endIndex + 1] : null;
    const prevScore = prev ? segmentScore(prev, language, tone) : -1;
    const nextScore = next ? segmentScore(next, language, tone) : -1;

    if (nextScore >= prevScore && next) {
      endIndex += 1;
    } else if (prev) {
      startIndex -= 1;
    } else {
      break;
    }

    duration = segments[endIndex].end - segments[startIndex].start;
    if (duration >= targetLength * 1.25) {
      break;
    }
  }

  const selectedSegments = segments.slice(startIndex, endIndex + 1);
  const text = selectedSegments.map((item) => item.text).join(' ');

  return {
    start: selectedSegments[0].start,
    end: selectedSegments[selectedSegments.length - 1].end,
    duration: selectedSegments[selectedSegments.length - 1].end - selectedSegments[0].start,
    score: selectedSegments.reduce((total, item) => total + segmentScore(item, language, tone), 0),
    text,
    transcriptSegments: selectedSegments,
  };
}

export function detectHighlights({
  segments,
  language = 'th',
  tone = 'balanced',
  desiredClipLengthSec = 30,
  clipCount = 3,
  sourceLabel = 'Auto clip',
}) {
  const normalizedLanguage = language.toLowerCase().startsWith('th') ? 'th' : 'en';
  const ranked = segments
    .map((segment, index) => ({
      index,
      score: segmentScore(segment, normalizedLanguage, tone),
    }))
    .sort((left, right) => right.score - left.score);

  const selected = [];

  for (const item of ranked) {
    const candidate = buildCandidate(
      segments,
      item.index,
      desiredClipLengthSec,
      normalizedLanguage,
      tone,
    );

    if (!overlap(candidate, selected)) {
      selected.push(candidate);
    }

    if (selected.length >= clipCount) {
      break;
    }
  }

  if (!selected.length) {
    selected.push(
      buildCandidate(segments, 0, desiredClipLengthSec, normalizedLanguage, tone),
    );
  }

  return selected
    .sort((left, right) => left.start - right.start)
    .map((clip, index) => ({
      id: `clip-${index + 1}`,
      title: `${sourceLabel} highlight ${index + 1}`,
      summary: clip.text.slice(0, 180).trim(),
      ...clip,
    }));
}

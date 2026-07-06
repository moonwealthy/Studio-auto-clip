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
    let proposedStartIndex = startIndex;
    let proposedEndIndex = endIndex;

    if (nextScore >= prevScore && next) {
      proposedEndIndex += 1;
    } else if (prev) {
      proposedStartIndex -= 1;
    } else {
      break;
    }

    const proposedDuration =
      segments[proposedEndIndex].end - segments[proposedStartIndex].start;

    if (duration >= targetLength * 0.7 && proposedDuration > targetLength * 1.15) {
      break;
    }

    startIndex = proposedStartIndex;
    endIndex = proposedEndIndex;
    duration = proposedDuration;
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

  if (selected.length < clipCount) {
    for (let index = 0; index < segments.length; index += 1) {
      const candidate = buildCandidate(
        segments,
        index,
        Math.max(10, Math.round(desiredClipLengthSec * 0.6)),
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
  }

  if (selected.length < clipCount && segments.length) {
    const partitionSize = Math.max(1, Math.ceil(segments.length / clipCount));

    for (let startIndex = 0; startIndex < segments.length; startIndex += partitionSize) {
      const partition = segments.slice(startIndex, startIndex + partitionSize);
      const candidate = {
        start: partition[0].start,
        end: partition[partition.length - 1].end,
        duration: partition[partition.length - 1].end - partition[0].start,
        score: partition.reduce(
          (total, segment) => total + segmentScore(segment, normalizedLanguage, tone),
          0,
        ),
        text: partition.map((segment) => segment.text).join(' '),
        transcriptSegments: partition,
      };

      if (!overlap(candidate, selected)) {
        selected.push(candidate);
      }

      if (selected.length >= clipCount) {
        break;
      }
    }

    if (selected.length < clipCount) {
      for (const segment of segments) {
        const candidate = {
          start: segment.start,
          end: segment.end,
          duration: segment.end - segment.start,
          score: segmentScore(segment, normalizedLanguage, tone),
          text: segment.text,
          transcriptSegments: [segment],
        };

        if (!overlap(candidate, selected)) {
          selected.push(candidate);
        }

        if (selected.length >= clipCount) {
          break;
        }
      }
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

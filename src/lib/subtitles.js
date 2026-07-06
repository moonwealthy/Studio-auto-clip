function formatTimestamp(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(Math.floor(totalSeconds % 60)).padStart(2, '0');
  const milliseconds = String(Math.round((totalSeconds % 1) * 1000)).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function generateVtt(segments, clipStart) {
  const body = segments
    .map(
      (segment, index) => `${index + 1}
${formatTimestamp(segment.start - clipStart)} --> ${formatTimestamp(segment.end - clipStart)}
${segment.text}`,
    )
    .join('\n\n');

  return `WEBVTT\n\n${body}\n`;
}

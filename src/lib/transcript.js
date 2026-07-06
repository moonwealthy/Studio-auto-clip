const FALLBACK_LIBRARY = {
  th: [
    'นี่คือช่วงเปิดประเด็นที่สรุปภาพรวมของเนื้อหาแบบกระชับ',
    'ประเด็นสำคัญที่ต้องรู้คือการเลือกสิ่งที่ใช่และลงมือทำทันที',
    'วิธีที่ได้ผลคือแตกงานเป็นขั้นตอนสั้น ๆ และวัดผลทุกครั้ง',
    'สรุปสุดท้ายคือทำซ้ำสิ่งที่เวิร์กและตัดส่วนที่ไม่จำเป็นออก',
  ],
  en: [
    'This opening segment frames the main topic in a concise way.',
    'The key takeaway is to focus on the most important action first.',
    'A practical method is to break the workflow into small repeatable steps.',
    'The closing summary reinforces what matters and what should happen next.',
  ],
};

function splitTranscript(text) {
  const matches = text
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [])
    .map((segment) => segment.trim())
    .filter(Boolean);

  return matches.length ? matches : [text.trim()].filter(Boolean);
}

function estimateDuration(segment, language) {
  const words = language === 'th' ? Math.max(segment.length / 5, 4) : segment.split(/\s+/).filter(Boolean).length;
  return Math.min(12, Math.max(3, Math.round(words / 2.6)));
}

export function createTranscriptSegments({ transcriptHint, language = 'th', sourceLabel }) {
  const chosenLanguage = language.toLowerCase().startsWith('th') ? 'th' : 'en';
  const baseText = transcriptHint?.trim()
    ? transcriptHint.trim()
    : `${sourceLabel || 'Source video'}\n${FALLBACK_LIBRARY[chosenLanguage].join('\n')}`;

  const rawSegments = splitTranscript(baseText);
  let cursor = 0;

  return rawSegments.map((text, index) => {
    const duration = estimateDuration(text, chosenLanguage);
    const segment = {
      id: `segment-${index + 1}`,
      text,
      start: cursor,
      end: cursor + duration,
    };
    cursor += duration;
    return segment;
  });
}

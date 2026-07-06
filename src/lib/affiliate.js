const STYLE_LIBRARY = {
  th: [
    {
      key: 'ugc-confessional',
      name: 'UGC Confessional',
      hookPrefix: 'ใช้แล้วรู้สึกว่า',
      structure: ['hook', 'pain', 'benefit', 'cta'],
      visualDirection: 'Talking head + captions + comment-style overlays',
    },
    {
      key: 'problem-solution',
      name: 'Problem / Solution',
      hookPrefix: 'ถ้ายังเจอปัญหานี้อยู่',
      structure: ['pain', 'hook', 'benefit', 'cta'],
      visualDirection: 'Pain point opener + quick cuts + product close-up',
    },
    {
      key: 'listicle-proof',
      name: '3 Reasons / Proof',
      hookPrefix: '3 เหตุผลที่คนกำลังซื้อสิ่งนี้ตอนนี้',
      structure: ['hook', 'benefit', 'benefit', 'proof', 'cta'],
      visualDirection: 'Fast listicle with badges, screenshots, proof cards',
    },
    {
      key: 'before-after',
      name: 'Before / After',
      hookPrefix: 'ก่อนใช้กับหลังใช้ต่างกันยังไง',
      structure: ['pain', 'proof', 'benefit', 'cta'],
      visualDirection: 'Split-screen before-after + bold headline',
    },
    {
      key: 'expert-voiceover',
      name: 'Expert Voiceover',
      hookPrefix: 'มุมที่หลายคนมองข้ามคือ',
      structure: ['hook', 'benefit', 'proof', 'cta'],
      visualDirection: 'B-roll + voiceover + expert callout graphics',
    },
  ],
  en: [
    {
      key: 'ugc-confessional',
      name: 'UGC Confessional',
      hookPrefix: 'I tried this because',
      structure: ['hook', 'pain', 'benefit', 'cta'],
      visualDirection: 'Talking head + social proof captions',
    },
    {
      key: 'problem-solution',
      name: 'Problem / Solution',
      hookPrefix: 'If you are still dealing with this',
      structure: ['pain', 'hook', 'benefit', 'cta'],
      visualDirection: 'Pain point hook + fast cut solution reveal',
    },
    {
      key: 'listicle-proof',
      name: '3 Reasons / Proof',
      hookPrefix: 'Three reasons this is trending right now',
      structure: ['hook', 'benefit', 'benefit', 'proof', 'cta'],
      visualDirection: 'Listicle pacing with overlays and testimonial screenshots',
    },
    {
      key: 'before-after',
      name: 'Before / After',
      hookPrefix: 'Before this versus after this',
      structure: ['pain', 'proof', 'benefit', 'cta'],
      visualDirection: 'Before-after contrast + bold on-screen captions',
    },
    {
      key: 'expert-voiceover',
      name: 'Expert Voiceover',
      hookPrefix: 'Most people miss this advantage',
      structure: ['hook', 'benefit', 'proof', 'cta'],
      visualDirection: 'Voiceover script with B-roll and trust graphics',
    },
  ],
};

function normalizeLanguage(language = 'th') {
  return language.toLowerCase().startsWith('th') ? 'th' : 'en';
}

function extractPhrases(creativeBrief) {
  const phrases = creativeBrief
    .split(/\n|,|•|-/)
    .map((item) => item.trim())
    .filter(Boolean);

  return phrases.length ? phrases : [creativeBrief.trim()].filter(Boolean);
}

function inferAudience(creativeBrief, language) {
  const text = creativeBrief.toLowerCase();

  if (language === 'th') {
    if (text.includes('แม่') || text.includes('ครอบครัว')) return 'กลุ่มครอบครัวและแม่บ้าน';
    if (text.includes('นักเรียน') || text.includes('นักศึกษา')) return 'นักเรียนและวัยเริ่มทำงาน';
    if (text.includes('ออนไลน์') || text.includes('คอนเทนต์')) return 'สายคอนเทนต์และคนขายออนไลน์';
    return 'ผู้ซื้อออนไลน์ที่ต้องการตัดสินใจเร็ว';
  }

  if (text.includes('creator') || text.includes('content')) return 'creators and online sellers';
  if (text.includes('mom') || text.includes('family')) return 'busy families';
  if (text.includes('student')) return 'students and early-career buyers';
  return 'high-intent online shoppers';
}

function inferProductName(creativeBrief, sourceLabel, language) {
  const firstPhrase = extractPhrases(creativeBrief)[0];
  if (firstPhrase) {
    return firstPhrase.slice(0, 60);
  }

  return sourceLabel || (language === 'th' ? 'สินค้า affiliate' : 'affiliate product');
}

function buildLocalizedCopy({ type, language, productName, promise, audience, cta }) {
  if (language === 'th') {
    if (type === 'pain') return `หลายคนในกลุ่ม ${audience} ยังเสียเวลาเพราะยังไม่เจอวิธีที่ง่ายพอ`;
    if (type === 'benefit') return `${productName} ช่วยให้ ${promise} ได้แบบไม่ต้องทำหลายขั้นตอน`;
    if (type === 'proof') return `จุดขายที่ควรโชว์คือผลลัพธ์เร็ว รีวิวจริง และภาพก่อน-หลังที่ชัดเจน`;
    if (type === 'cta') return `${cta} พร้อมย้ำข้อเสนอและเหตุผลที่ควรกดตอนนี้`;
    return `${productName} คือทางลัดที่ช่วยให้ ${audience} เห็นผลไวขึ้น`;
  }

  if (type === 'pain') return `${audience} still wastes time because the process feels harder than it should.`;
  if (type === 'benefit') return `${productName} makes it easier to ${promise} without adding extra steps.`;
  if (type === 'proof') return `Show quick proof: real outcome, testimonial, and a visible before-after moment.`;
  if (type === 'cta') return `${cta} and reinforce why acting now matters.`;
  return `${productName} is the shortcut for ${audience} who want faster results.`;
}

export function createAffiliateStrategy({
  creativeBrief = '',
  language = 'th',
  tone = 'balanced',
  clipCount = 3,
  sourceLabel,
}) {
  const normalizedLanguage = normalizeLanguage(language);
  const phrases = extractPhrases(creativeBrief);
  const productName = inferProductName(creativeBrief, sourceLabel, normalizedLanguage);
  const audience = inferAudience(creativeBrief, normalizedLanguage);
  const promise =
    phrases[1]?.slice(0, 80) ||
    (normalizedLanguage === 'th'
      ? 'แก้ปัญหาได้ไวขึ้นและตัดสินใจซื้อได้ง่าย'
      : 'solve a clear problem faster and buy with confidence');
  const cta =
    normalizedLanguage === 'th'
      ? 'ปิดท้ายด้วย CTA ให้กดลิงก์ affiliate ใต้คลิป'
      : 'Close with a direct affiliate CTA to tap the link below';
  const stylePool = STYLE_LIBRARY[normalizedLanguage];

  const styles = stylePool.slice(0, Math.max(1, Math.min(clipCount, stylePool.length))).map((style, index) => ({
    ...style,
    order: index + 1,
    hook:
      normalizedLanguage === 'th'
        ? `${style.hookPrefix} ${productName} เพราะ ${promise}`
        : `${style.hookPrefix} ${productName} because it helps you ${promise}`,
    cta,
    angle:
      tone === 'energetic'
        ? normalizedLanguage === 'th'
          ? 'เปิดเร็ว ตัดไว เร่งอารมณ์ให้กดซื้อ'
          : 'Fast hook, fast pacing, urgency-driven CTA'
        : tone === 'educational'
          ? normalizedLanguage === 'th'
            ? 'อธิบายให้เข้าใจง่ายก่อนปิดการขาย'
            : 'Teach first, sell second, then close with proof'
          : normalizedLanguage === 'th'
            ? 'บาลานซ์ระหว่างความน่าเชื่อถือกับการปิดการขาย'
            : 'Balanced persuasion with proof and a confident CTA',
  }));

  return {
    mode: 'full-auto-affiliate',
    productName,
    audience,
    promise,
    cta,
    sourceLabel: sourceLabel || productName,
    styles,
    narrativeBlocks: {
      hook: styles.map((style) => style.hook),
      pain: buildLocalizedCopy({ type: 'pain', language: normalizedLanguage, productName, promise, audience, cta }),
      benefit: buildLocalizedCopy({ type: 'benefit', language: normalizedLanguage, productName, promise, audience, cta }),
      proof: buildLocalizedCopy({ type: 'proof', language: normalizedLanguage, productName, promise, audience, cta }),
      cta: buildLocalizedCopy({ type: 'cta', language: normalizedLanguage, productName, promise, audience, cta }),
    },
  };
}

export function createAffiliateTranscript({ strategy, desiredClipLengthSec = 30, language = 'th' }) {
  const normalizedLanguage = normalizeLanguage(language);
  let cursor = 0;

  return strategy.styles.flatMap((style, styleIndex) => {
    const segmentLength = Math.max(4, Math.round(desiredClipLengthSec / style.structure.length));

    return style.structure.map((part, segmentIndex) => {
      let text;
      if (part === 'hook') text = style.hook;
      else if (part === 'benefit') text = strategy.narrativeBlocks.benefit;
      else if (part === 'proof') text = strategy.narrativeBlocks.proof;
      else if (part === 'pain') text = strategy.narrativeBlocks.pain;
      else text = strategy.narrativeBlocks.cta;

      const segment = {
        id: `affiliate-${styleIndex + 1}-${segmentIndex + 1}`,
        text,
        start: cursor,
        end: cursor + segmentLength,
        styleKey: style.key,
        styleName: style.name,
      };
      cursor += segmentLength;
      return segment;
    });
  });
}

export function createAffiliateClips({ strategy, transcript, desiredClipLengthSec = 30 }) {
  return strategy.styles.map((style, index) => {
    const segments = transcript.filter((segment) => segment.styleKey === style.key);
    const start = segments[0]?.start ?? index * desiredClipLengthSec;
    const end = segments[segments.length - 1]?.end ?? start + desiredClipLengthSec;

    return {
      id: `clip-${index + 1}`,
      title: `${style.name} · ${strategy.productName}`,
      summary: style.angle,
      start,
      end,
      duration: end - start,
      score: strategy.styles.length - index,
      transcriptSegments: segments,
      affiliateStyle: {
        key: style.key,
        name: style.name,
        hook: style.hook,
        angle: style.angle,
        cta: style.cta,
        visualDirection: style.visualDirection,
      },
    };
  });
}

export function assignAffiliateStyles(clips, strategy) {
  return clips.map((clip, index) => {
    const style = strategy.styles[index % strategy.styles.length];
    return {
      ...clip,
      affiliateStyle: {
        key: style.key,
        name: style.name,
        hook: style.hook,
        angle: style.angle,
        cta: style.cta,
        visualDirection: style.visualDirection,
      },
    };
  });
}

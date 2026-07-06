import test from 'node:test';
import assert from 'node:assert/strict';
import { detectHighlights } from '../src/lib/highlights.js';

test('detectHighlights ranks strong trigger phrases and keeps clips non-overlapping', () => {
  const clips = detectHighlights({
    language: 'th',
    tone: 'educational',
    desiredClipLengthSec: 18,
    clipCount: 2,
    sourceLabel: 'Demo',
    segments: [
      { text: 'เกริ่นนำทั่วไป', start: 0, end: 5 },
      { text: 'ประเด็นสำคัญที่ต้องรู้คือการเริ่มจากภาพรวม', start: 5, end: 11 },
      { text: 'วิธีทำที่เร็วคือแบ่งเป็นขั้นตอน', start: 11, end: 17 },
      { text: 'สรุปสุดท้ายให้ลงมือทำทันที', start: 17, end: 22 },
      { text: 'ปิดท้ายแบบสบาย ๆ', start: 22, end: 28 },
    ],
  });

  assert.equal(clips.length, 2);
  assert.ok(clips[0].end <= clips[1].start || clips[1].end <= clips[0].start);
  assert.match(clips[0].summary, /สำคัญ|วิธี|สรุป/);
});

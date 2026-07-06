# Studio-auto-clip

MVP สำหรับระบบสร้างคลิปอัตโนมัติจากวิดีโอยาว 1 คลิป โดยเน้น workflow หลัก:

- รับไฟล์วิดีโอหรือ source URL
- สร้าง transcript segments
- หา highlight อัตโนมัติด้วยกติกา keyword + tone
- สร้าง subtitle VTT
- export manifest และ render plan สำหรับแต่ละ clip
- preview ผลลัพธ์ผ่านหน้าเว็บ

## สิ่งที่ทำได้ในเวอร์ชันนี้

- อัปโหลดไฟล์วิดีโอหรือใส่ลิงก์ต้นทาง
- ตั้งค่า language, tone, clip length, clip count และ aspect ratios
- ใช้ transcript hint เพื่อช่วยการคัด highlight
- ถ้าไม่มี transcript hint ระบบจะสร้าง transcript scaffold สำหรับ demo
- แสดง preview ของ clip candidates พร้อมปุ่ม jump, subtitle และ render plan

> หมายเหตุ: เวอร์ชันนี้ยังไม่ render MP4 จริง เพราะ environment ไม่มี FFmpeg ติดตั้งมาให้ จึง export เป็น manifest + render plan + VTT เพื่อให้ต่อยอด worker/renderer ภายหลังได้ทันที

## การเริ่มต้น

```bash
npm install
npm start
```

เปิด `http://localhost:3000`

## คำสั่งที่มี

```bash
npm test
npm run check
```

## โครงสร้างหลัก

- `/src/server.js` — Express server และ API
- `/src/lib/job-store.js` — จัดเก็บ job state ลงดิสก์
- `/src/lib/pipeline.js` — orchestration ของ ingest, transcription, highlight detection, publishing
- `/src/lib/highlights.js` — logic เลือกช่วงเด่น
- `/src/lib/subtitles.js` — สร้างไฟล์ VTT
- `/public` — หน้าเว็บสำหรับ submit job และ preview

## แนวทางต่อยอด

1. เปลี่ยน transcript scaffold เป็น Whisper/OpenAI integration จริง
2. เพิ่ม worker queue และ retry policy
3. ต่อ FFmpeg renderer เพื่อสร้าง MP4 สำหรับ 9:16, 1:1, 16:9
4. เพิ่ม branding template, auto publish และ analytics

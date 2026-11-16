import { GoogleGenAI } from '@google/genai';
import type { Part } from '@google/genai';
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, recordAppError, UPLOADS_DIR } from '../db.ts';
import { aiRateLimiter } from '../rateLimit.ts';

const router = Router();

const MAX_TOTAL_PDF_BYTES = 14 * 1024 * 1024; // 14 MB safety budget across attached PDFs

type ExplanationLevel = 'simple' | 'standard' | 'deep';

function getLevelInstruction(level: ExplanationLevel, userYear: number): string {
  switch (level) {
    case 'simple':
      return `مستوى الشرح المطلوب: مبسط جداً (للمبتدئ) — اشرح الفكرة خطوة بخطوة بلغة سهلة وأمثلة يومية واضحة بدون تعقيد رياضي أو برمجي زائد، وبما يناسب طالباً في الفرقة ${userYear}.`;
    case 'deep':
      return `مستوى الشرح المطلوب: متعمق واحترافي — قدّم تفصيلاً علمياً وتطبيقياً دقيقاً مع أمثلة تقنية ومعادلات أو خطوات عملية متقدمة تناسب طلاب الفرقة ${userYear}.`;
    default:
      return `مستوى الشرح المطلوب: متوسط ومتوازن — اشرح الجزئية بوضوح وتنظيم أكاديمي يناسب مستوى طالب في الفرقة ${userYear} مع ربط الفكرة بأمثلة من المنهج.`;
  }
}

router.post('/courses/:courseId/tutor', requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res) => {
  const { courseId } = req.params;
  const { question, level, history } = req.body as {
    question?: string;
    level?: ExplanationLevel;
    history?: Array<{ role: 'user' | 'model'; text: string }>;
  };

  if (!question?.trim()) {
    res.status(400).json({ error: 'يرجى كتابة الجزئية التي تريد شرحها أولاً.' });
    return;
  }

  const store = db.get();
  const course = store.courses.find((c) => c.id === courseId);
  if (!course) {
    res.status(404).json({ error: 'المادة غير موجودة.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'مفتاح Gemini API غير مهيأ على الخادم.' });
    return;
  }

  const courseSummaries = store.summaries.filter((s) => s.courseId === courseId);
  const usedSources: string[] = [];
  const parts: Part[] = [];
  let accumulatedPdfBytes = 0;

  for (const summary of courseSummaries) {
    if (summary.fileUrl) {
      const filePath = path.join(UPLOADS_DIR, path.basename(summary.fileUrl));
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (accumulatedPdfBytes + stat.size <= MAX_TOTAL_PDF_BYTES) {
          const pdfBuffer = fs.readFileSync(filePath);
          parts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfBuffer.toString('base64'),
            },
          });
          accumulatedPdfBytes += stat.size;
          usedSources.push(summary.fileName || summary.title);
        }
      }
    } else {
      usedSources.push(summary.title);
    }
  }

  const summariesText =
    courseSummaries.length > 0
      ? courseSummaries
          .map(
            (s, idx) =>
              `${idx + 1}. عنوان الملخص/الكتاب: ${s.title}\n   الوصف/المحتوى النصي: ${s.description}${
                s.fileName ? `\n   ملف PDF مرفق: ${s.fileName}` : ''
              }`
          )
          .join('\n\n')
      : 'لا توجد ملخصات أو كتب PDF مرفوعة لهذه المادة حتى الآن.';

  const chosenLevel: ExplanationLevel =
    level === 'simple' || level === 'deep' ? level : 'standard';

  const systemInstruction = `أنت "المدرس الذكي" الخاص بمادة "${course.title}" (${course.code}) على منصة MVIA التعليمية.
معلومات المادة:
- الفرقة الدراسية للمادة: الفرقة ${course.year}
- المسار: ${course.track}
- المحاضر: ${course.instructor}
- وصف المادة: ${course.description}

بيانات الطالب:
- الاسم: ${req.currentUser!.name}
- الفرقة الدراسية للطالب: الفرقة ${req.currentUser!.year}
- ${getLevelInstruction(chosenLevel, req.currentUser!.year)}

قواعد الشرح الصارمة:
1. اعتمد أولاً وبشكل أساسي على محتوى الكتب وملفات PDF والملخصات المرفوعة لهذه المادة فقط (المرفقة لك كملفات PDF ونصوص بالأسفل).
2. عند الشرح، اذكر اسم الكتاب أو الملخص الذي اعتمدت عليه إن وجد في المصادر المرفوعة.
3. إذا سأل الطالب عن جزئية غير موجودة بعد في الكتب أو الملخصات المرفوعة، نبّهه بلطف أن هذه النقطة غير مذكورة في الملفات المرفوعة حالياً ثم اشرحها له بمستواه الأكاديمي في سياق المادة.
4. اشرح باللغة العربية الواضحة والمنظمة (نقاط مرقّمة وأمثلة)، وتأكد أن الشرح يلائم مستوى الطالب المطلوب.
5. في نهاية الشرح قدّم سؤالاً صغيراً أو تمريناً سريعاً للتأكد من فهم الطالب للجزئية.`;

  const historyText =
    Array.isArray(history) && history.length > 0
      ? `\n\nسياق المحادثة السابقة:\n${history
          .slice(-6)
          .map((h) => `${h.role === 'user' ? 'الطالب' : 'المدرس الذكي'}: ${h.text}`)
          .join('\n')}`
      : '';

  const promptText = `الكتب والملخصات المسجلة لهذه المادة:\n${summariesText}${historyText}\n\nسؤال الطالب الحالي: ${question.trim()}`;

  parts.push({ text: promptText });

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction,
      },
    });

    res.json({
      reply:
        response.text ||
        'لم أتمكن من صياغة الشرح لهذه الجزئية، حاول إعادة صياغة سؤالك.',
      usedSources,
    });
  } catch (err) {
    console.error('Course AI Tutor Error:', err);
    recordAppError({
      source: 'ai',
      message: err instanceof Error ? err.message : 'Course tutor AI failure',
      path: `/api/courses/${courseId}/tutor`,
      userId: req.currentUser?.id,
      stack: err instanceof Error ? err.stack : undefined,
      notifyAdmin: true,
    });
    res.status(500).json({
      error: 'حدث خطأ أثناء الاتصال بالمدرس الذكي للمادة. حاول مرة أخرى.',
    });
  }
});

export default router;

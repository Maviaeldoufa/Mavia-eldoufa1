import { GoogleGenAI } from '@google/genai';
import { Router } from 'express';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { recordAppError } from '../db.ts';
import { aiRateLimiter } from '../rateLimit.ts';

const router = Router();

const SYSTEM_INSTRUCTION = `أنت المساعد الذكي الرسمي لمنصة "MVIA" (MVIA Educational Platform).
مهمتك مساعدة الطلاب على التعرف على المنصة والإجابة عن أسئلتهم حول الدفعات والمواد والـ GIS والبرمجة باللغة العربية الواضحة والودودة أو الإنجليزية حسب لغة الطالب.

معلومات دقيقة عن منصة MVIA:
1. المنصة مصممة خصيصاً لجميع الدفعات الدراسية من الفرقة الأولى حتى الفرقة الرابعة.
2. الأقسام الرئيسية داخل المنصة:
   - الرئيسية (Home): تحتوي على تعريف المنصة ولوحة التحكم الشخصية للطالب ومؤقتات أخبار الامتحانات القادمة ولوحة التصدر (Leaderboard)، بالإضافة إلى لوحة إدارة الأعضاء وزوار المنصة للأدمن.
   - الكورسات (Courses): تضم مواد ومجلدات كل فرقة دراسية على حدة بأغلفة صور مخصصة، وتشمل ملخصات قابلة للرفع والتحميل بصيغة PDF مع عداد المشاهدات، واختبارات تفاعلية، والمدرس الذكي داخل كل مادة.
   - التعلم (Learning): مكتبة روابط مباشرة لقنوات وشروحات يوتيوب ومنصات تعليمية عالمية، بالإضافة إلى مشغل المحاضرات الاحترافي بالترجمة والملاحظات وحفظ مكان التوقف.
   - حاسبة الـ GPA: جدول تفاعلي لحساب المعدل الفصلي (7 مواد داخل GPA + مادة خارج GPA).
   - Community: يضم روابط جروبات الدفعات، شات الدفعة المباشر، الدعم الفني عبر أيقونتي واتساب وتليجرام المباشرتين، ومساعد الذكاء الاصطناعي.
3. الأدمن يملك صلاحية إضافة المواد والمجلدات بأغلفة صور، رفع ملخصات PDF، إنشاء الاختبارات، إضافة المؤقتات، وإدارة الأعضاء.

أجب دائماً بإيجاز منظم ومفيد، وشجع الطالب على استكشاف القسم المناسب لسؤاله.`;

router.post('/ai/chat', requireAuth, aiRateLimiter, async (req: AuthenticatedRequest, res) => {
  const { message, history } = req.body as {
    message?: string;
    history?: Array<{ role: 'user' | 'model'; text: string }>;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: 'يرجى كتابة سؤالك أولاً.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'مفتاح Gemini API غير مهيأ على الخادم.' });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const userContext = `بيانات الطالب الحالي: الاسم ${req.currentUser!.name}، الفرقة الدراسية: ${req.currentUser!.year}، النقاط: ${req.currentUser!.points}.`;
    const conversationContext = Array.isArray(history) && history.length > 0
      ? history
          .slice(-6)
          .map((h) => `${h.role === 'user' ? 'الطالب' : 'مساعد MVIA'}: ${h.text}`)
          .join('\n') + `\nالطالب: ${message.trim()}`
      : message.trim();

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `${userContext}\n\n${conversationContext}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    res.json({
      reply: response.text || 'أهلاً بك في منصة MVIA! كيف يمكنني مساعدتك اليوم؟',
    });
  } catch (err) {
    console.error('Gemini API Error:', err);
    recordAppError({
      source: 'ai',
      message: err instanceof Error ? err.message : 'Gemini chat API failure',
      path: '/api/ai/chat',
      userId: req.currentUser?.id,
      stack: err instanceof Error ? err.stack : undefined,
      notifyAdmin: true,
    });
    res.status(500).json({
      error: 'حدث خطأ أثناء الاتصال بمساعد الذكاء الاصطناعي. حاول مرة أخرى.',
    });
  }
});

export default router;

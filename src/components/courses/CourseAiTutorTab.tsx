import { BookCheck, GraduationCap, Send } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { Course, SummaryItem } from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';

type ExplanationLevel = 'simple' | 'standard' | 'deep';

interface TutorMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  sources?: string[];
}

interface CourseAiTutorTabProps {
  course: Course;
  summaries: SummaryItem[];
}

export function CourseAiTutorTab({ course, summaries }: CourseAiTutorTabProps) {
  const { user } = useAuth();
  const { tr, formatYear } = useLanguage();
  const [level, setLevel] = useState<ExplanationLevel>('standard');
  const [messages, setMessages] = useState<TutorMessage[]>([
    {
      id: 'tutor-welcome',
      role: 'model',
      text: tr(
        `أهلاً بك في المدرس الذكي لمادة "${course.title}". اكتب أي جزئية مش فاهمها، وسأشرحها لك بمستواك (${
          user ? formatYear(user.year) : 'الجامعي'
        }) بالاعتماد على الكتب وملخصات الـ PDF المرفوعة لهذه المادة.`,
        `Welcome to the AI Course Tutor for "${course.title}". Ask about any topic you find tricky, and I will explain it at your level (${
          user ? formatYear(user.year) : 'University'
        }) grounded in the uploaded books and PDF summaries for this course.`
      ),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const LEVELS: Array<{ id: ExplanationLevel; label: string }> = [
    { id: 'simple', label: tr('شرح مبسط جداً', 'Very Simple') },
    { id: 'standard', label: tr('بمستوى دفعتي', 'My Year Level') },
    { id: 'deep', label: tr('شرح متعمق', 'Deep Dive') },
  ];

  const starterQuestions = [
    tr(
      `اشرح لي أهم المفاهيم الأساسية في ${course.title}`,
      `Explain the core concepts in ${course.title}`
    ),
    tr(
      'لخّص لي النقاط المهمة من الملخصات المرفوعة',
      'Summarize the key points from the uploaded summaries'
    ),
    tr(
      'أعطني مثالاً عملياً مبسطاً لأصعب جزئية في المادة',
      'Give me a simple practical example of the hardest topic'
    ),
  ];

  const askTutor = async (questionText: string) => {
    const clean = questionText.trim();
    if (!clean || loading) return;

    const userMsg: TutorMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: clean,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 30);

    try {
      const data = await apiRequest<{ reply: string; usedSources: string[] }>(
        `/api/courses/${course.id}/tutor`,
        {
          method: 'POST',
          body: JSON.stringify({
            question: clean,
            level,
            history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          }),
        }
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply,
          sources: data.usedSources,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          text:
            err instanceof Error
              ? err.message
              : tr(
                  'تعذر الاتصال بالمدرس الذكي للمادة الآن.',
                  'Could not reach the AI Course Tutor right now.'
                ),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 30);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askTutor(input);
  };

  return (
    <div className="space-y-4">
      {/* Grounded Sources & Explanation Level Controls */}
      <div className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[#E5C158] font-semibold">
            <GraduationCap className="w-4 h-4 shrink-0" />
            <span>
              {tr('اختر مستوى الشرح المناسب لك:', 'Choose your explanation level:')}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {LEVELS.map((lvl) => (
              <GoldChip
                key={lvl.id}
                active={level === lvl.id}
                layoutId="course-tutor-level"
                onClick={() => setLevel(lvl.id)}
                className="text-xs px-3 py-1.5"
              >
                {lvl.label}
              </GoldChip>
            ))}
          </div>
        </div>

        <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs text-[#A8A29E]">
          <BookCheck className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
          <span>
            {tr('المصادر المعتمدة للشرح في هذه المادة:', 'Course reference sources:')}
          </span>
          {summaries.length === 0 ? (
            <span>
              {tr(
                'لا توجد ملخصات أو كتب مرفوعة بعد (سيتعرف عليها تلقائياً بمجرد رفعها).',
                'No books or summaries uploaded yet (will be indexed automatically once uploaded).'
              )}
            </span>
          ) : (
            <span className="text-[#C8C2B8]">
              {summaries.map((s) => s.fileName || s.title).join(' · ')}
            </span>
          )}
        </div>
      </div>

      {/* Quick Starter Questions */}
      <div className="flex flex-wrap items-center gap-2">
        {starterQuestions.map((q) => (
          <GoldChip
            key={q}
            onClick={() => askTutor(q)}
            className="text-xs px-3 py-1.5"
          >
            {q}
          </GoldChip>
        ))}
      </div>

      {/* Tutor Conversation */}
      <div
        ref={scrollRef}
        className="h-[340px] overflow-y-auto rounded-xl bg-[#09090B] border border-white/10 p-4 space-y-3"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[88%] rounded-xl px-4 py-3 border text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-[#D4AF37]/15 border-[#D4AF37]/40 text-[#F5F0E6]'
                  : 'bg-[#151519] border-white/10 text-[#F5F0E6]'
              }`}
            >
              {m.role === 'model' && (
                <div className="flex items-center gap-1.5 text-xs text-[#E5C158] font-semibold mb-1">
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>
                    {tr('المدرس الذكي', 'AI Tutor')} — {course.code}
                  </span>
                </div>
              )}
              <p>{m.text}</p>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10 text-[11px] text-[#A8A29E]">
                  {tr('اعتمد على:', 'Grounded in:')} {m.sources.join(' · ')}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-end">
            <div className="rounded-xl px-4 py-2.5 bg-[#151519] border border-white/10 text-xs text-[#D4AF37]">
              {tr(
                'جاري قراءة الكتب والملخصات وصياغة الشرح بمستواك...',
                'Reading uploaded books & summaries to craft your explanation...'
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ask Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tr(
            'اكتب الجزئية التي لم تفهمها في هذه المادة...',
            'Ask about any topic you need explained in this course...'
          )}
          className="flex-1 px-4 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] placeholder-[#6B6661] focus:outline-none focus:border-[#D4AF37]"
        />
        <GoldChip
          type="submit"
          active={true}
          disabled={loading || !input.trim()}
          className="px-5 py-2.5"
        >
          <Send className="w-4 h-4" />
          <span>{tr('اشرح لي', 'Explain')}</span>
        </GoldChip>
      </form>
    </div>
  );
}

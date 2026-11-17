import { Bot, Send } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';

interface AiMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export function AiChatbotTab() {
  const { tr } = useLanguage();

  const SUGGESTIONS = [
    tr('عرّفني على منصة MAVIA وأقسامها', 'Introduce MAVIA platform and its sections'),
    tr(
      'كيف أصل لملخصات واختبارات دفعتي؟',
      'How do I access my year summaries & quizzes?'
    ),
    tr('كيف تُحسب النقاط في لوحة التصدر؟', 'How are leaderboard points calculated?'),
    tr(
      'ما هي أفضل مصادر تعلم GIS والبرمجة هنا؟',
      'What are the best GIS & Programming resources here?'
    ),
  ];

  const [messages, setMessages] = useState<AiMessage[]>([
    {
      id: 'ai-welcome',
      role: 'model',
      text: tr(
        'أهلاً بك في منصة MAVIA! أنا المساعد الذكي الخاص بالمنصة. اسألني عن أي قسم، كيفية استخدام حاسبة الـ GPA، مواد GIS والبرمجة، أو طريقة جمع النقاط في لوحة التصدر.',
        'Welcome to MAVIA! I am your platform AI Assistant. Ask me about any section, the GPA calculator, GIS & Programming courses, or how leaderboard points work.'
      ),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sendMessage = async (textToSend: string) => {
    const clean = textToSend.trim();
    if (!clean || loading) return;

    const userMsg: AiMessage = {
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
      const data = await apiRequest<{ reply: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: clean,
          history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      setMessages((prev) => [
        ...prev,
        { id: `m-${Date.now()}`, role: 'model', text: data.reply },
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
                  'تعذر الحصول على رد الآن، حاول مرة أخرى.',
                  'Could not get a reply right now, please try again.'
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
    sendMessage(input);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {SUGGESTIONS.map((s) => (
          <GoldChip
            key={s}
            onClick={() => sendMessage(s)}
            className="text-xs px-3 py-1.5"
          >
            {s}
          </GoldChip>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="h-[360px] overflow-y-auto rounded-xl bg-[#09090B] border border-white/10 p-4 space-y-3"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 border text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-[#D4AF37]/15 border-[#D4AF37]/40 text-[#F5F0E6]'
                  : 'bg-[#151519] border-white/10 text-[#F5F0E6]'
              }`}
            >
              {m.role === 'model' && (
                <div className="flex items-center gap-1.5 text-xs text-[#E5C158] font-semibold mb-1">
                  <Bot className="w-3.5 h-3.5" />
                  <span>{tr('مساعد MAVIA الذكي', 'MAVIA AI Guide')}</span>
                </div>
              )}
              <p>{m.text}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-end">
            <div className="rounded-xl px-4 py-2.5 bg-[#151519] border border-white/10 text-xs text-[#D4AF37]">
              {tr('جاري التفكير...', 'Thinking...')}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tr(
            'اسأل مساعد MAVIA الذكي عن أي شيء في المنصة...',
            'Ask MAVIA AI Assistant anything about the platform...'
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
          <span>{tr('اسأل', 'Ask')}</span>
        </GoldChip>
      </form>
    </div>
  );
}

import { CheckCircle2, Clock, LifeBuoy, Send } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { SupportTicket } from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';

export function SupportTicketsTab() {
  const { tr } = useLanguage();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState<SupportTicket['category']>('bug');
  const [subject, setSubject] = useState('');
  const [section, setSection] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ tickets: SupportTicket[] }>('/api/support/tickets');
      setTickets(res.tickets);
    } catch {
      // Ignore silent load errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ ticket: SupportTicket }>('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          description: description.trim(),
          section: section.trim() || undefined,
        }),
      });
      setTickets((prev) => [res.ticket, ...prev]);
      setSubject('');
      setSection('');
      setDescription('');
      setSuccess(
        tr(
          'تم إرسال بلاغك بنجاح إلى إدارة المنصة، وسيتم الرد عليك هنا.',
          'Your support ticket was submitted. Admin replies will appear below.'
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('تعذر إرسال البلاغ.', 'Failed to submit support ticket.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const categoryLabel = (c: SupportTicket['category']) => {
    switch (c) {
      case 'bug':
        return tr('عطل تقني', 'Technical Bug');
      case 'course':
        return tr('مشكلة في مادة أو ملف', 'Course / File Issue');
      case 'account':
        return tr('حساب وصلاحيات', 'Account Issue');
      default:
        return tr('اقتراح تحسين', 'Suggestion');
    }
  };

  const statusBadge = (s: SupportTicket['status']) => {
    if (s === 'resolved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/50 border border-emerald-500/40 text-[11px] text-emerald-300">
          <CheckCircle2 className="w-3 h-3" />
          <span>{tr('تم الحل', 'Resolved')}</span>
        </span>
      );
    }
    if (s === 'in_review') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/50 border border-amber-500/40 text-[11px] text-amber-200">
          <Clock className="w-3 h-3" />
          <span>{tr('قيد المراجعة', 'In Review')}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#18181D] border border-white/15 text-[11px] text-[#C8C2B8]">
        <span>{tr('مفتوح', 'Open')}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold text-[#E5C158] flex items-center gap-2">
          <LifeBuoy className="w-5 h-5" />
          <span>{tr('تذاكر الدعم الفني والإبلاغ عن المشكلات', 'Support & Issue Reporting')}</span>
        </h2>
        <p className="text-xs text-[#A8A29E]">
          {tr(
            'أرسل أي مشكلة تقنية أو رابط معطل أو استفسار مباشرة داخل المنصة بدون الحاجة لإرسال رسائل خارجية.',
            'Report technical issues, broken files, or questions privately inside MVIA.'
          )}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-4 sm:p-5 rounded-2xl bg-[#09090B] border border-[#D4AF37]/30 space-y-3"
      >
        {error && (
          <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/40 text-xs text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportTicket['category'])}
            className="px-3 py-2.5 rounded-xl bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
          >
            <option value="bug">{tr('عطل تقني', 'Technical Bug')}</option>
            <option value="course">{tr('مشكلة في مادة أو ملف', 'Course / File Issue')}</option>
            <option value="account">{tr('حساب وصلاحيات', 'Account Issue')}</option>
            <option value="suggestion">{tr('اقتراح تحسين', 'Suggestion')}</option>
          </select>

          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={tr('عنوان المشكلة (مثال: ملف PDF لا يفتح)', 'Issue subject...')}
            className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
          />
        </div>

        <input
          type="text"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          placeholder={tr('اسم المادة أو القسم المتأثر (اختياري)', 'Affected course or section (optional)')}
          className="w-full px-3.5 py-2 rounded-xl bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
        />

        <textarea
          rows={3}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={tr(
            'اشرح المشكلة بالتفصيل وما الخطوة التي ظهر عندها الخطأ...',
            'Describe the issue in detail and how to reproduce it...'
          )}
          className="w-full px-3.5 py-2.5 rounded-xl bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
        />

        <div className="flex justify-end">
          <GoldChip type="submit" active={true} disabled={submitting} className="text-xs px-4 py-2">
            <Send className="w-3.5 h-3.5" />
            <span>{submitting ? tr('جاري الإرسال...', 'Submitting...') : tr('إرسال البلاغ', 'Submit Ticket')}</span>
          </GoldChip>
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="font-display text-sm font-bold text-[#F5F0E6]">
          {tr('بلاغاتي السابقة', 'My Support Tickets')} ({tickets.length})
        </h3>

        {loading ? (
          <div className="py-6 text-center text-xs text-[#A8A29E]">
            {tr('جاري تحميل التذاكر...', 'Loading tickets...')}
          </div>
        ) : tickets.length === 0 ? (
          <div className="py-8 text-center rounded-xl bg-[#0D0D10] border border-white/10 text-xs text-[#A8A29E]">
            {tr('لم تقم بإرسال أي بلاغات دعم فني حتى الآن.', 'No support tickets submitted yet.')}
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-[#F5F0E6]">{t.subject}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#151519] text-[#D4AF37]">
                      {categoryLabel(t.category)}
                    </span>
                  </div>
                  {statusBadge(t.status)}
                </div>

                <p className="text-xs text-[#C8C2B8] leading-relaxed">{t.description}</p>

                {t.adminReply && (
                  <div className="p-3 rounded-lg bg-[#151519] border border-[#D4AF37]/30 space-y-1">
                    <div className="text-[11px] font-semibold text-[#E5C158]">
                      {tr('رد الإدارة', 'Admin Reply')} {t.repliedBy ? `(${t.repliedBy})` : ''}
                    </div>
                    <p className="text-xs text-[#F5F0E6]">{t.adminReply}</p>
                  </div>
                )}

                <div className="text-[11px] text-[#A8A29E] font-mono tabular-nums">
                  {new Date(t.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

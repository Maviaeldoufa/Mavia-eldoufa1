import { Bell, CheckCheck, Plus, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { NavSection, NotificationItem } from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from './GoldChip';

interface NotificationsBellProps {
  onNavigate: (section: NavSection) => void;
}

export function NotificationsBell({ onNavigate }: NotificationsBellProps) {
  const { user } = useAuth();
  const { tr, isEn, formatYear } = useLanguage();
  const isAdmin = user?.role === 'admin';

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Admin quick compose inside bell popover
  const [showCompose, setShowCompose] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetSection, setTargetSection] = useState<NavSection>('courses');
  const [year, setYear] = useState<number>(0);
  const [sending, setSending] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const data = await apiRequest<{
        notifications: NotificationItem[];
        unreadCount: number;
      }>('/api/notifications');
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        open &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      apiRequest(`/api/notifications/${item.id}/read`, { method: 'POST' }).catch(
        () => {}
      );
    }
    onNavigate(item.targetSection);
    setOpen(false);
  };

  const handleDeleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest(`/api/notifications/${id}`, { method: 'DELETE' });
      setNotifications((prev) => {
        const target = prev.find((n) => n.id === id);
        if (target && !target.read) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        return prev.filter((n) => n.id !== id);
      });
    } catch {
      // Ignore
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      const res = await apiRequest<{ notification: NotificationItem }>(
        '/api/notifications',
        {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            message: message.trim(),
            type: 'general',
            targetSection,
            year,
          }),
        }
      );
      setNotifications((prev) => [res.notification, ...prev]);
      setUnreadCount((c) => c + 1);
      setTitle('');
      setMessage('');
      setShowCompose(false);
    } catch {
      // Ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <motion.button
        type="button"
        onClick={() => {
          setOpen((p) => !p);
          if (!open) loadNotifications();
        }}
        whileTap={{ scale: 0.94 }}
        aria-label={tr('الإشعارات', 'Notifications')}
        title={tr('مركز الإشعارات', 'Notifications')}
        className={`relative p-2 rounded-lg border transition-colors cursor-pointer ${
          open
            ? 'bg-[#D4AF37] border-[#E5C158] text-[#09090B]'
            : 'bg-[#151519] border-white/10 text-[#F5F0E6] hover:border-[#D4AF37]/60 hover:text-[#F5D061]'
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-mono font-bold tabular-nums flex items-center justify-center border border-[#09090B]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={`fixed sm:absolute top-16 sm:top-full sm:mt-2 ${
              isEn ? 'end-4 sm:end-0' : 'end-4 sm:end-0'
            } w-[calc(100vw-2rem)] sm:w-96 max-h-[75vh] flex flex-col rounded-2xl bg-[#121216] border border-[#D4AF37]/40 shadow-[0_24px_60px_rgba(0,0,0,0.85)] z-50 overflow-hidden`}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10 bg-[#0D0D10] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#D4AF37]" />
                <span className="font-display text-sm font-bold text-[#F5F0E6]">
                  {tr('الإشعارات', 'Notifications')}
                </span>
                {unreadCount > 0 && (
                  <span className="text-[11px] font-mono tabular-nums text-[#E5C158]">
                    ({unreadCount})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowCompose((p) => !p)}
                    className="p-1.5 rounded-lg text-xs text-[#D4AF37] hover:bg-[#D4AF37]/15 cursor-pointer"
                    title={tr('إرسال إشعار للطلاب', 'Broadcast notification')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[#C8C2B8] hover:text-[#E5C158] hover:bg-white/5 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>{tr('قرأت الكل', 'Mark all')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg text-[#A8A29E] hover:text-white cursor-pointer"
                  aria-label={tr('إغلاق', 'Close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Admin Quick Notification Broadcast */}
            {isAdmin && showCompose && (
              <form
                onSubmit={handleSendBroadcast}
                className="p-3.5 border-b border-white/10 bg-[#09090B] space-y-2.5"
              >
                <div className="text-xs font-semibold text-[#E5C158]">
                  {tr('إرسال إشعار فوري للطلاب', 'Send Instant Notification')}
                </div>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr('عنوان الإشعار', 'Notification title')}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                />
                <textarea
                  rows={2}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={tr('تفاصيل التنبيه...', 'Message details...')}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={targetSection}
                    onChange={(e) => setTargetSection(e.target.value as NavSection)}
                    className="px-2 py-1.5 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6]"
                  >
                    <option value="home">{tr('الرئيسية', 'Home')}</option>
                    <option value="courses">{tr('الكورسات', 'Courses')}</option>
                    <option value="learning">{tr('المحاضرات (Learning)', 'Learning')}</option>
                    <option value="gpa">{tr('حاسبة GPA', 'GPA')}</option>
                    <option value="community">Community</option>
                  </select>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="px-2 py-1.5 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6]"
                  >
                    <option value={0}>{tr('جميع الدفعات', 'All Years')}</option>
                    <option value={1}>{formatYear(1)}</option>
                    <option value={2}>{formatYear(2)}</option>
                    <option value={3}>{formatYear(3)}</option>
                    <option value={4}>{formatYear(4)}</option>
                  </select>
                </div>
                <div className="flex justify-end">
                  <GoldChip
                    type="submit"
                    active={true}
                    disabled={sending}
                    className="text-xs px-3 py-1.5"
                  >
                    {sending ? tr('جاري الإرسال...', 'Sending...') : tr('نشر الإشعار', 'Send')}
                  </GoldChip>
                </div>
              </form>
            )}

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {notifications.length === 0 ? (
                <div className="py-10 px-4 text-center text-xs text-[#A8A29E]">
                  {tr('لا توجد إشعارات جديدة حالياً.', 'No notifications right now.')}
                </div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3.5 hover:bg-white/[0.03] transition-colors cursor-pointer flex items-start justify-between gap-2.5 ${
                      item.read ? 'opacity-75' : 'bg-[#D4AF37]/[0.06]'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!item.read && (
                          <span className="w-2 h-2 rounded-full bg-[#E5C158] shrink-0" />
                        )}
                        <h4 className="text-xs font-bold text-[#F5F0E6] truncate">
                          {item.title}
                        </h4>
                      </div>
                      <p className="text-[11px] text-[#C8C2B8] leading-relaxed line-clamp-2">
                        {item.message}
                      </p>
                      <div className="text-[10px] text-[#A8A29E] font-mono tabular-nums">
                        {item.year === 0 ? tr('كل الدفعات', 'All Years') : formatYear(item.year)} ·{' '}
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteNotification(item.id, e)}
                        className="p-1 text-red-400 hover:text-red-300 shrink-0 cursor-pointer"
                        aria-label={tr('حذف الإشعار', 'Delete notification')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

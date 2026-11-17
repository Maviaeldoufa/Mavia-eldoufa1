import {
  Activity,
  AlertOctagon,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  Eye,
  LifeBuoy,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  Wrench,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type {
  AdminAnalyticsData,
  AppErrorLog,
  BackupFileInfo,
  MaintenanceState,
  PlatformConfig,
  SupportTicket,
} from '../../types';
import { apiRequest, getStoredToken, resolveApiUrl } from '../../utils/api';
import { hasAdminPermission, hasAnyAdminPermission } from '../../utils/permissions';
import { GoldChip } from '../ui/GoldChip';

type AdminPanelTab = 'analytics' | 'support' | 'system';

export function AdminAnalyticsPanel() {
  const { user } = useAuth();
  const { tr, formatYear } = useLanguage();
  const [activeTab, setActiveTab] = useState<AdminPanelTab>('analytics');

  const [analytics, setAnalytics] = useState<AdminAnalyticsData | null>(null);
  const [config, setConfig] = useState<PlatformConfig>({
    whatsappNumber: '01159637247',
    telegramUrl: 'https://t.me/+201159637247',
  });
  const [showConfig, setShowConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Support Desk state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);

  // System & Backups state
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [errors, setErrors] = useState<AppErrorLog[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceState>({
    enabled: false,
    message: 'نقوم حالياً بأعمال صيانة وتحديثات لتحسين أداء المنصة. سنعود قريباً.',
  });
  const [systemBusy, setSystemBusy] = useState(false);
  const [systemMsg, setSystemMsg] = useState<string | null>(null);
  const [systemErr, setSystemErr] = useState<string | null>(null);

  const loadAnalytics = async () => {
    try {
      const data = await apiRequest<AdminAnalyticsData>('/api/admin/analytics');
      setAnalytics(data);
    } catch {
      // Ignore
    }
  };

  const loadTickets = async () => {
    try {
      const res = await apiRequest<{ tickets: SupportTicket[] }>('/api/support/tickets');
      setTickets(res.tickets);
    } catch {
      // Ignore
    }
  };

  const loadSystemData = async () => {
    try {
      const [bRes, eRes, sRes] = await Promise.all([
        apiRequest<{ backups: BackupFileInfo[] }>('/api/admin/system/backups'),
        apiRequest<{ errors: AppErrorLog[] }>('/api/admin/system/errors'),
        fetch(resolveApiUrl('/api/status')).then((r) => (r.ok ? r.json() : null)),
      ]);
      setBackups(bRes.backups);
      setErrors(eRes.errors);
      if (sRes?.maintenance) {
        setMaintenance(sRes.maintenance);
      }
    } catch {
      // Ignore
    }
  };

  const canViewSensitive = hasAdminPermission(user, 'view_sensitive_data');
  const canManageSupport = hasAdminPermission(user, 'manage_support');
  const canSeePanel = hasAnyAdminPermission(user, [
    'view_sensitive_data',
    'manage_support',
  ]);

  useEffect(() => {
    if (!canSeePanel) return;
    if (canViewSensitive) {
      loadAnalytics();
    } else if (canManageSupport) {
      setActiveTab('support');
    }
    fetch(resolveApiUrl('/api/platform/config'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.config) setConfig(d.config);
      })
      .catch(() => {});
  }, [user?.id, canSeePanel, canViewSensitive, canManageSupport]);

  useEffect(() => {
    if (!canSeePanel) return;
    if (activeTab === 'support' && canManageSupport) loadTickets();
    if (activeTab === 'system' && canViewSensitive) loadSystemData();
  }, [activeTab, canSeePanel, canManageSupport, canViewSensitive]);

  if (!canSeePanel) {
    return null;
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSaved(false);
    setConfigError(null);
    try {
      const res = await apiRequest<{ config: PlatformConfig }>(
        '/api/admin/platform/config',
        {
          method: 'PUT',
          body: JSON.stringify(config),
        }
      );
      setConfig(res.config);
      setConfigSaved(true);
    } catch (err) {
      setConfigError(
        err instanceof Error
          ? err.message
          : tr('تعذر حفظ الإعدادات.', 'Failed to save support settings.')
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const handleUpdateTicket = async (
    ticketId: string,
    status: SupportTicket['status'],
    reply?: string
  ) => {
    setSavingTicketId(ticketId);
    try {
      const res = await apiRequest<{ ticket: SupportTicket }>(
        `/api/admin/support/tickets/${ticketId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status,
            ...(reply !== undefined ? { adminReply: reply } : {}),
          }),
        }
      );
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? res.ticket : t)));
      loadAnalytics();
    } catch {
      // Ignore
    } finally {
      setSavingTicketId(null);
    }
  };

  const handleCreateBackup = async () => {
    setSystemBusy(true);
    setSystemMsg(null);
    setSystemErr(null);
    try {
      const res = await apiRequest<{ backup: BackupFileInfo }>(
        '/api/admin/system/backups',
        { method: 'POST' }
      );
      setBackups((prev) => [res.backup, ...prev]);
      setSystemMsg(tr('تم إنشاء نسخة احتياطية جديدة بنجاح.', 'Backup snapshot created.'));
    } catch (err) {
      setSystemErr(err instanceof Error ? err.message : tr('فشل إنشاء النسخة.', 'Backup failed.'));
    } finally {
      setSystemBusy(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      const token = getStoredToken();
      const res = await fetch(
        `/api/admin/system/backups/${encodeURIComponent(filename)}/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setSystemErr(tr('تعذر تحميل ملف النسخة الاحتياطية.', 'Could not download backup.'));
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSystemBusy(true);
    setSystemMsg(null);
    setSystemErr(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await apiRequest('/api/admin/system/restore', {
        method: 'POST',
        body: JSON.stringify({ data: parsed }),
      });
      setSystemMsg(
        tr(
          'تمت استعادة النسخة الاحتياطية بنجاح (مع حفظ نسخة أمان تلقائية قبل الاستعادة).',
          'Database backup restored safely (pre-restore safety snapshot saved).'
        )
      );
      await Promise.all([loadSystemData(), loadAnalytics()]);
    } catch (err) {
      setSystemErr(
        err instanceof Error
          ? err.message
          : tr('ملف الاستعادة غير صالح.', 'Invalid backup JSON file.')
      );
    } finally {
      setSystemBusy(false);
    }
  };

  const handleSaveMaintenance = async (nextEnabled: boolean) => {
    setSystemBusy(true);
    setSystemMsg(null);
    setSystemErr(null);
    try {
      const res = await apiRequest<{ maintenance: MaintenanceState }>(
        '/api/admin/system/maintenance',
        {
          method: 'PUT',
          body: JSON.stringify({
            enabled: nextEnabled,
            message: maintenance.message,
          }),
        }
      );
      setMaintenance(res.maintenance);
      setSystemMsg(
        res.maintenance.enabled
          ? tr('تم تفعيل وضع الصيانة للطلاب والزوار.', 'Maintenance mode enabled for students.')
          : tr('تم إنهاء وضع الصيانة وإعادة المنصة للعمل.', 'Maintenance mode disabled.')
      );
    } catch (err) {
      setSystemErr(err instanceof Error ? err.message : tr('فشل تحديث الصيانة.', 'Failed.'));
    } finally {
      setSystemBusy(false);
    }
  };

  const handleClearErrors = async () => {
    try {
      await apiRequest('/api/admin/system/errors', { method: 'DELETE' });
      setErrors([]);
      loadAnalytics();
    } catch {
      // Ignore
    }
  };

  return (
    <section className="rounded-2xl bg-[#121216] border border-[#D4AF37]/35 p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-display text-xl font-bold text-[#E5C158]">
              {tr(
                'مركز تحليلات ومراقبة المنصة (حصرية للأدمن)',
                'Platform Analytics & Operations Center (Admin Only)'
              )}
            </h2>
          </div>
          <p className="text-xs text-[#A8A29E]">
            {tr(
              'إحصائيات الطلاب والامتحانات والزيارات، مكتب تذاكر الدعم، النسخ الاحتياطي، سجل الأخطاء، ووضع الصيانة.',
              'Visitor & academic metrics, student support desk, automated backups, error monitoring, and maintenance controls.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <GoldChip
            active={activeTab === 'analytics'}
            onClick={() => setActiveTab('analytics')}
            className="text-xs px-3 py-1.5"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{tr('الإحصائيات', 'Analytics')}</span>
          </GoldChip>

          <GoldChip
            active={activeTab === 'support'}
            onClick={() => setActiveTab('support')}
            className="text-xs px-3 py-1.5"
          >
            <LifeBuoy className="w-3.5 h-3.5" />
            <span>
              {tr('تذاكر الدعم', 'Support Desk')}
              {analytics?.overview?.openTicketsCount
                ? ` (${analytics.overview.openTicketsCount})`
                : ''}
            </span>
          </GoldChip>

          <GoldChip
            active={activeTab === 'system'}
            onClick={() => setActiveTab('system')}
            className="text-xs px-3 py-1.5"
          >
            <Database className="w-3.5 h-3.5" />
            <span>{tr('النسخ الاحتياطي والصيانة', 'Backups & System')}</span>
          </GoldChip>

          <GoldChip
            active={showConfig}
            onClick={() => setShowConfig((p) => !p)}
            className="text-xs px-3 py-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{tr('إعدادات الدعم', 'Support Links')}</span>
          </GoldChip>
        </div>
      </div>

      {showConfig && (
        <form
          onSubmit={handleSaveConfig}
          className="p-4 rounded-xl bg-[#09090B] border border-[#D4AF37]/30 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-[#C8C2B8]">
                {tr('رقم الواتساب للدعم', 'Support WhatsApp Number')}
              </label>
              <input
                type="text"
                value={config.whatsappNumber}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, whatsappNumber: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-[#C8C2B8]">
                {tr('رابط التليجرام للدعم', 'Support Telegram URL')}
              </label>
              <input
                type="url"
                value={config.telegramUrl}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, telegramUrl: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            {configError ? (
              <span className="text-xs text-red-300">{configError}</span>
            ) : configSaved ? (
              <span className="text-xs text-emerald-400">
                {tr('تم حفظ إعدادات الدعم بنجاح.', 'Support settings saved.')}
              </span>
            ) : (
              <span />
            )}
            <GoldChip type="submit" active={true} disabled={savingConfig}>
              {savingConfig ? tr('جاري الحفظ...', 'Saving...') : tr('حفظ الإعدادات', 'Save')}
            </GoldChip>
          </div>
        </form>
      )}

      {/* TAB 1: ANALYTICS */}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-5">
          {/* Visitor Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 rounded-xl bg-[#0D0D10] border border-white/10 divide-y lg:divide-y-0 divide-x divide-x-reverse divide-white/10">
            <div className="p-4">
              <div className="text-xs text-[#A8A29E]">
                {tr('الزوار الفريدون', 'Unique Visitors')}
              </div>
              <div className="font-mono text-2xl font-bold text-[#E5C158] tabular-nums mt-1">
                {analytics.uniqueVisitorsCount}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#A8A29E]">
                {tr('إجمالي الزيارات', 'Total Visits')}
              </div>
              <div className="font-mono text-2xl font-bold text-[#F5F0E6] tabular-nums mt-1">
                {analytics.totalVisits}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#A8A29E]">
                {tr('زيارات اليوم', "Today's Visits")}
              </div>
              <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums mt-1">
                {analytics.todayVisits}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#A8A29E]">
                {tr('زوار مسجلون بحسابات', 'Logged-in Visitors')}
              </div>
              <div className="font-mono text-2xl font-bold text-[#D4AF37] tabular-nums mt-1">
                {analytics.registeredVisitorsCount}
              </div>
            </div>
          </div>

          {/* Academic & Operations Overview Metrics */}
          {analytics.overview && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#09090B] border border-white/10">
                <div className="text-[#A8A29E]">{tr('الطلاب', 'Students')}</div>
                <div className="font-mono text-lg font-bold text-[#F5F0E6] tabular-nums mt-0.5">
                  {analytics.overview.studentsCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#09090B] border border-white/10">
                <div className="text-[#A8A29E]">{tr('الكورسات / الملخصات', 'Courses / PDFs')}</div>
                <div className="font-mono text-lg font-bold text-[#E5C158] tabular-nums mt-0.5">
                  {analytics.overview.coursesCount} / {analytics.overview.summariesCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#09090B] border border-white/10">
                <div className="text-[#A8A29E]">{tr('محاولات الاختبارات', 'Quiz Attempts')}</div>
                <div className="font-mono text-lg font-bold text-[#F5F0E6] tabular-nums mt-0.5">
                  {analytics.overview.totalSubmissions}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#09090B] border border-white/10">
                <div className="text-[#A8A29E]">{tr('متوسط درجات الاختبار', 'Avg Quiz Score')}</div>
                <div className="font-mono text-lg font-bold text-[#D4AF37] tabular-nums mt-0.5">
                  {analytics.overview.avgQuizScorePercent}%
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#09090B] border border-white/10">
                <div className="text-[#A8A29E]">{tr('تذاكر / أخطاء', 'Tickets / Errors')}</div>
                <div className="font-mono text-lg font-bold text-amber-300 tabular-nums mt-0.5">
                  {analytics.overview.openTicketsCount} / {analytics.overview.recentErrorsCount}
                </div>
              </div>
            </div>
          )}

          {analytics.recentVisitors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#C8C2B8]">
                <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{tr('أحدث الزيارات المسجلة', 'Recent Platform Visits')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto">
                {analytics.recentVisitors.map((v) => (
                  <div
                    key={v.visitorKey}
                    className="p-3 rounded-xl bg-[#09090B] border border-white/10 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-semibold text-[#F5F0E6] truncate flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                        <span>
                          {v.userName || tr('زائر قبل تسجيل الدخول', 'Guest Visitor')}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#A8A29E]">
                        {v.userYear ? formatYear(v.userYear) : tr('جلسة تصفح', 'Session')} ·{' '}
                        <span className="font-mono tabular-nums">
                          {new Date(v.lastVisitAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-[#E5C158] tabular-nums shrink-0">
                      {v.visitCount}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ADMIN SUPPORT TICKET DESK */}
      {activeTab === 'support' && (
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <div className="py-8 text-center rounded-xl bg-[#0D0D10] border border-white/10 text-xs text-[#A8A29E]">
              {tr('لا توجد تذاكر دعم فني من الطلاب حتى الآن.', 'No support tickets yet.')}
            </div>
          ) : (
            <div className="space-y-3 max-h-[460px] overflow-y-auto">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm text-[#F5F0E6]">{t.subject}</div>
                      <div className="text-[11px] text-[#A8A29E]">
                        {t.userName} ({formatYear(t.userYear)}) · {t.userEmail || t.userId} ·{' '}
                        <span className="font-mono">{new Date(t.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(['open', 'in_review', 'resolved'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          disabled={savingTicketId === t.id}
                          onClick={() => handleUpdateTicket(t.id, st)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer border transition-colors ${
                            t.status === st
                              ? 'bg-[#D4AF37] text-[#09090B] border-[#D4AF37]'
                              : 'bg-[#151519] text-[#C8C2B8] border-white/10 hover:border-[#D4AF37]/40'
                          }`}
                        >
                          {st === 'resolved'
                            ? tr('تم الحل', 'Resolved')
                            : st === 'in_review'
                            ? tr('مراجعة', 'In Review')
                            : tr('مفتوح', 'Open')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-[#C8C2B8] leading-relaxed">{t.description}</p>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={replyDrafts[t.id] ?? t.adminReply ?? ''}
                      onChange={(e) =>
                        setReplyDrafts((p) => ({ ...p, [t.id]: e.target.value }))
                      }
                      placeholder={tr('اكتب رداً للطالب...', 'Write a reply to the student...')}
                      className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-[#09090B] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                    />
                    <GoldChip
                      active={true}
                      disabled={savingTicketId === t.id}
                      onClick={() =>
                        handleUpdateTicket(
                          t.id,
                          t.status === 'open' ? 'resolved' : t.status,
                          replyDrafts[t.id] ?? t.adminReply ?? ''
                        )
                      }
                      className="text-xs px-3 py-1.5"
                    >
                      <Send className="w-3 h-3" />
                      <span>{tr('إرسال الرد', 'Send Reply')}</span>
                    </GoldChip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BACKUPS, ERROR LOGS & MAINTENANCE */}
      {activeTab === 'system' && (
        <div className="space-y-5">
          {systemErr && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200">
              {systemErr}
            </div>
          )}
          {systemMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/35 border border-emerald-500/40 text-xs text-emerald-200">
              {systemMsg}
            </div>
          )}

          {/* Maintenance Control */}
          <div className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-[#F5F0E6]">
                <Wrench className="w-4 h-4 text-[#D4AF37]" />
                <span>{tr('وضع الصيانة وحالة الخدمة', 'Maintenance Mode Control')}</span>
              </div>
              <span
                className={`text-xs font-semibold inline-flex items-center gap-1 ${
                  maintenance.enabled ? 'text-amber-300' : 'text-emerald-400'
                }`}
              >
                {maintenance.enabled ? (
                  <>
                    <Activity className="w-3.5 h-3.5" />
                    <span>{tr('وضع الصيانة مُفعّل', 'Maintenance Active')}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{tr('المنصة تعمل بشكل طبيعي', 'Live & Operational')}</span>
                  </>
                )}
              </span>
            </div>

            <input
              type="text"
              value={maintenance.message}
              onChange={(e) =>
                setMaintenance((p) => ({ ...p, message: e.target.value }))
              }
              placeholder={tr('رسالة الصيانة الظاهرة للطلاب...', 'Maintenance message shown to students...')}
              className="w-full px-3 py-2 rounded-lg bg-[#09090B] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            />

            <div className="flex flex-wrap items-center gap-2">
              <GoldChip
                active={maintenance.enabled}
                disabled={systemBusy}
                onClick={() => handleSaveMaintenance(!maintenance.enabled)}
                className="text-xs px-3.5 py-1.5"
              >
                {maintenance.enabled
                  ? tr('إيقاف وضع الصيانة وإعادة التشغيل', 'Disable Maintenance Mode')
                  : tr('تفعيل وضع الصيانة', 'Enable Maintenance Mode')}
              </GoldChip>
              <button
                type="button"
                disabled={systemBusy}
                onClick={() => handleSaveMaintenance(maintenance.enabled)}
                className="px-3 py-1.5 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#C8C2B8] hover:text-[#E5C158] cursor-pointer"
              >
                {tr('حفظ الرسالة فقط', 'Save Message')}
              </button>
            </div>
          </div>

          {/* Backups & Recovery */}
          <div className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-[#F5F0E6]">
                <Database className="w-4 h-4 text-[#D4AF37]" />
                <span>{tr('النسخ الاحتياطي واستعادة قاعدة البيانات', 'Database Backups & Recovery')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <GoldChip
                  active={true}
                  disabled={systemBusy}
                  onClick={handleCreateBackup}
                  className="text-xs px-3 py-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{tr('أخذ نسخة احتياطية الآن', 'Create Backup Now')}</span>
                </GoldChip>

                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151519] border border-[#D4AF37]/40 text-xs text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{tr('استعادة من ملف JSON', 'Restore JSON')}</span>
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={handleRestoreFile}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {backups.length === 0 ? (
              <p className="text-xs text-[#A8A29E]">
                {tr('لا توجد لقطات احتياطية محفوظة بعد.', 'No snapshots stored yet.')}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {backups.map((b) => (
                  <div
                    key={b.filename}
                    className="px-3 py-2 rounded-lg bg-[#09090B] border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[#F5F0E6] truncate">{b.filename}</div>
                      <div className="text-[11px] text-[#A8A29E] font-mono tabular-nums">
                        {(b.size / 1024).toFixed(1)} KB · {new Date(b.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadBackup(b.filename)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#151519] border border-white/10 text-[#E5C158] hover:border-[#D4AF37] cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>{tr('تحميل', 'Download')}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error Monitoring Log */}
          <div className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-[#F5F0E6]">
                <AlertOctagon className="w-4 h-4 text-red-400" />
                <span>
                  {tr('سجل مراقبة أخطاء التطبيق', 'Application Error Monitoring')} ({errors.length})
                </span>
              </div>
              {errors.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearErrors}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-950/50 border border-red-500/30 text-[11px] text-red-200 hover:bg-red-600 hover:text-white cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{tr('مسح السجل', 'Clear Log')}</span>
                </button>
              )}
            </div>

            {errors.length === 0 ? (
              <p className="text-xs text-emerald-400">
                {tr('لا توجد أخطاء مسجلة حالياً — المنصة مستقرة.', 'Zero errors recorded.')}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {errors.map((errItem) => (
                  <div
                    key={errItem.id}
                    className="p-2.5 rounded-lg bg-[#09090B] border border-red-500/20 text-xs space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono uppercase text-[10px] px-1.5 py-0.5 rounded bg-red-950/60 text-red-300">
                        {errItem.source}
                      </span>
                      <span className="font-mono text-[10px] text-[#A8A29E]">
                        {new Date(errItem.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[#F5F0E6] break-words">{errItem.message}</div>
                    {errItem.path && (
                      <div className="font-mono text-[11px] text-[#A8A29E]">{errItem.path}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

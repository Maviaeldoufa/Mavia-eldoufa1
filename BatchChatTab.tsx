import {
  Ban,
  Download,
  FileAudio,
  Mic,
  Scale,
  Send,
  Share2,
  ShieldCheck,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { ChatMessage } from '../../types';
import { apiRequest, getStoredToken, resolveApiUrl, resolveWsUrl } from '../../utils/api';
import { hasAdminPermission } from '../../utils/permissions';
import { GoldChip } from '../ui/GoldChip';
import { RankBadge } from '../ui/RankBadge';

interface PendingAudio {
  blob: Blob;
  filename: string;
  previewUrl: string;
  durationSeconds: number;
  isRecording: boolean;
}

function formatDuration(totalSec?: number): string {
  if (!totalSec || totalSec <= 0) return '00:00';
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pickSupportedRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

export function BatchChatTab() {
  const { user } = useAuth();
  const { tr, formatYear } = useLanguage();
  const [room, setRoom] = useState<string>(user ? `year-${user.year}` : 'general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [connected, setConnected] = useState<boolean>(false);
  const [input, setInput] = useState('');
  const [modFeedback, setModFeedback] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Voice recording & audio file state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [sharingMsgId, setSharingMsgId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<string>(room);
  roomRef.current = room;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartMsRef = useRef<number>(0);
  const cancelledRecordRef = useRef<boolean>(false);
  const pendingPreviewRef = useRef<string | null>(null);

  const isAdmin = hasAdminPermission(user, 'manage_students');

  const ROOMS = [
    { id: 'general', label: tr('الساحة العامة', 'General Hall') },
    { id: 'year-1', label: formatYear(1) },
    { id: 'year-2', label: formatYear(2) },
    { id: 'year-3', label: formatYear(3) },
    { id: 'year-4', label: formatYear(4) },
  ];

  const stopStreamTracks = () => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
  };

  const clearPendingAudio = () => {
    if (pendingPreviewRef.current) {
      URL.revokeObjectURL(pendingPreviewRef.current);
      pendingPreviewRef.current = null;
    }
    setPendingAudio(null);
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    const wsUrl = resolveWsUrl(
      `/ws/chat?token=${encodeURIComponent(token)}&room=${encodeURIComponent(roomRef.current)}`
    );

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'chat:join', room: roomRef.current }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          messages?: ChatMessage[];
          message?: ChatMessage;
          onlineCount?: number;
        };

        if (data.type === 'chat:init' && data.messages) {
          setMessages(data.messages);
        } else if (data.type === 'chat:message' && data.message) {
          const incoming = data.message;
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
          );
        } else if (
          data.type === 'chat:presence' &&
          typeof data.onlineCount === 'number'
        ) {
          setOnlineCount(data.onlineCount);
        }
      } catch {
        // Ignore
      }
    };

    ws.onclose = (ev) => {
      setConnected(false);
      if (ev.code === 4003) {
        window.dispatchEvent(
          new CustomEvent('mvia:suspended', {
            detail:
              'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام (في الشات أو المنصة)، ولا يمكنك الدخول مجدداً إلا بإذن من الأدمن.',
          })
        );
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      cancelledRecordRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore
        }
      }
      stopStreamTracks();
      if (pendingPreviewRef.current) {
        URL.revokeObjectURL(pendingPreviewRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat:join', room }));
    }
  }, [room]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleStartRecording = async () => {
    setChatError(null);
    clearPendingAudio();

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setChatError(
        tr(
          'متصفحك الحالي لا يدعم التسجيل المباشر من الميكروفون. يمكنك رفع ملف صوتي مباشرة.',
          'Your browser does not support live microphone recording. You can upload an audio file instead.'
        )
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = pickSupportedRecorderMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      recordChunksRef.current = [];
      cancelledRecordRef.current = false;
      recordStartMsRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);

      recordTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordStartMsRef.current) / 1000);
        setRecordingSeconds(elapsed);
      }, 250);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        stopStreamTracks();
        setIsRecording(false);
        if (cancelledRecordRef.current) {
          recordChunksRef.current = [];
          return;
        }

        const actualType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(recordChunksRef.current, { type: actualType });
        recordChunksRef.current = [];
        if (blob.size < 200) {
          setChatError(
            tr(
              'التسجيل قصير جداً أو لم يتم التقاط صوت. حاول مرة أخرى.',
              'Recording was too short or empty. Please try again.'
            )
          );
          return;
        }

        const durationSec = Math.max(
          1,
          Math.round((Date.now() - recordStartMsRef.current) / 1000)
        );
        const ext = actualType.includes('mp4')
          ? 'm4a'
          : actualType.includes('ogg')
          ? 'ogg'
          : 'webm';
        const previewUrl = URL.createObjectURL(blob);
        pendingPreviewRef.current = previewUrl;
        setPendingAudio({
          blob,
          filename: `voice-record-${Date.now()}.${ext}`,
          previewUrl,
          durationSeconds: durationSec,
          isRecording: true,
        });
      };

      recorder.start(250);
    } catch (err) {
      stopStreamTracks();
      setIsRecording(false);
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setChatError(
          tr(
            'تم رفض إذن الميكروفون. يرجى السماح بالوصول للميكروفون من إعدادات المتصفح.',
            'Microphone permission denied. Please allow microphone access in browser settings.'
          )
        );
      } else {
        setChatError(
          tr(
            'تعذر الوصول إلى الميكروفون على هذا الجهاز.',
            'Could not access a microphone on this device.'
          )
        );
      }
    }
  };

  const handleStopRecording = () => {
    cancelledRecordRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleCancelRecording = () => {
    cancelledRecordRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      stopStreamTracks();
      setIsRecording(false);
    }
  };

  const handlePickAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setChatError(
        tr(
          'حجم الملف الصوتي يتجاوز الحد الأقصى (25 ميجابايت).',
          'Audio file exceeds the 25 MB limit.'
        )
      );
      return;
    }

    clearPendingAudio();
    const previewUrl = URL.createObjectURL(file);
    pendingPreviewRef.current = previewUrl;

    // Probe client audio duration cleanly
    const tempAudio = document.createElement('audio');
    tempAudio.preload = 'metadata';
    tempAudio.src = previewUrl;
    tempAudio.onloadedmetadata = () => {
      const dur = Number.isFinite(tempAudio.duration)
        ? Math.round(tempAudio.duration)
        : 0;
      setPendingAudio((prev) =>
        prev && prev.previewUrl === previewUrl
          ? { ...prev, durationSeconds: dur }
          : prev
      );
    };

    setPendingAudio({
      blob: file,
      filename: file.name,
      previewUrl,
      durationSeconds: 0,
      isRecording: false,
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setChatError(null);

    if (pendingAudio) {
      setUploadingAudio(true);
      try {
        const formData = new FormData();
        formData.append('audio', pendingAudio.blob, pendingAudio.filename);
        if (input.trim()) {
          formData.append('text', input.trim());
        }
        if (pendingAudio.durationSeconds > 0) {
          formData.append(
            'durationSeconds',
            String(pendingAudio.durationSeconds)
          );
        }

        const res = await apiRequest<{ message: ChatMessage }>(
          `/api/community/chat/${encodeURIComponent(room)}/audio`,
          {
            method: 'POST',
            body: formData,
          }
        );

        setMessages((prev) =>
          prev.some((m) => m.id === res.message.id)
            ? prev
            : [...prev, res.message]
        );
        setInput('');
        clearPendingAudio();
      } catch (err) {
        setChatError(
          err instanceof Error
            ? err.message
            : tr('تعذر رفع وإرسال المقطع الصوتي.', 'Failed to send audio message.')
        );
      } finally {
        setUploadingAudio(false);
      }
      return;
    }

    if (
      !input.trim() ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    wsRef.current.send(
      JSON.stringify({ type: 'chat:send', room, text: input.trim() })
    );
    setInput('');
  };

  const handleShareAudio = async (msg: ChatMessage) => {
    if (!msg.audioUrl) return;
    setShareFeedback(null);
    setSharingMsgId(msg.id);
    const resolvedAudioUrl = resolveApiUrl(msg.audioUrl);
    const absoluteUrl = new URL(resolvedAudioUrl, window.location.origin).toString();
    const downloadName = msg.audioName || `mvia-voice-${msg.id.slice(0, 8)}.mp3`;

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        const res = await fetch(resolvedAudioUrl);
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], downloadName, { type: 'audio/mpeg' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: tr('تسجيل صوتي من منصة MAVIA', 'MAVIA Batch Voice Note'),
              text: msg.text || `${msg.userName} — ${tr('شات الدفعة MAVIA', 'MAVIA Batch Chat')}`,
            });
            setShareFeedback(
              tr('تم فتح نافذة مشاركة الملف الصوتي (MP3) بنجاح.', 'Audio file share sheet opened.')
            );
            return;
          }
        }
        await navigator.share({
          title: tr('ملف صوتي من منصة MAVIA', 'MAVIA Voice Message'),
          text: msg.text || `${msg.userName}`,
          url: absoluteUrl,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl);
        setShareFeedback(
          tr(
            'تم نسخ رابط الصوت (MP3) — يمكنك لصقه في واتساب أو تيليجرام أو تنزيل الملف مباشرة.',
            'MP3 link copied — paste in WhatsApp/Telegram or use Download MP3.'
          )
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl).catch(() => {});
        setShareFeedback(
          tr(
            'تم نسخ رابط الملف الصوتي (MP3) للمشاركة.',
            'Copied MP3 link to clipboard for sharing.'
          )
        );
      }
    } finally {
      setSharingMsgId(null);
    }
  };

  const handleSuspendFromChat = async (targetUserId: string, targetName: string) => {
    setModFeedback(null);
    try {
      await apiRequest(`/api/admin/users/${targetUserId}/suspend`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'تجاوز الحدود في شات الدفعة',
        }),
      });
      setModFeedback(
        tr(
          `تم حظر ${targetName} مؤقتاً وإخراجه من الشات — لن يدخل مجدداً إلا بإذنك.`,
          `${targetName} was temporarily suspended from chat until your approval.`
        )
      );
    } catch (err) {
      setModFeedback(
        err instanceof Error
          ? err.message
          : tr('تعذر تنفيذ الحظر.', 'Failed to suspend student.')
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-amber-950/25 border border-amber-500/35 text-xs text-amber-200 flex items-center gap-2">
        <Scale className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          {tr(
            'التزم بالاحترام في الشات — يمكنك إرسال رسائل نصية، تسجيل ريكورد مباشر، أو رفع ملفات صوتية بصيغة MP3 متوافقة مع واتساب وتيليجرام ومواقع التواصل.',
            'Keep chat respectful — send text, live voice recordings, or audio files automatically converted to universal MP3 for WhatsApp, Telegram & social apps.'
          )}
        </span>
      </div>

      {modFeedback && (
        <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs">
          {modFeedback}
        </div>
      )}

      {shareFeedback && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/35 text-emerald-200 text-xs">
          {shareFeedback}
        </div>
      )}

      {chatError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs"
        >
          {chatError}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {ROOMS.map((r) => (
            <GoldChip
              key={r.id}
              active={room === r.id}
              layoutId="batch-chat-room"
              onClick={() => setRoom(r.id)}
              className="text-xs px-3 py-1.5"
            >
              {r.label}
            </GoldChip>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-[#A8A29E] shrink-0">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-amber-500'
            }`}
          />
          <span>
            {connected
              ? tr('متصل مباشر', 'Live Connected')
              : tr('جاري الاتصال...', 'Connecting...')}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-[#E5C158]">
            {onlineCount} {tr('متواجد الآن', 'online')}
          </span>
        </div>
      </div>

      {/* Chat Messages Feed */}
      <div
        ref={scrollRef}
        className="h-[400px] overflow-y-auto rounded-xl bg-[#09090B] border border-white/10 p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[#A8A29E]">
            {tr(
              'لا توجد رسائل في غرفة الدفعة بعد — ابدأ المحادثة أو أرسل رسالة صوتية لزملائك!',
              'No messages in this batch room yet — start chatting or send a voice note!'
            )}
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.userId === user?.id;
            const resolvedAudioUrl = msg.audioUrl ? resolveApiUrl(msg.audioUrl) : '';
            const absoluteAudioUrl = resolvedAudioUrl
              ? new URL(resolvedAudioUrl, window.location.origin).toString()
              : '';
            const shareText = msg.text
              ? `${msg.text} — ${absoluteAudioUrl}`
              : `${tr('استمع للمقطع الصوتي من منصة MAVIA', 'Listen to voice message from MAVIA')}: ${absoluteAudioUrl}`;
            const whatsappHref = msg.audioUrl
              ? `https://wa.me/?text=${encodeURIComponent(shareText)}`
              : '';
            const telegramHref = msg.audioUrl
              ? `https://t.me/share/url?url=${encodeURIComponent(
                  absoluteAudioUrl
                )}&text=${encodeURIComponent(
                  msg.text || `${msg.userName} — ${tr('رسالة صوتية MAVIA', 'MAVIA Voice Message')}`
                )}`
              : '';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isMine ? 'items-start' : 'items-end'
                }`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[78%] rounded-xl px-4 py-2.5 border space-y-2 ${
                    isMine
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37]/40 text-[#F5F0E6]'
                      : 'bg-[#151519] border-white/10 text-[#F5F0E6]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#D4AF37]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{msg.userName}</span>
                      {msg.rankBadge ? (
                        <RankBadge rankBadge={msg.rankBadge} size="xs" />
                      ) : msg.userRole === 'admin' ? (
                        <ShieldCheck
                          className="w-3.5 h-3.5"
                          aria-label={tr('أدمن', 'Admin')}
                        />
                      ) : null}
                      {msg.userRole === 'teacher' && (
                        <span className="text-[11px] font-medium text-sky-300">
                          {tr('معلم', 'Teacher')}
                        </span>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="text-[#A8A29E]">
                        {formatYear(msg.userYear)}
                      </span>
                    </div>

                    {isAdmin && msg.userRole !== 'admin' && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSuspendFromChat(msg.userId, msg.userName)
                        }
                        title={tr(
                          'حظر هذا الطالب مؤقتاً',
                          'Temporarily suspend student'
                        )}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-950/70 border border-red-500/40 text-[10px] text-red-200 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
                      >
                        <Ban className="w-3 h-3" />
                        <span>{tr('حظر مؤقت', 'Suspend')}</span>
                      </button>
                    )}
                  </div>

                  {msg.text && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  )}

                  {msg.audioUrl && (
                    <div className="p-2.5 rounded-lg bg-[#09090B]/80 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[#C8C2B8]">
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <Volume2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                          <span className="truncate">
                            {msg.audioName || tr('تسجيل صوتي', 'Voice Note')}
                          </span>
                        </span>
                        <span className="font-mono tabular-nums text-[10px] text-[#A8A29E] shrink-0">
                          MP3
                          {msg.audioDurationSeconds
                            ? ` · ${formatDuration(msg.audioDurationSeconds)}`
                            : ''}
                          {msg.audioSize ? ` · ${formatBytes(msg.audioSize)}` : ''}
                        </span>
                      </div>

                      <audio
                        controls
                        preload="metadata"
                        src={resolvedAudioUrl}
                        className="w-full min-w-[210px] sm:min-w-[270px] h-9"
                      />

                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
                        <button
                          type="button"
                          disabled={sharingMsgId === msg.id}
                          onClick={() => handleShareAudio(msg)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#151519] border border-[#D4AF37]/35 text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Share2 className="w-3 h-3" />
                          <span>{tr('مشاركة الملف', 'Share File')}</span>
                        </button>

                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-950/60 border border-emerald-500/35 text-emerald-200 hover:bg-emerald-600 hover:text-white transition-colors"
                        >
                          <span>{tr('واتساب', 'WhatsApp')}</span>
                        </a>

                        <a
                          href={telegramHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-950/60 border border-sky-500/35 text-sky-200 hover:bg-sky-600 hover:text-white transition-colors"
                        >
                          <span>{tr('تيليجرام', 'Telegram')}</span>
                        </a>

                        <a
                          href={resolvedAudioUrl}
                          download={msg.audioName || 'mvia-voice.mp3'}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#151519] border border-white/10 text-[#C8C2B8] hover:border-[#D4AF37] hover:text-[#E5C158] transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>{tr('تنزيل MP3', 'Download MP3')}</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Live Recording Bar */}
      {isRecording && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/45 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-red-100">
            <span
              className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"
              aria-hidden="true"
            />
            <span className="font-semibold">
              {tr('جاري تسجيل الريكورد الآن...', 'Recording voice message...')}
            </span>
            <span className="font-mono tabular-nums text-red-200 font-bold">
              {formatDuration(recordingSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelRecording}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#151519] border border-white/15 text-xs text-[#C8C2B8] hover:text-white cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{tr('إلغاء', 'Cancel')}</span>
            </button>
            <button
              type="button"
              onClick={handleStopRecording}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{tr('إيقاف ومعاينة', 'Stop & Preview')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Pending Audio Preview Bar (Before Sending) */}
      {pendingAudio && !isRecording && (
        <div className="p-3 rounded-xl bg-[#121216] border border-[#D4AF37]/40 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[#E5C158] font-semibold">
              <FileAudio className="w-4 h-4" />
              <span>
                {pendingAudio.isRecording
                  ? tr('تسجيل صوتي جاهز للإرسال (سيُحفظ بصيغة MP3 شاملة)', 'Recorded voice note ready (auto-converted to universal MP3)')
                  : `${pendingAudio.filename} (${formatBytes(pendingAudio.blob.size)})`}
              </span>
              {pendingAudio.durationSeconds > 0 && (
                <span className="font-mono tabular-nums text-[#C8C2B8]">
                  · {formatDuration(pendingAudio.durationSeconds)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={clearPendingAudio}
              disabled={uploadingAudio}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-950/60 border border-red-500/35 text-xs text-red-200 hover:bg-red-600 hover:text-white cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{tr('حذف الصوت', 'Discard')}</span>
            </button>
          </div>
          <audio controls src={pendingAudio.previewUrl} className="w-full h-9" />
        </div>
      )}

      {/* Message & Audio Composer */}
      <form onSubmit={handleSend} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.webm,.flac"
          onChange={handlePickAudioFile}
          className="sr-only"
        />

        <button
          type="button"
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={uploadingAudio}
          title={
            isRecording
              ? tr('إيقاف التسجيل', 'Stop recording')
              : tr('تسجيل ريكورد صوتي', 'Record voice message')
          }
          aria-label={
            isRecording
              ? tr('إيقاف التسجيل', 'Stop recording')
              : tr('تسجيل ريكورد صوتي', 'Record voice message')
          }
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50 ${
            isRecording
              ? 'bg-red-600 border-red-500 text-white'
              : 'bg-[#151519] border-white/10 text-[#E5C158] hover:border-[#D4AF37]/60'
          }`}
        >
          {isRecording ? (
            <>
              <Square className="w-4 h-4 fill-current" />
              <span className="hidden md:inline">{tr('إيقاف', 'Stop')}</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              <span className="hidden md:inline">{tr('ريكورد', 'Record')}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isRecording || uploadingAudio}
          title={tr('إرفاق ملف صوتي (MP3, WAV, M4A, OGG)', 'Attach audio file')}
          aria-label={tr('إرفاق ملف صوتي', 'Attach audio file')}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#151519] border border-white/10 text-xs font-semibold text-[#C8C2B8] hover:text-[#E5C158] hover:border-[#D4AF37]/60 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
        >
          <FileAudio className="w-4 h-4" />
          <span className="hidden md:inline">{tr('ملف صوتي', 'Audio File')}</span>
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={uploadingAudio}
          placeholder={
            pendingAudio
              ? tr('أضف وصفاً اختيارياً للصوت ثم اضغط إرسال...', 'Optional caption for your audio...')
              : tr(
                  'اكتب رسالتك لزملائك في الدفعة...',
                  'Write a message to your batch...'
                )
          }
          className="flex-1 min-w-[160px] px-4 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] placeholder-[#6B6661] focus:outline-none focus:border-[#D4AF37]"
        />

        <GoldChip
          type="submit"
          active={true}
          disabled={
            uploadingAudio ||
            isRecording ||
            (!pendingAudio && (!connected || !input.trim()))
          }
          className="px-5 py-2.5"
        >
          <Send className="w-4 h-4" />
          <span>
            {uploadingAudio
              ? tr('جاري التحويل والإرسال...', 'Converting & Sending...')
              : pendingAudio
              ? tr('إرسال الصوت', 'Send Audio')
              : tr('إرسال', 'Send')}
          </span>
        </GoldChip>
      </form>
    </div>
  );
}

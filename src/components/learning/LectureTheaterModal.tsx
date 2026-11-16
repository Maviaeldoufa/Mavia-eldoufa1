import {
  BookmarkPlus,
  Captions,
  CaptionsOff,
  Download,
  Lock,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Trash2,
  Unlock,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { LectureNote, LectureVideo } from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';

interface VttCue {
  start: number;
  end: number;
  text: string;
}

function parseTimeToSeconds(raw: string): number {
  const clean = raw.trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(clean) || 0;
}

function parseVtt(raw: string): VttCue[] {
  const normalized = raw.replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);
  const cues: VttCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;
    const [startStr, endStr] = lines[timeIdx].split('-->');
    if (!startStr || !endStr) continue;
    const start = parseTimeToSeconds(startStr.trim().split(' ')[0]);
    const end = parseTimeToSeconds(endStr.trim().split(' ')[0]);
    const text = lines.slice(timeIdx + 1).join('\n');
    if (text) {
      cues.push({ start, end, text });
    }
  }
  return cues;
}

function formatClock(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface LectureTheaterModalProps {
  lecture: LectureVideo;
  onClose: () => void;
  onLectureUpdated: (updated: LectureVideo) => void;
}

export function LectureTheaterModal({
  lecture,
  onClose,
  onLectureUpdated,
}: LectureTheaterModalProps) {
  const { user } = useAuth();
  const { tr, formatYear } = useLanguage();
  const isAdmin = user?.role === 'admin';

  const theaterRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resumedOnceRef = useRef(false);
  const lastSavedAtRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(
    lecture.myProgress?.lastPositionSeconds || 0
  );
  const [duration, setDuration] = useState(lecture.durationSeconds || 0);
  const [playbackRate, setPlaybackRate] = useState(
    lecture.myProgress?.playbackRate || 1
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [cues, setCues] = useState<VttCue[]>([]);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);

  const [notes, setNotes] = useState<LectureNote[]>(
    lecture.myProgress?.notes || []
  );
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [togglingDownload, setTogglingDownload] = useState(false);

  const localPosKey = `mvia_lec_pos_${user?.id || 'guest'}_${lecture.id}`;

  // Load VTT subtitles if available
  useEffect(() => {
    if (!lecture.subtitleUrl) {
      setCues([]);
      return;
    }
    fetch(lecture.subtitleUrl)
      .then((r) => (r.ok ? r.text() : ''))
      .then((txt) => {
        if (txt) {
          setCues(parseVtt(txt));
        }
      })
      .catch(() => {});
  }, [lecture.subtitleUrl]);

  // Listen to fullscreen state changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const persistProgress = (posSec: number, rate: number) => {
    const rounded = Math.max(0, Math.floor(posSec));
    localStorage.setItem(localPosKey, String(rounded));
    apiRequest(`/api/lectures/${lecture.id}/progress`, {
      method: 'PUT',
      body: JSON.stringify({
        lastPositionSeconds: rounded,
        playbackRate: rate,
      }),
    })
      .then(() => {
        onLectureUpdated({
          ...lecture,
          myProgress: {
            lastPositionSeconds: rounded,
            playbackRate: rate,
            updatedAt: new Date().toISOString(),
            notes,
          },
        });
      })
      .catch(() => {});
  };

  // Save on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        persistProgress(videoRef.current.currentTime, videoRef.current.playbackRate);
      }
    };
  }, []);

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setDuration(vid.duration || 0);
    vid.playbackRate = playbackRate;

    if (!resumedOnceRef.current) {
      resumedOnceRef.current = true;
      const localSaved = Number(localStorage.getItem(localPosKey) || '0');
      const serverSaved = lecture.myProgress?.lastPositionSeconds || 0;
      const targetPos = Math.max(localSaved, serverSaved);

      if (targetPos > 1 && vid.duration && targetPos < vid.duration - 2) {
        vid.currentTime = targetPos;
        setCurrentTime(targetPos);
        setResumedFrom(targetPos);
      }
    }
  };

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setCurrentTime(vid.currentTime);
    const now = Date.now();
    if (now - lastSavedAtRef.current >= 4000) {
      lastSavedAtRef.current = now;
      persistProgress(vid.currentTime, vid.playbackRate);
    }
  };

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      setPlaying(true);
    } else {
      vid.pause();
      setPlaying(false);
      persistProgress(vid.currentTime, vid.playbackRate);
    }
  };

  const seekTo = (seconds: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    const clamped = Math.max(0, Math.min(seconds, vid.duration || seconds));
    vid.currentTime = clamped;
    setCurrentTime(clamped);
    persistProgress(clamped, vid.playbackRate);
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      persistProgress(videoRef.current.currentTime, rate);
    }
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setMuted(vid.muted);
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setMuted(val === 0);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && theaterRef.current) {
        await theaterRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback for Safari/iOS video element
      const vid = videoRef.current as
        | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
        | null;
      vid?.webkitEnterFullscreen?.();
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || savingNote) return;
    setSavingNote(true);
    try {
      const ts = videoRef.current ? Math.floor(videoRef.current.currentTime) : Math.floor(currentTime);
      const res = await apiRequest<{ note: LectureNote; notes: LectureNote[] }>(
        `/api/lectures/${lecture.id}/notes`,
        {
          method: 'POST',
          body: JSON.stringify({
            timestampSeconds: ts,
            text: noteText.trim(),
          }),
        }
      );
      setNotes(res.notes);
      setNoteText('');
      onLectureUpdated({
        ...lecture,
        myProgress: {
          lastPositionSeconds: ts,
          playbackRate,
          updatedAt: new Date().toISOString(),
          notes: res.notes,
        },
      });
    } catch {
      // Ignore
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const res = await apiRequest<{ notes: LectureNote[] }>(
        `/api/lectures/${lecture.id}/notes/${noteId}`,
        { method: 'DELETE' }
      );
      setNotes(res.notes);
      onLectureUpdated({
        ...lecture,
        myProgress: {
          lastPositionSeconds: Math.floor(currentTime),
          playbackRate,
          updatedAt: new Date().toISOString(),
          notes: res.notes,
        },
      });
    } catch {
      // Ignore
    }
  };

  const handleToggleDownloadPermission = async () => {
    if (!isAdmin || togglingDownload) return;
    setTogglingDownload(true);
    try {
      const res = await apiRequest<{ lecture: LectureVideo }>(
        `/api/lectures/${lecture.id}/download-permission`,
        {
          method: 'PATCH',
          body: JSON.stringify({ allowDownload: !lecture.allowDownload }),
        }
      );
      onLectureUpdated({
        ...res.lecture,
        myProgress: {
          lastPositionSeconds: Math.floor(currentTime),
          playbackRate,
          updatedAt: new Date().toISOString(),
          notes,
        },
      });
    } catch {
      // Ignore
    } finally {
      setTogglingDownload(false);
    }
  };

  const activeCue = captionsEnabled
    ? cues.find((c) => currentTime >= c.start && currentTime <= c.end)
    : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
    >
      <div className="w-full max-w-6xl max-h-[94vh] overflow-y-auto rounded-2xl bg-[#121216] border border-[#D4AF37]/35 p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#D4AF37]">
              <span>{lecture.category}</span>
              <span aria-hidden="true">·</span>
              <span>{formatYear(lecture.year)}</span>
              <span aria-hidden="true">·</span>
              <span>{lecture.instructor}</span>
            </div>
            <h2 className="font-display text-lg sm:text-2xl font-bold text-[#F5F0E6]">
              {lecture.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <GoldChip
                active={lecture.allowDownload}
                disabled={togglingDownload}
                onClick={handleToggleDownloadPermission}
                className="text-xs px-3 py-1.5"
              >
                {lecture.allowDownload ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {tr('التحميل مسموح', 'Downloads On')}
                    </span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {tr('التحميل مقفول', 'Downloads Off')}
                    </span>
                  </>
                )}
              </GoldChip>
            )}
            <button
              type="button"
              onClick={() => {
                if (videoRef.current) {
                  persistProgress(videoRef.current.currentTime, videoRef.current.playbackRate);
                }
                onClose();
              }}
              aria-label={tr('إغلاق المشغل', 'Close Player')}
              className="p-2 rounded-lg bg-[#18181D] border border-white/10 text-[#C8C2B8] hover:text-[#F5D061] hover:border-[#D4AF37]/50 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Auto-resume notification strip */}
        {resumedFrom !== null && resumedFrom > 1 && (
          <div className="px-3.5 py-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/35 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[#E5C158] font-medium">
              {tr(
                `تم استئناف المحاضرة تلقائياً من آخر نقطة توقف (${formatClock(resumedFrom)})`,
                `Auto-resumed from your last position (${formatClock(resumedFrom)})`
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                seekTo(0);
                setResumedFrom(null);
              }}
              className="text-[#F5F0E6] underline hover:text-[#E5C158] cursor-pointer"
            >
              {tr('البدء من 00:00', 'Restart from 00:00')}
            </button>
          </div>
        )}

        {/* Main 2-column Responsive Theater Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left / Main Video Player */}
          <div className="lg:col-span-8 space-y-4">
            <div
              ref={theaterRef}
              className="relative rounded-2xl overflow-hidden bg-black border border-[#D4AF37]/30 flex flex-col justify-between"
            >
              {/* Video Element */}
              <div className="relative w-full aspect-video bg-[#050507] flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={lecture.videoUrl}
                  playsInline
                  preload="metadata"
                  onClick={togglePlay}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setPlaying(true)}
                  onPause={() => {
                    setPlaying(false);
                    if (videoRef.current) {
                      persistProgress(videoRef.current.currentTime, videoRef.current.playbackRate);
                    }
                  }}
                  onEnded={() => {
                    setPlaying(false);
                    if (videoRef.current) {
                      persistProgress(videoRef.current.currentTime, videoRef.current.playbackRate);
                    }
                  }}
                  className="w-full h-full object-contain cursor-pointer"
                />

                {/* Center Play Overlay when Paused */}
                {!playing && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={tr('تشغيل المحاضرة', 'Play Lecture')}
                    className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-[#D4AF37]/90 hover:bg-[#F5D061] text-[#09090B] flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.45)] transition-transform hover:scale-105 cursor-pointer"
                  >
                    <Play className="w-7 h-7 fill-current ms-0.5" />
                  </button>
                )}

                {/* Bilingual Live Captions Overlay (toggleable ON/OFF) */}
                {captionsEnabled && activeCue && (
                  <div className="pointer-events-none absolute bottom-4 inset-x-4 flex justify-center">
                    <div className="max-w-2xl px-4 py-2 rounded-xl bg-black/80 backdrop-blur-sm border border-[#D4AF37]/35 text-center text-xs sm:text-sm md:text-base text-[#F5F0E6] leading-relaxed whitespace-pre-line shadow-lg">
                      {activeCue.text}
                    </div>
                  </div>
                )}
              </div>

              {/* Pro Control Bar */}
              <div
                dir="ltr"
                className="bg-[#0D0D10] border-t border-white/10 p-3 sm:px-4 space-y-2.5"
              >
                {/* Scrubbing Bar */}
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-[#E5C158] tabular-nums w-12 text-center">
                    {formatClock(currentTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.5}
                    value={Math.min(currentTime, duration || 100)}
                    onChange={(e) => seekTo(Number(e.target.value))}
                    aria-label={tr('شريط التقديم', 'Seek bar')}
                    className="flex-1 accent-[#D4AF37] cursor-pointer h-1.5 rounded-lg"
                  />
                  <span className="font-mono text-[11px] text-[#A8A29E] tabular-nums w-12 text-center">
                    {formatClock(duration)}
                  </span>
                </div>

                {/* Transport, Speed, Captions & Fullscreen */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={playing ? tr('إيقاف مؤقت', 'Pause') : tr('تشغيل', 'Play')}
                      className="p-2 rounded-lg bg-[#D4AF37] text-[#09090B] hover:bg-[#F5D061] transition-colors cursor-pointer"
                    >
                      {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => seekTo(currentTime - 10)}
                      title="-10s"
                      className="p-2 rounded-lg bg-[#151519] border border-white/10 text-[#C8C2B8] hover:text-[#E5C158] cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => seekTo(currentTime + 10)}
                      title="+10s"
                      className="p-2 rounded-lg bg-[#151519] border border-white/10 text-[#C8C2B8] hover:text-[#E5C158] cursor-pointer"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>

                    <div className="hidden sm:flex items-center gap-1.5 ms-1">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="p-2 rounded-lg bg-[#151519] border border-white/10 text-[#C8C2B8] hover:text-[#E5C158] cursor-pointer"
                      >
                        {muted || volume === 0 ? (
                          <VolumeX className="w-4 h-4" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={muted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        className="w-16 accent-[#D4AF37] cursor-pointer"
                        aria-label="Volume"
                      />
                    </div>
                  </div>

                  {/* Speed + Captions Toggle + Fullscreen */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Playback Speed */}
                    <div className="flex items-center rounded-lg bg-[#151519] border border-white/10 p-0.5 overflow-x-auto">
                      {SPEED_OPTIONS.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => changeSpeed(rate)}
                          className={`px-2 py-1 rounded-md text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
                            playbackRate === rate
                              ? 'bg-[#D4AF37] text-[#09090B] font-bold'
                              : 'text-[#C8C2B8] hover:text-[#F5D061]'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>

                    {/* Captions ON/OFF Button */}
                    <button
                      type="button"
                      onClick={() => setCaptionsEnabled((p) => !p)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        captionsEnabled
                          ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#E5C158]'
                          : 'bg-[#151519] border-white/10 text-[#A8A29E]'
                      }`}
                    >
                      {captionsEnabled ? (
                        <Captions className="w-4 h-4" />
                      ) : (
                        <CaptionsOff className="w-4 h-4" />
                      )}
                      <span>
                        {captionsEnabled
                          ? tr('الترجمة: مفعلة', 'CC On')
                          : tr('الترجمة: مغلقة', 'CC Off')}
                      </span>
                    </button>

                    {/* Fullscreen Toggle */}
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      aria-label={tr('ملء الشاشة', 'Fullscreen')}
                      className="p-2 rounded-lg bg-[#151519] border border-white/10 text-[#F5F0E6] hover:border-[#D4AF37]/60 hover:text-[#F5D061] cursor-pointer"
                    >
                      {isFullscreen ? (
                        <Minimize className="w-4 h-4" />
                      ) : (
                        <Maximize className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Lecture Description & Allowed Downloads */}
            <div className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3">
              <p className="text-xs sm:text-sm text-[#C8C2B8] leading-relaxed">
                {lecture.description}
              </p>

              <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                {lecture.allowDownload ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {lecture.attachmentUrl && (
                      <a
                        href={lecture.attachmentUrl}
                        download={lecture.attachmentName || 'lecture-material'}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#F5D061] transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {tr('تحميل ملف المحاضرة', 'Download Material')}:{' '}
                          {lecture.attachmentName || tr('ملف مرفق', 'Attachment')}
                        </span>
                      </a>
                    )}
                    <a
                      href={lecture.videoUrl}
                      download={`${lecture.title}.mp4`}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#151519] border border-[#D4AF37]/40 text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{tr('تحميل الفيديو', 'Download Video')}</span>
                    </a>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 text-xs text-[#A8A29E]">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {tr(
                        'تحميل الملفات غير متاح لهذه المحاضرة بناءً على إعدادات المحاضر.',
                        'File downloads are restricted by the instructor for this lecture.'
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right / Personal Timestamped Lecture Notes */}
          <div className="lg:col-span-4 rounded-2xl bg-[#0D0D10] border border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-display text-sm font-bold text-[#E5C158]">
                  {tr('ملاحظاتك الخاصة بالمحاضرة', 'Personal Lecture Notes')}
                </h3>
              </div>
              <span className="font-mono text-xs text-[#A8A29E] tabular-nums">
                {notes.length}
              </span>
            </div>

            <form onSubmit={handleAddNote} className="space-y-2.5">
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={tr(
                  'اكتب ملاحظة مهمة وسيتم ربطها بالدقيقة الحالية في الفيديو...',
                  'Write a personal note linked to the current timestamp...'
                )}
                className="w-full px-3 py-2 rounded-xl bg-[#09090B] border border-white/10 text-xs sm:text-sm text-[#F5F0E6] placeholder-[#6B6661] focus:outline-none focus:border-[#D4AF37]"
              />
              <GoldChip
                type="submit"
                active={true}
                disabled={savingNote || !noteText.trim()}
                className="w-full text-xs py-2"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>
                  {tr(
                    `حفظ الملاحظة عند ${formatClock(currentTime)}`,
                    `Save Note at ${formatClock(currentTime)}`
                  )}
                </span>
              </GoldChip>
            </form>

            <div className="space-y-2.5 max-h-[340px] overflow-y-auto">
              {notes.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#A8A29E]">
                  {tr(
                    'لا توجد ملاحظات مسجلة لهذه المحاضرة بعد.',
                    'No personal notes recorded for this lecture yet.'
                  )}
                </div>
              ) : (
                notes.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-xl bg-[#151519] border border-white/10 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => seekTo(n.timestampSeconds)}
                        className="px-2 py-0.5 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/40 font-mono text-[11px] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors cursor-pointer tabular-nums"
                      >
                        {formatClock(n.timestampSeconds)}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(n.id)}
                        className="p-1 text-red-400 hover:text-red-300 cursor-pointer"
                        aria-label={tr('حذف الملاحظة', 'Delete note')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-[#F5F0E6] leading-relaxed whitespace-pre-wrap">
                      {n.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

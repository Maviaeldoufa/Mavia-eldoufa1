import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  HelpCircle,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  Trophy,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type {
  Quiz,
  QuizQuestion,
  QuizQuestionBreakdown,
  QuizSubmission,
  User,
} from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';

interface QuizRunnerProps {
  quiz: Quiz;
  initialSubmission?: QuizSubmission | null;
  onClose: () => void;
  onSubmitted: (submission: QuizSubmission) => void;
}

interface ShuffledOption {
  label: string;
  originalIndex: number;
}

interface RenderedQuestion {
  id: string;
  question: string;
  explanation?: string;
  displayOptions: ShuffledOption[];
}

function fisherYates<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildExamSession(quiz: Quiz): RenderedQuestion[] {
  const shouldShuffleQuestions = quiz.randomizeQuestions !== false;
  const shouldShuffleOptions = quiz.randomizeOptions !== false;

  const baseQuestions: QuizQuestion[] = shouldShuffleQuestions
    ? fisherYates(quiz.questions)
    : [...quiz.questions];

  const countLimit =
    quiz.questionsPerAttempt &&
    quiz.questionsPerAttempt > 0 &&
    quiz.questionsPerAttempt < baseQuestions.length
      ? quiz.questionsPerAttempt
      : baseQuestions.length;

  return baseQuestions.slice(0, countLimit).map((q) => {
    const indexedOpts: ShuffledOption[] = q.options.map((label, idx) => ({
      label,
      originalIndex: idx,
    }));
    return {
      id: q.id,
      question: q.question,
      explanation: q.explanation,
      displayOptions: shouldShuffleOptions
        ? fisherYates(indexedOpts)
        : indexedOpts,
    };
  });
}

function formatSecondsMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function QuizRunner({
  quiz,
  initialSubmission = null,
  onClose,
  onSubmitted,
}: QuizRunnerProps) {
  const { setUserDirect } = useAuth();
  const { tr, isEn } = useLanguage();

  const totalExamSeconds = Math.max(60, (quiz.durationMinutes || 15) * 60);

  const [sessionSeed, setSessionSeed] = useState(0);
  const renderedQuestions = useMemo(
    () => buildExamSession(quiz),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quiz.id, sessionSeed]
  );

  // Answers store the ORIGINAL option index (`originalIndex`), or -1 if unanswered
  const [answers, setAnswers] = useState<number[]>(() =>
    Array(renderedQuestions.length).fill(-1)
  );
  const [remainingSeconds, setRemainingSeconds] = useState(totalExamSeconds);
  const [submitting, setSubmitting] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [result, setResult] = useState<QuizSubmission | null>(initialSubmission);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong' | 'correct'>('all');
  const [error, setError] = useState<string | null>(null);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const remainingRef = useRef(remainingSeconds);
  remainingRef.current = remainingSeconds;
  const submittingRef = useRef(false);

  // Reset answers and timer when starting a fresh attempt
  useEffect(() => {
    if (!initialSubmission || sessionSeed > 0) {
      setAnswers(Array(renderedQuestions.length).fill(-1));
      setRemainingSeconds(totalExamSeconds);
      setResult(null);
      setAutoSubmitted(false);
      setError(null);
    }
  }, [renderedQuestions.length, totalExamSeconds, sessionSeed, initialSubmission]);

  const submitExam = useCallback(
    async (isAutoTimeout = false) => {
      if (submittingRef.current || result) return;

      const currentAnswers = answersRef.current;
      if (!isAutoTimeout && currentAnswers.some((a) => a === -1)) {
        setError(
          tr(
            'يرجى الإجابة على جميع الأسئلة قبل تسليم الاختبار (أو انتظر انتهاء المؤقت للتسليم التلقائي).',
            'Please answer all questions before submitting (or wait for the timer auto-submit).'
          )
        );
        return;
      }

      submittingRef.current = true;
      setError(null);
      setSubmitting(true);
      if (isAutoTimeout) setAutoSubmitted(true);

      const timeSpentSeconds = Math.max(
        1,
        totalExamSeconds - remainingRef.current
      );

      const responses = renderedQuestions.map((rq, idx) => ({
        questionId: rq.id,
        selectedIndex: currentAnswers[idx] ?? -1,
      }));

      if (quiz.isPracticeOnly) {
        let correctCount = 0;
        const breakdown: QuizQuestionBreakdown[] = renderedQuestions.map((rq, idx) => {
          const origQ = quiz.questions.find((q) => q.id === rq.id);
          const selectedIdx = currentAnswers[idx] ?? -1;
          const correctIndex = origQ ? origQ.correctIndex : 0;
          const isCorrect = selectedIdx === correctIndex;
          if (isCorrect) correctCount += 1;
          return {
            questionId: rq.id,
            question: rq.question,
            options: origQ ? origQ.options : rq.displayOptions.map((o) => o.label),
            selectedIndex: selectedIdx,
            correctIndex,
            isCorrect,
            explanation: rq.explanation,
          };
        });
        const totalQuestions = breakdown.length;
        const score = correctCount * (quiz.pointsPerQuestion || 20);
        const maxScore = totalQuestions * (quiz.pointsPerQuestion || 20);
        const practiceSub: QuizSubmission = {
          id: `practice-sub-${Date.now()}`,
          quizId: quiz.id,
          courseId: quiz.courseId,
          userId: 'practice',
          score,
          maxScore,
          correctCount,
          totalQuestions,
          timeSpentSeconds,
          breakdown,
          submittedAt: new Date().toISOString(),
        };
        setResult(practiceSub);
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }

      try {
        const data = await apiRequest<{
          submission: QuizSubmission;
          user: User;
        }>(`/api/quizzes/${quiz.id}/submit`, {
          method: 'POST',
          body: JSON.stringify({ responses, timeSpentSeconds }),
        });
        setUserDirect(data.user);
        setResult(data.submission);
        onSubmitted(data.submission);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : tr('تعذر إرسال الإجابات.', 'Could not submit answers.')
        );
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [onSubmitted, quiz, renderedQuestions, result, setUserDirect, totalExamSeconds, tr]
  );

  // Live countdown timer
  useEffect(() => {
    if (result) return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          void submitExam(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [result, submitExam]);

  const handleSelect = (qIndex: number, originalOptionIndex: number) => {
    if (result || submitting) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[qIndex] = originalOptionIndex;
      return next;
    });
  };

  const handleRetake = () => {
    setResult(null);
    setReviewFilter('all');
    setSessionSeed((s) => s + 1);
  };

  const answeredCount = answers.filter((a) => a !== -1).length;
  const isLowTime = !result && remainingSeconds <= 60;

  // Compute breakdown list from server submission
  const breakdownList: QuizQuestionBreakdown[] = useMemo(() => {
    if (!result) return [];
    if (Array.isArray(result.breakdown) && result.breakdown.length > 0) {
      return result.breakdown;
    }
    return [];
  }, [result]);

  const wrongCount = breakdownList.filter((b) => !b.isCorrect).length;
  const unansweredInReview = breakdownList.filter((b) => b.selectedIndex === -1).length;
  const accuracyPct =
    result && result.totalQuestions > 0
      ? Math.round((result.correctCount / result.totalQuestions) * 100)
      : 0;

  const filteredBreakdown = breakdownList.filter((item) => {
    if (reviewFilter === 'wrong') return !item.isCorrect;
    if (reviewFilter === 'correct') return item.isCorrect;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar with Live Timer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="space-y-1 min-w-0">
          <h3 className="font-display text-lg font-bold text-[#E5C158] truncate">
            {quiz.title}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#A8A29E] tabular-nums">
            <span>
              {result ? result.totalQuestions : renderedQuestions.length}{' '}
              {tr('سؤال', 'Questions')}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {quiz.pointsPerQuestion} {tr('نقطة/سؤال', 'pts/question')}
            </span>
            {(quiz.randomizeQuestions !== false || quiz.questionsPerAttempt) && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-[#D4AF37]">
                  <Shuffle className="w-3 h-3" />
                  <span>{tr('بنك أسئلة عشوائي', 'Random Bank')}</span>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {!result && (
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border font-mono text-sm font-bold tabular-nums transition-colors ${
                isLowTime
                  ? 'bg-red-950/70 border-red-500/60 text-red-200 animate-pulse'
                  : 'bg-[#0D0D10] border-[#D4AF37]/40 text-[#F5D061]'
              }`}
              title={tr('الوقت المتبقي للاختبار', 'Remaining Exam Time')}
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>{formatSecondsMMSS(remainingSeconds)}</span>
            </div>
          )}

          <GoldChip onClick={onClose} className="text-xs px-3 py-2">
            {tr('عودة للاختبارات', 'Back to Quizzes')}
          </GoldChip>
        </div>
      </div>

      {/* Progress Indicator during Active Attempt */}
      {!result && (
        <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#C8C2B8]">
            <span>
              {tr(
                `تمت الإجابة على ${answeredCount} من ${renderedQuestions.length} سؤال`,
                `Answered ${answeredCount} of ${renderedQuestions.length} questions`
              )}
            </span>
            <span className="font-mono text-[#E5C158] tabular-nums">
              {Math.round(
                (answeredCount / Math.max(1, renderedQuestions.length)) * 100
              )}
              %
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#D4AF37] to-[#F5D061] transition-all duration-300"
              style={{
                width: `${
                  (answeredCount / Math.max(1, renderedQuestions.length)) * 100
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* RESULT + MISTAKE ANALYSIS VIEW */}
      {result ? (
        <div className="space-y-5">
          {/* Score Summary Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-[#D4AF37]/15 via-[#121216] to-[#0D0D10] border border-[#D4AF37]/40 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#F5D061] shrink-0">
                  <Trophy className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-display text-lg sm:text-xl font-bold text-[#F5D061]">
                    {autoSubmitted
                      ? tr('انتهى الوقت — تم التصحيح التلقائي', 'Time Up — Auto-Graded')
                      : tr('نتيجة الاختبار وتحليل الأخطاء', 'Exam Result & Mistake Analysis')}
                  </h4>
                  <p className="text-xs text-[#C8C2B8]">
                    {accuracyPct >= 80
                      ? tr(
                          'أداء ممتاز! مستوى استيعاب قوي جداً.',
                          'Excellent performance! Strong mastery.'
                        )
                      : accuracyPct >= 50
                      ? tr(
                          'نتيجة جيدة، راجع الأخطاء بالأسفل لتثبيت المعلومات.',
                          'Good job! Review your mistakes below to reinforce key concepts.'
                        )
                      : tr(
                          'تحتاج لمراجعة هذه الجزئيات، يمكنك مراجعة التوضيح لكل خطأ بالأسفل.',
                          'Review the detailed explanations below and try again.'
                        )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <GoldChip
                  active={true}
                  onClick={handleRetake}
                  className="text-xs px-3.5 py-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{tr('محاولة جديدة عشوائية', 'New Random Attempt')}</span>
                </GoldChip>
              </div>
            </div>

            {/* 4 KPI Stat Boxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-[#09090B]/80 border border-white/10">
                <div className="text-[11px] text-[#A8A29E]">
                  {tr('الدرجة النهائية', 'Final Score')}
                </div>
                <div className="font-mono text-xl font-bold text-[#E5C158] tabular-nums mt-0.5">
                  {result.score} / {result.maxScore}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#09090B]/80 border border-white/10">
                <div className="text-[11px] text-[#A8A29E]">
                  {tr('نسبة النجاح', 'Accuracy')}
                </div>
                <div className="font-mono text-xl font-bold text-emerald-300 tabular-nums mt-0.5">
                  {accuracyPct}%
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#09090B]/80 border border-white/10">
                <div className="text-[11px] text-[#A8A29E]">
                  {tr('صحيح / خطأ', 'Correct / Wrong')}
                </div>
                <div className="font-mono text-xl font-bold tabular-nums mt-0.5">
                  <span className="text-emerald-300">{result.correctCount}</span>
                  <span className="text-[#A8A29E] mx-1">/</span>
                  <span className="text-red-300">
                    {result.totalQuestions - result.correctCount}
                  </span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#09090B]/80 border border-white/10">
                <div className="text-[11px] text-[#A8A29E]">
                  {tr('الوقت المستغرق', 'Time Spent')}
                </div>
                <div className="font-mono text-xl font-bold text-[#F5F0E6] tabular-nums mt-0.5">
                  {result.timeSpentSeconds
                    ? formatSecondsMMSS(result.timeSpentSeconds)
                    : '--:--'}
                </div>
              </div>
            </div>
          </div>

          {/* Mistake Analysis Filter Bar */}
          {breakdownList.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#E5C158]">
                  <Filter className="w-4 h-4" />
                  <span>{tr('تحليل الإجابات والأسئلة', 'Question-by-Question Analysis')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <GoldChip
                    active={reviewFilter === 'all'}
                    onClick={() => setReviewFilter('all')}
                    className="text-xs px-3 py-1"
                  >
                    {tr('الكل', 'All')} ({breakdownList.length})
                  </GoldChip>
                  <GoldChip
                    active={reviewFilter === 'wrong'}
                    onClick={() => setReviewFilter('wrong')}
                    className="text-xs px-3 py-1"
                  >
                    {tr('الأخطاء فقط', 'Mistakes Only')} ({wrongCount})
                  </GoldChip>
                  <GoldChip
                    active={reviewFilter === 'correct'}
                    onClick={() => setReviewFilter('correct')}
                    className="text-xs px-3 py-1"
                  >
                    {tr('الصحيحة فقط', 'Correct Only')} ({result.correctCount})
                  </GoldChip>
                </div>
              </div>

              {unansweredInReview > 0 && (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs">
                  {tr(
                    `يوجد ${unansweredInReview} سؤال لم تتم الإجابة عليه قبل انتهاء الوقت وتم احتسابه ضمن الأخطاء.`,
                    `${unansweredInReview} question(s) were left unanswered before timeout and counted as wrong.`
                  )}
                </div>
              )}

              {filteredBreakdown.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#A8A29E] rounded-xl bg-[#0D0D10] border border-white/10">
                  {reviewFilter === 'wrong'
                    ? tr(
                        'لا توجد أخطاء! إجاباتك كلها صحيحة ما شاء الله.',
                        'Zero mistakes! All your answers were correct.'
                      )
                    : tr('لا توجد أسئلة مطابقة للتصفية.', 'No questions match this filter.')}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredBreakdown.map((item, idx) => {
                    const isUnanswered = item.selectedIndex === -1;
                    return (
                      <div
                        key={item.questionId + '-' + idx}
                        className={`p-4 sm:p-5 rounded-xl border space-y-3 ${
                          item.isCorrect
                            ? 'bg-emerald-950/20 border-emerald-500/35'
                            : 'bg-red-950/20 border-red-500/35'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="text-sm font-semibold text-[#F5F0E6]">
                            <span
                              className={`font-mono text-[#D4AF37] tabular-nums ${
                                isEn ? 'mr-2' : 'ml-2'
                              }`}
                            >
                              {idx + 1}.
                            </span>
                            {item.question}
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold shrink-0 ${
                              item.isCorrect
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                                : isUnanswered
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                                : 'bg-red-950/80 text-red-300 border border-red-500/40'
                            }`}
                          >
                            {item.isCorrect ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{tr('صحيحة', 'Correct')}</span>
                              </>
                            ) : isUnanswered ? (
                              <>
                                <HelpCircle className="w-3.5 h-3.5" />
                                <span>{tr('بدون إجابة', 'Unanswered')}</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5" />
                                <span>{tr('خاطئة', 'Wrong')}</span>
                              </>
                            )}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {item.options.map((opt, optIdx) => {
                            const isCorrectOpt = optIdx === item.correctIndex;
                            const isStudentPick = optIdx === item.selectedIndex;
                            return (
                              <div
                                key={optIdx}
                                className={`px-3.5 py-2 rounded-lg text-xs border flex items-center justify-between gap-2 ${
                                  isCorrectOpt
                                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 font-semibold'
                                    : isStudentPick
                                    ? 'bg-red-950/60 border-red-500 text-red-200 font-semibold'
                                    : 'bg-[#121216] border-white/10 text-[#A8A29E]'
                                }`}
                              >
                                <span>{opt}</span>
                                <span className="shrink-0 text-[10px] font-bold">
                                  {isCorrectOpt
                                    ? tr('الإجابة الصحيحة', 'Correct')
                                    : isStudentPick
                                    ? tr('إجابتك', 'Your Pick')
                                    : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {item.explanation && (
                          <div className="p-3 rounded-lg bg-[#09090B]/70 border border-[#D4AF37]/25 text-xs text-[#E5C158]">
                            <strong>{tr('التوضيح العلمي:', 'Explanation:')}</strong>{' '}
                            <span className="text-[#C8C2B8]">{item.explanation}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ACTIVE EXAM ATTEMPT VIEW */
        <>
          <div className="space-y-4">
            {renderedQuestions.map((q, qIdx) => {
              const selectedOrigIdx = answers[qIdx];
              return (
                <div
                  key={q.id}
                  className="p-4 sm:p-5 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3"
                >
                  <div className="text-sm font-semibold text-[#F5F0E6]">
                    <span
                      className={`font-mono text-[#D4AF37] tabular-nums ${
                        isEn ? 'mr-2' : 'ml-2'
                      }`}
                    >
                      {qIdx + 1}.
                    </span>
                    {q.question}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {q.displayOptions.map((opt, displayIdx) => {
                      const isSelected = selectedOrigIdx === opt.originalIndex;
                      return (
                        <button
                          key={displayIdx}
                          type="button"
                          onClick={() => handleSelect(qIdx, opt.originalIndex)}
                          className={`${
                            isEn ? 'text-left' : 'text-right'
                          } px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-[#D4AF37] border-[#E5C158] text-[#09090B] font-semibold'
                              : 'bg-[#151519] border-white/10 text-[#C8C2B8] hover:border-[#D4AF37]/50'
                          }`}
                        >
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <span className="text-xs text-[#A8A29E]">
              {tr(
                'سيتم التصحيح التلقائي وعرض النتيجة وتحليل الأخطاء فور التسليم.',
                'Auto-grading & mistake analysis will be shown immediately after submission.'
              )}
            </span>
            <GoldChip
              active={true}
              disabled={submitting}
              onClick={() => void submitExam(false)}
              className="px-6 py-2.5"
            >
              {submitting
                ? tr('جاري التصحيح التلقائي...', 'Auto-Grading...')
                : tr('تسليم الاختبار وعرض التحليل', 'Submit & View Analysis')}
            </GoldChip>
          </div>
        </>
      )}
    </div>
  );
}

interface QuizBuilderProps {
  courseId: string;
  folderId?: string;
  onCreated: (quiz: Quiz) => void;
  onCancel: () => void;
}

export function QuizBuilder({
  courseId,
  folderId,
  onCreated,
  onCancel,
}: QuizBuilderProps) {
  const { tr } = useLanguage();
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [pointsPerQuestion, setPointsPerQuestion] = useState(25);
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState(0);
  const [randomizeQuestions, setRandomizeQuestions] = useState(true);
  const [randomizeOptions, setRandomizeOptions] = useState(true);
  const [releaseAt, setReleaseAt] = useState('');
  const [questions, setQuestions] = useState([
    { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' },
    ]);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length === 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(tr('يرجى إدخال عنوان الاختبار.', 'Please enter quiz title.'));
      return;
    }
    for (const q of questions) {
      if (!q.question.trim() || q.options.some((o) => !o.trim())) {
        setError(
          tr(
            'يرجى إكمال نص كل سؤال وخياراته الأربعة.',
            'Please complete every question and its 4 options.'
          )
        );
        return;
      }
    }

    setSaving(true);
    try {
      const data = await apiRequest<{ quiz: Quiz }>(
        `/api/courses/${courseId}/quizzes`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            folderId: folderId || undefined,
            releaseAt: releaseAt ? new Date(releaseAt).toISOString() : undefined,
            durationMinutes,
            pointsPerQuestion,
            randomizeQuestions,
            randomizeOptions,
            questionsPerAttempt,
            questions,
          }),
        }
      );
      onCreated(data.quiz);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('تعذر حفظ الاختبار.', 'Failed to save quiz.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleCreate}
      className="p-4 sm:p-5 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/30 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-base font-bold text-[#E5C158]">
          {tr(
            'إنشاء اختبار متطور (مؤقت + بنك أسئلة عشوائي)',
            'Create Advanced Quiz (Timer + Random Question Bank)'
          )}
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-[#A8A29E] hover:text-[#F5F0E6] cursor-pointer"
        >
          {tr('إلغاء', 'Cancel')}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Title & Timer & Points */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-2 space-y-1">
          <label className="block text-[11px] text-[#A8A29E]">
            {tr('عنوان الاختبار', 'Exam Title')}
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tr(
              'مثال: اختبار منتصف الفصل',
              'e.g. Midterm Comprehensive Exam'
            )}
            className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] text-[#E5C158]">
            {tr('مؤقت الامتحان (بالدقائق)', 'Exam Timer (minutes)')}
          </label>
          <input
            type="number"
            min={1}
            max={180}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono tabular-nums focus:outline-none focus:border-[#D4AF37]"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] text-[#A8A29E]">
            {tr('نقاط كل سؤال', 'Points / Question')}
          </label>
          <input
            type="number"
            min={5}
            max={100}
            value={pointsPerQuestion}
            onChange={(e) => setPointsPerQuestion(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono tabular-nums focus:outline-none focus:border-[#D4AF37]"
          />
        </div>
      </div>

      {/* Question Bank Settings */}
      <div className="p-3.5 rounded-xl bg-[#151519] border border-white/10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
        <div className="space-y-1">
          <label className="block text-[11px] text-[#A8A29E]">
            {tr('عدد أسئلة المحاولة (0 = الكل)', 'Questions / Attempt (0 = All)')}
          </label>
          <input
            type="number"
            min={0}
            max={questions.length}
            value={questionsPerAttempt}
            onChange={(e) => setQuestionsPerAttempt(Math.max(0, Number(e.target.value)))}
            className="w-full px-3 py-1.5 rounded-lg bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] font-mono tabular-nums focus:outline-none focus:border-[#D4AF37]"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-[#E5C158] cursor-pointer pt-2 sm:pt-4">
          <input
            type="checkbox"
            checked={randomizeQuestions}
            onChange={(e) => setRandomizeQuestions(e.target.checked)}
            className="accent-[#D4AF37] w-4 h-4"
          />
          <span>{tr('ترتيب عشوائي للأسئلة', 'Shuffle Questions')}</span>
        </label>

        <label className="flex items-center gap-2 text-xs text-[#E5C158] cursor-pointer pt-2 sm:pt-4">
          <input
            type="checkbox"
            checked={randomizeOptions}
            onChange={(e) => setRandomizeOptions(e.target.checked)}
            className="accent-[#D4AF37] w-4 h-4"
          />
          <span>{tr('ترتيب عشوائي للخيارات', 'Shuffle Options')}</span>
        </label>

        <div className="space-y-1">
          <label className="block text-[11px] text-[#A8A29E]">
            {tr('موعد الإتاحة (اختياري)', 'Release Countdown (Opt)')}
          </label>
          <input
            type="datetime-local"
            value={releaseAt}
            onChange={(e) => setReleaseAt(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg bg-[#09090B] border border-white/10 text-xs text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
          />
        </div>
      </div>

      {/* Bank Questions List */}
      <div className="space-y-4">
        {questions.map((q, qIdx) => (
          <div
            key={qIdx}
            className="p-3.5 rounded-lg bg-[#151519] border border-white/10 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#D4AF37]">
                {tr(`سؤال في البنك #${qIdx + 1}`, `Bank Question #${qIdx + 1}`)}
              </span>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(qIdx)}
                  className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{tr('حذف', 'Delete')}</span>
                </button>
              )}
            </div>
            <input
              type="text"
              required
              value={q.question}
              onChange={(e) => {
                const next = [...questions];
                next[qIdx].question = e.target.value;
                setQuestions(next);
              }}
              placeholder={tr('اكتب نص السؤال...', 'Write question text...')}
              className="w-full px-3 py-2 rounded-lg bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {q.options.map((opt, optIdx) => (
                <div key={optIdx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${qIdx}`}
                    checked={q.correctIndex === optIdx}
                    onChange={() => {
                      const next = [...questions];
                      next[qIdx].correctIndex = optIdx;
                      setQuestions(next);
                    }}
                    className="accent-[#D4AF37] cursor-pointer"
                    title={tr('تحديد كإجابة صحيحة', 'Mark as correct answer')}
                  />
                  <input
                    type="text"
                    required
                    value={opt}
                    onChange={(e) => {
                      const next = [...questions];
                      next[qIdx].options[optIdx] = e.target.value;
                      setQuestions(next);
                    }}
                    placeholder={tr(`الخيار ${optIdx + 1}`, `Option ${optIdx + 1}`)}
                    className="flex-1 px-2.5 py-1.5 rounded-md bg-[#09090B] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              ))}
            </div>
            <input
              type="text"
              value={q.explanation}
              onChange={(e) => {
                const next = [...questions];
                next[qIdx].explanation = e.target.value;
                setQuestions(next);
              }}
              placeholder={tr(
                'توضيح الإجابة (يظهر في تحليل الأخطاء بعد التصحيح)',
                'Answer explanation (shown in mistake analysis)'
              )}
              className="w-full px-3 py-1.5 rounded-lg bg-[#09090B] border border-white/10 text-xs text-[#C8C2B8] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <GoldChip type="button" onClick={addQuestion} className="text-xs px-3 py-1.5">
          <Plus className="w-3.5 h-3.5" />
          <span>{tr('إضافة سؤال للبنك', 'Add Question to Bank')}</span>
        </GoldChip>

        <GoldChip type="submit" active={true} disabled={saving}>
          {saving
            ? tr('جاري الحفظ...', 'Saving...')
            : tr('حفظ ونشر الاختبار', 'Save & Publish Quiz')}
        </GoldChip>
      </div>
    </form>
  );
}

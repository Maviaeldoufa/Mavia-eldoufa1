import { LogOut, RefreshCw, Wrench } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { AuthScreen } from './components/auth/AuthScreen';
import { WelcomeCelebrationScreen } from './components/auth/WelcomeCelebrationScreen';
import { FloatingChatbotWidget } from './components/ui/FloatingChatbotWidget';
import { FloatingLogo } from './components/ui/FloatingLogo';
import { Footer } from './components/ui/Footer';
import { GeoEngineeringBackground } from './components/ui/GeoEngineeringBackground';
import { MviaBrandMark } from './components/ui/MviaBrandMark';
import { Navbar } from './components/ui/Navbar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import type { NavSection, SystemStatusData } from './types';
import { apiRequest, getStoredToken } from './utils/api';

const HomeSection = lazy(() =>
  import('./components/home/HomeSection').then((m) => ({ default: m.HomeSection }))
);
const CoursesSection = lazy(() =>
  import('./components/courses/CoursesSection').then((m) => ({
    default: m.CoursesSection,
  }))
);
const LearningSection = lazy(() =>
  import('./components/learning/LearningSection').then((m) => ({
    default: m.LearningSection,
  }))
);
const GpaSection = lazy(() =>
  import('./components/gpa/GpaSection').then((m) => ({ default: m.GpaSection }))
);
const CommunitySection = lazy(() =>
  import('./components/community/CommunitySection').then((m) => ({
    default: m.CommunitySection,
  }))
);

const VISITOR_STORAGE_KEY = 'mvia_visitor_key';
const VISIT_SESSION_FLAG = 'mvia_visit_counted';

function getOrCreateVisitorKey(): string {
  let key = localStorage.getItem(VISITOR_STORAGE_KEY);
  if (!key) {
    key =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `v-${crypto.randomUUID()}`
        : `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VISITOR_STORAGE_KEY, key);
  }
  return key;
}

function reportClientError(message: string, stack?: string) {
  const token = getStoredToken();
  fetch('/api/monitoring/client-error', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message: message.slice(0, 450),
      path: window.location.pathname,
      stack: stack?.slice(0, 1000),
    }),
  }).catch(() => {});
}

function MviaWorkspace() {
  const { user, loading, justRegistered, logout } = useAuth();
  const { tr } = useLanguage();
  const [activeSection, setActiveSection] = useState<NavSection>('home');
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);

  // Check initial maintenance status and listen for 503 maintenance responses
  useEffect(() => {
    fetch('/api/status')
      .then((r) => (r.ok ? (r.json() as Promise<SystemStatusData>) : null))
      .then((data) => {
        if (data?.maintenance?.enabled) {
          setMaintenanceMessage(data.maintenance.message);
        } else {
          setMaintenanceMessage(null);
        }
      })
      .catch(() => {});

    const onMaintenance = (event: Event) => {
      const custom = event as CustomEvent<string>;
      setMaintenanceMessage(
        custom.detail ||
          'المنصة في وضع الصيانة حالياً لإجراء تحديثات. سنعود قريباً.'
      );
    };
    window.addEventListener('mvia:maintenance', onMaintenance);
    return () => window.removeEventListener('mvia:maintenance', onMaintenance);
  }, [user?.id]);

  // Global client error monitoring (throttled)
  useEffect(() => {
    let lastSent = 0;
    const maybeSend = (msg: string, stack?: string) => {
      const now = Date.now();
      if (now - lastSent < 10000) return;
      lastSent = now;
      reportClientError(msg, stack);
    };

    const onError = (ev: ErrorEvent) => {
      if (!ev.message) return;
      maybeSend(ev.message, ev.error instanceof Error ? ev.error.stack : undefined);
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      const msg =
        reason instanceof Error ? reason.message : String(reason || 'Unhandled promise rejection');
      if (msg.includes('Failed to fetch')) return;
      maybeSend(msg, reason instanceof Error ? reason.stack : undefined);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  // Record platform visit once per tab session & sync user identity when logged in
  useEffect(() => {
    const visitorKey = getOrCreateVisitorKey();
    const alreadyCounted = sessionStorage.getItem(VISIT_SESSION_FLAG) === '1';
    const token = getStoredToken();

    fetch('/api/analytics/visit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        visitorKey,
        countIncrement: !alreadyCounted,
      }),
    })
      .then((res) => {
        if (res.ok && !alreadyCounted) {
          sessionStorage.setItem(VISIT_SESSION_FLAG, '1');
        }
      })
      .catch(() => {});
  }, [user?.id]);

  // Track active study minutes for student dashboard
  useEffect(() => {
    if (!user || justRegistered || maintenanceMessage) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        apiRequest('/api/student/study-time', {
          method: 'POST',
          body: JSON.stringify({ minutes: 1 }),
        }).catch(() => {});
      }
    }, 60000);
    return () => window.clearInterval(interval);
  }, [user?.id, justRegistered, maintenanceMessage]);

  const handleOpenCourseFromHome = (courseId: string) => {
    setPendingCourseId(courseId);
    setActiveSection('courses');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center px-4 relative overflow-hidden">
        <GeoEngineeringBackground variant="page" />
        <div className="relative z-10 text-center space-y-3 flex flex-col items-center">
          <MviaBrandMark size="lg" />
          <p className="text-xs text-[#A8A29E]">
            {tr('جاري تحميل المنصة...', 'Loading MAVIA platform...')}
          </p>
        </div>
      </div>
    );
  }

  // Maintenance gate for non-admin signed-in users
  if (maintenanceMessage && user && user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#09090B] text-[#F5F0E6] flex flex-col justify-between px-4 relative overflow-hidden">
        <GeoEngineeringBackground variant="page" />
        <main className="relative z-10 flex-1 flex items-center justify-center py-12">
          <div className="w-full max-w-lg rounded-2xl bg-[#121216] border border-amber-500/40 p-6 sm:p-8 text-center space-y-5 shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300">
              <Wrench className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-bold text-[#E5C158]">
                {tr('المنصة في وضع الصيانة المجدولة', 'Scheduled Platform Maintenance')}
              </h1>
              <p className="text-sm text-[#C8C2B8] leading-relaxed">{maintenanceMessage}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] font-semibold text-xs hover:bg-[#E5C158] cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{tr('إعادة التحقق الآن', 'Check Status Again')}</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18181D] border border-white/15 text-[#F5F0E6] text-xs hover:border-[#D4AF37]/50 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{tr('تسجيل الخروج', 'Sign Out')}</span>
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {maintenanceMessage && (
          <div className="bg-amber-950/85 border-b border-amber-500/40 text-amber-100 text-xs text-center px-4 py-2.5">
            <strong>{tr('وضع الصيانة:', 'Maintenance Mode:')}</strong> {maintenanceMessage}
          </div>
        )}
        <AuthScreen />
      </>
    );
  }

  if (justRegistered) {
    return <WelcomeCelebrationScreen />;
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F5F0E6] flex flex-col relative overflow-x-hidden">
      <a href="#main-content" className="skip-to-content">
        {tr('تخطي إلى المحتوى الرئيسي', 'Skip to main content')}
      </a>

      <GeoEngineeringBackground variant="page" />

      {maintenanceMessage && user.role === 'admin' && (
        <div className="relative z-40 bg-amber-950/90 border-b border-amber-500/50 text-amber-100 text-xs text-center px-4 py-2">
          {tr(
            'تنبيه للأدمن: وضع الصيانة مُفعّل حالياً (الطلاب لا يمكنهم التصفح حتى يتم إيقافه من لوحة الصيانة بالأسفل).',
            'Admin Notice: Maintenance mode is currently ACTIVE (students see maintenance screen until disabled).'
          )}
        </div>
      )}

      <Navbar
        activeSection={activeSection}
        onChangeSection={setActiveSection}
      />

      <main
        id="main-content"
        className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-8"
      >
        <Suspense
          fallback={
            <div className="py-16 text-center text-xs text-[#A8A29E] space-y-2">
              <div className="mx-auto w-8 h-8 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin" />
              <p>{tr('جاري تحميل القسم...', 'Loading section...')}</p>
            </div>
          }
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeSection === 'home' && (
                <HomeSection
                  onNavigate={setActiveSection}
                  onOpenCourse={handleOpenCourseFromHome}
                />
              )}
              {activeSection === 'courses' && (
                <CoursesSection
                  initialCourseId={pendingCourseId}
                  onInitialCourseHandled={() => setPendingCourseId(null)}
                />
              )}
              {activeSection === 'learning' && <LearningSection />}
              {activeSection === 'gpa' && <GpaSection />}
              {activeSection === 'community' && <CommunitySection />}
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </main>

      {/* Floating Official MVIA Logo Medallion (bottom-right on wide screens) */}
      <div className="fixed bottom-16 right-5 z-30 hidden xl:block">
        <FloatingLogo
          size="md"
          onClick={() => {
            setActiveSection('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>

      {/* Bottom-Left Floating Platform Guide Chatbot */}
      <FloatingChatbotWidget
        activeSection={activeSection}
        onNavigate={setActiveSection}
      />

      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <LanguageProvider>
        <AuthProvider>
          <MviaWorkspace />
        </AuthProvider>
      </LanguageProvider>
    </MotionConfig>
  );
}

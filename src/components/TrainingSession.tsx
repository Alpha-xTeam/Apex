import React, { useState, useEffect, useRef } from 'react';
import CodeFixEditor from './CodeFixEditor';
import LogAnalysisEditor from './LogAnalysisEditor';
import VulnerabilityHunterEditor from './VulnerabilityHunterEditor';
import { useI18n } from './../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';

// Read-only cheat sheet for the Swiss Tools window.
// Only tools that appear in the current challenge's `toolsWhitelist` are shown.
const CHEATSHEET: Record<string, string> = {
  ls: 'سرد الملفات والمجلدات في المسار الحالي',
  cat: 'قراءة محتوى ملف (cat <name>)',
  cd: 'تغيير المجلد (cd <dir> أو cd ..)',
  pwd: 'عرض المسار الحالي',
  whoami: 'عرض اسم المستخدم الحالي',
  clear: 'مسح الشاشة',
  echo: 'طباعة نص (echo "hello")',
  python: 'تشغيل Python (python -c "...")',
  python3: 'تشغيل Python 3',
  openssl: 'أداة التشفير (openssl enc -d ...)',
  gpg: 'تشفير/فك GPG (gpg --decrypt ...)',
  base64: 'ترميز Base64 (base64 -d < file)',
  xxd: 'عرض hex (xxd file | head)',
  sha256sum: 'هاش SHA-256 لملف (sha256sum file)',
  md5sum: 'هاش MD5 لملف (md5sum file)',
  sha1sum: 'هاش SHA-1 لملف (sha1sum file)',
  tr: 'تحويل/حذف أحرف (tr A-Z a-z)',
  john: 'كاسر كلمات السر (john file)',
  hashcat: 'كاسر هاشات GPU (hashcat -m ...)',
  curl: 'طلبات HTTP (curl URL)',
  wget: 'تحميل ملف من URL',
  nc: 'netcat — اتصالات TCP/UDP',
  file: 'تحديد نوع ملف (file <name>)',
  strings: 'استخراج نصوص من binary (strings file)',
  grep: 'بحث في نص (grep pattern file)',
  awk: 'معالجة نصوص حسب أعمدة',
  sed: 'تحرير تيار (sed s/x/y/)',
  find: 'البحث عن ملفات (find . -name ...)',
  chmod: 'تغيير صلاحيات (chmod 755 file)',
  tar: 'فك/ضغط (tar -xf file.tar.gz)',
  zip: 'ضغط/فك (unzip file.zip)',
  gunzip: 'فك ضغط gzip (gunzip file.gz)',
  ncdu: 'مستعرض استخدام القرص',
  vi: 'محرر نصوص (vi file)',
  nano: 'محرر نصوص بسيط',
};
import {
  Terminal,
  Cpu,
  Loader2,
  CheckCircle,
  Flame,
  Globe,
  Lock,
  Eye,
  AlertTriangle,
  Check,
  FileText,
  Settings,
  Key,
  X,
  FolderOpen,
  Folder,
  Search,
  Power,
  Download,
  FileArchive,
  ArrowRight
} from 'lucide-react';
import { BlueTeamIcon, RedTeamIcon, StoryIcon, TaskIcon } from './TeamIcons';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

const authFetch = async (url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
  const rawSession = localStorage.getItem('cyberarena_session');
  let token = '';
  if (rawSession) {
    try {
      const parsed = JSON.parse(rawSession);
      token = parsed.access_token || parsed.session?.access_token || '';
    } catch {}
  }
  const headers = {
    ...options.headers,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  return fetch(url, { ...options, headers });
};

interface TrainingData {
  id?: string;
  scenarioId?: string;
  title: string;
  story: string;
  type: string;
  task: string;
  code?: string;
  codeLanguage?: string;
  htmlPreview?: string;
  logData?: string;
  configData?: string;
  vulnerabilityLocation?: string;
  hints: string[];
  expectedAnswer: string;
  explanation: string;
  xpReward: number;
  difficulty: string;
  files?: Record<string, string>;
  fileMetadata?: Record<string, any>;
  commandOutputs?: Record<string, { stdout: string; stderr?: string }>;
  toolsWhitelist?: string[];

  challengeType?: 'crypto' | string;
}

interface TrainingSessionProps {
  moduleTitle: string;
  categoryId: string;
  pathId: string;
  moduleId: string;
  teamRole?: 'red' | 'blue';
  challengeId?: string;
  /**
   * 1v1 mode only. When provided, the component skips its own
   * /api/training/generate fetch and uses this hydrated TrainingData
   * directly. The mock "preparing the challenge environment" animation
   * is also shortened. This prevents the duplicate fetch (and the
   * associated 1v1 loading-screen deadlock when the training lookup
   * takes too long).
   */
  initialTraining?: TrainingData | null;
  /**
   * 1v1 mode safety net. If `initialTraining` is null (the parent
   * OneVOneArena's fetch is still in flight, errored, or the Vite
   * HMR served a stale component), TrainingSession can recover on
   * its own by hitting the 1v1 challenge endpoint directly with
   * this match id + userId. This is the difference between
   * "stuck on the loading spinner forever" and "the player can
   * actually play the match".
   */
  oneVOneContext?: { matchId: string; userId: string } | null;
  onBack: () => void;
  /**
   * Optional 1v1 hook. Fires only when the user SOLVES the challenge
   * (local eval reports correct=true), with the same payload the
   * server-side /api/onevone/matches/{id}/submit endpoint expects.
   *   - Red team:                  the raw flag string
   *   - Web exploitation:          the payload string
   *   - Code fixing (blue):        { fixedCode }
   *   - Log analysis (blue):       { attackType, attackerIp, timestamp, ioc, explanation? }
   *   - VS Code "evaluate" (blue): { fixedCode }  (the editor's current content)
   */
  onChallengeSolved?: (payload: any) => void;
}

export const TrainingSession: React.FC<TrainingSessionProps> = ({
  moduleTitle, categoryId, pathId, moduleId, teamRole = 'red', challengeId, initialTraining, oneVOneContext, onBack, onChallengeSolved,
}) => {
  const { t } = useI18n();
  const [training, setTraining] = useState<TrainingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState('');
  const [hintIndex, setHintIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [error, setError] = useState('');
  const [showVuln, setShowVuln] = useState(false);

  // Simulated step & progress states
  const [simulatedStep, setSimulatedStep] = useState(0);
  const [simulatedPercent, setSimulatedPercent] = useState(0);
  const [simulatedTitle, setSimulatedTitle] = useState('Thinking...');

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hasCalledRef = useRef(false);

  // --- VS Code IDE Simulator States ---
  const [isOpenEditor, setIsOpenEditor] = useState(false);
  const [editorFiles, setEditorFiles] = useState<{ [key: string]: string }>({});
  const [selectedFile, setSelectedFile] = useState('index.html');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<{ secured: boolean; feedback: string } | null>(null);

  const [simulatedUrl, setSimulatedUrl] = useState('https://apex-train.com/lab-preview');

  // --- Windows OS Simulator States ---
  const [windowsState, setWindowsState] = useState<{ [key: string]: { isOpen: boolean; isMinimized: boolean; zIndex: number; x: number; y: number } }>({
    fileExplorer: { isOpen: true, isMinimized: false, zIndex: 10, x: 30, y: 30 },
    cryptoTools: { isOpen: false, isMinimized: false, zIndex: 11, x: 120, y: 40 },
    terminal: { isOpen: false, isMinimized: false, zIndex: 12, x: 80, y: 120 },
    notepad: { isOpen: false, isMinimized: false, zIndex: 13, x: 160, y: 80 }
  });

  const [activeWindow, setActiveWindow] = useState('fileExplorer');
  const [explorerPath, setExplorerPath] = useState('C:\\');
  const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);

  // --- Code Fixing Challenge States ---
  const [isCodeFixChallenge, setIsCodeFixChallenge] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeFixResult, setCodeFixResult] = useState<{ success: boolean; feedback: string } | null>(null);

  // --- Log Analysis Challenge States ---
  const [isLogAnalysisChallenge, setIsLogAnalysisChallenge] = useState(false);
  const [isSteganographyChallenge, setIsSteganographyChallenge] = useState(false);
  const [logAnalysisResult, setLogAnalysisResult] = useState<{
    passed: boolean;
    score: number;
    correct_fields: string[];
    feedback: string;
    xp_awarded: number;
  } | null>(null);

  // --- Vulnerability Hunter Challenge States ---
  const [isVulnHunterChallenge, setIsVulnHunterChallenge] = useState(false);
  const [vulnHunterResult, setVulnHunterResult] = useState<{ success: boolean; feedback: string } | null>(null);

  // --- Cryptography Solver Workspace States ---
  const [cryptoInput, setCryptoInput] = useState('');
  const [cryptoMethod, setCryptoMethod] = useState('base64');

  // Notepad state
  const [notepadTitle, setNotepadTitle] = useState('CyberArena_Readme.txt');
  const [notepadContent, setNotepadContent] = useState('');
  const [notepadEditable, setNotepadEditable] = useState(false);
  const [notepadSaving, setNotepadSaving] = useState(false);
  const [notepadStatus, setNotepadStatus] = useState<string>('');

  // Files the user wrote into the sandbox (e.g. python scripts created in notepad)
  const [userWorkdirFiles, setUserWorkdirFiles] = useState<{ name: string; content: string }[]>([]);

  // Windows Drag-and-drop state management
  const [draggingWindow, setDraggingWindow] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeZIndex, setActiveZIndex] = useState(15);

  // Windows Desktop navigable directory contents dynamically synced with the active dynamic challenge expected flag!
  const rawExpected = training?.expectedAnswer || 'CyberArena{C3RPT0_M15S10N_SUCCESS}';
  const primaryExpected = rawExpected.split('|')[0].trim();

  let dynamicB64 = '';
  try {
    dynamicB64 = btoa(primaryExpected);
  } catch (e) {
    dynamicB64 = btoa(encodeURIComponent(primaryExpected));
  }

  // --- Dynamic explorer: C:\ is fixed; C:\Work shows the challenge's `files` ---
  const challengeFileItems = (() => {
    const items: { type: 'file'; name: string; desc: string; content: string; editable?: boolean }[] = [];
    if (training?.files && Object.keys(training.files).length > 0) {
      for (const [name, b64] of Object.entries(training.files)) {
        let display = '';
        try { display = atob(b64); } catch { display = b64 as string; }
        items.push({ type: 'file', name, desc: 'ملف التحدي', content: display });
      }
    }
    // Append user-authored files (e.g. python scripts saved from notepad)
    const challengeNames = new Set(items.map(i => i.name));
    for (const f of userWorkdirFiles) {
      if (challengeNames.has(f.name)) continue;
      items.push({ type: 'file', name: f.name, desc: 'ملف من المستخدم', content: f.content, editable: true });
    }
    if (items.length === 0) {
      items.push({ type: 'file', name: 'CyberArena_Readme.txt', desc: 'ملف المساعدة والتعليمات', content: 'مرحباً بك في نظام المهمات السيبرانية من CyberArena!\nاستخدم مستكشف الملفات، CMD Terminal، والأدوات المتاحة لتجاوز التحديات.' });
    }
    return items;
  })();

  const directoryStructure: { [key: string]: { type: 'dir' | 'file'; name: string; desc: string; content?: string }[] } = {
    'C:\\': [
      { type: 'dir', name: 'Work', desc: 'مجلد العمل الحالي' },
      { type: 'dir', name: 'System32', desc: 'ملفات نظام ويندوز الأساسية' },
      { type: 'file', name: 'CyberArena_Readme.txt', desc: 'ملف المساعدة والتعليمات', content: 'مرحباً بك في نظام المهمات السيبرانية من CyberArena!\nاستخدم مستكشف الملفات، CMD Terminal، والأدوات المتاحة لتجاوز التحديات.' }
    ],
    'C:\\Work': challengeFileItems,
    'C:\\System32': [
      { type: 'file', name: 'kernel32.dll', desc: 'مكتبة النظام الأساسية', content: 'CyberArena SYSTEM WINDOWS KERNEL CORE DLL REGISTERED SUCCESSFULLY' },
      { type: 'file', name: 'cmd.exe', desc: 'موجه الأوامر التنفيذي', content: 'Command Executor' }
    ]
  };

  // --- Whitelist of tools available in the terminal (and shown in Cheat Sheet) ---
  const allowedTools: string[] = training?.toolsWhitelist && training.toolsWhitelist.length > 0
    ? training.toolsWhitelist
    : ['cat', 'ls', 'echo', 'cd', 'whoami', 'clear', 'help'];

  const commandOutputs: Record<string, { stdout: string; stderr?: string }> =
    training?.commandOutputs || {};

  // Terminal history state
  const [cmdInput, setCmdInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([
    'CyberArena(R) CYBERSEC OS [Version 11.2.2026]',
    '(c) CyberArena Security Systems Corporation. All rights reserved.',
    '',
    'اكتب help لعرض قائمة الأوامر المتاحة.'
  ]);

  // Window drag handlers
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    focusWindow(id);
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (rect) {
      setDraggingWindow(id);
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingWindow) return;

      const desktop = document.querySelector('.windows-desktop');
      const rect = desktop?.getBoundingClientRect();
      if (rect) {
        let newX = e.clientX - rect.left - dragOffset.x;
        let newY = e.clientY - rect.top - dragOffset.y;

        // Boundaries checks
        newX = Math.max(0, Math.min(newX, rect.width - 250));
        newY = Math.max(0, Math.min(newY, rect.height - 100));

        setWindowsState(prev => ({
          ...prev,
          [draggingWindow]: {
            ...prev[draggingWindow],
            x: newX,
            y: newY
          }
        }));
      }
    };

    const handleMouseUp = () => {
      setDraggingWindow(null);
    };

    if (draggingWindow) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingWindow, dragOffset]);

  useEffect(() => {
    if (hasCalledRef.current === challengeId) return;
    hasCalledRef.current = challengeId;
    generateTraining();
  }, [challengeId]);

  // --- v2: postMessage listener for web exploitation labs (REMOVED) ---
  // Web exploitation challenges have been removed from the platform.
  // The postMessage handler that captured `__APEX_EXPLOIT_OK__` sink
  // signals is gone; the lab iframe is no longer used for attack labs.

  const prettyPrintHtml = (input: string) => {
    const compact = input.replace(/>\s+</g, '><').trim();
    const withBreaks = compact
      .replace(/></g, '>\n<')
      .replace(/(<script[^>]*>)/gi, '$1\n')
      .replace(/(<\/script>)/gi, '\n$1')
      .replace(/(<style[^>]*>)/gi, '$1\n')
      .replace(/(<\/style>)/gi, '\n$1');

    const lines = withBreaks.split('\n').map(line => line.trim()).filter(Boolean);
    let indent = 0;
    const out: string[] = [];

    for (const line of lines) {
      const isClosingTag = /^<\//.test(line);
      const isOpeningTag = /^<[^!/][^>]*>$/.test(line) && !/\/>$/.test(line) && !line.includes('</');
      if (isClosingTag) indent = Math.max(indent - 1, 0);
      out.push(`${'  '.repeat(indent)}${line}`);
      if (isOpeningTag) indent += 1;
    }

    return out.join('\n');
  };

  const formatInlineJs = (input: string) => {
    const normalized = input
      .replace(/\r\n/g, '\n')
      .replace(/\s*([{};])\s*/g, '$1\n')
      .replace(/\n+/g, '\n')
      .trim();

    const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
    let indent = 0;
    const out: string[] = [];

    for (const line of lines) {
      const startsWithClose = line.startsWith('}');
      if (startsWithClose) indent = Math.max(indent - 1, 0);

      out.push(`${'  '.repeat(indent)}${line}`);

      const openCount = (line.match(/\{/g) || []).length;
      const closeCount = (line.match(/\}/g) || []).length;
      indent = Math.max(indent + openCount - closeCount, 0);
    }

    return out.join('\n');
  };

  const normalizeCodeForEditor = (rawCode: string, fileName: string) => {
    let code = (rawCode || '')
      .replace(/\r\n/g, '\n')
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .trim();

    const lowerFile = fileName.toLowerCase();

    if (lowerFile.endsWith('.json')) {
      try {
        return JSON.stringify(JSON.parse(code), null, 2);
      } catch {
        return code;
      }
    }

    if (lowerFile.endsWith('.html') || code.includes('<html') || code.includes('<!DOCTYPE')) {
      const withFormattedScripts = code.replace(
        /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi,
        (_match, openTag, scriptBody, closeTag) => `${openTag}\n${formatInlineJs(scriptBody)}\n${closeTag}`
      );
      return prettyPrintHtml(withFormattedScripts);
    }

    if (lowerFile.endsWith('.sql') && !code.includes('\n')) {
      return code.replace(/;\s*/g, ';\n').trim();
    }

    return code;
  };

  const generateTraining = async () => {
    setLoading(true);
    setShowResult(false);
    setAnswer('');
    setHintIndex(0);
    setError('');
    setShowVuln(false);
    setAttempts(0);
    setTraining(null);
    setSimulatedStep(0);
    setSimulatedPercent(0);
      setSimulatedTitle('Loading scenario...');
    setIsOpenEditor(false);
    setEvalResult(null);
    setEditorFiles({});
    setSelectedFile('index.html');
    setNotepadContent('');
    setNotepadEditable(false);
    setNotepadSaving(false);
    setNotepadStatus('');
    setUserWorkdirFiles([]);
    setVulnHunterResult(null);
    setIsVulnHunterChallenge(false);

    let isFinishedFetching = false;
    let fetchedTraining: TrainingData | null = null;
    let fetchErrorMsg = '';

    // 1v1 fast path: caller already fetched the challenge via
    // /api/onevone/matches/{id}/challenge. Skip BOTH the duplicate
    // /api/training/generate round-trip AND the ~7s mock
    // "preparing the environment" animation. Just set the training
    // data and exit loading immediately.
    if (initialTraining) {
      console.log('[TS] 1v1 fast path (initialTraining prop)');
      setTraining(initialTraining);
      const ft: any = initialTraining;
      setIsCodeFixChallenge(
        teamRole === 'blue' &&
        ft.type !== 'vulnerability-hunter' &&
        (
          ft.type === 'code-fixing' ||
          ft.type?.startsWith('code-fixing') ||
          (ft.language !== undefined && ft.vulnerable_code !== undefined)
        )
      );
      setIsLogAnalysisChallenge(teamRole === 'blue' && ft.type === 'log-analysis');
      setIsVulnHunterChallenge(teamRole === 'blue' && ft.type === 'vulnerability-hunter');
      setIsSteganographyChallenge(ft.type === 'steganography');
      setSimulatedStep(5);
      setSimulatedPercent(100);
      setSimulatedTitle('Lab fully prepared!');
      setLoading(false);
      return;
    }

    // 1v1 fallback path: initialTraining was null (parent fetch is
    // still in flight, errored, or Vite HMR served a stale component).
    // If the caller gave us the 1v1 match context, fetch the challenge
    // ourselves from the 1v1 endpoint. This is the difference between
    // "stuck on the loading spinner forever" and "the player can
    // actually play the match". Up to 4 attempts with exponential
    // backoff (1s, 2s, 4s, 8s) to absorb transient network blips.
    if (oneVOneContext) {
      console.log('[TS] 1v1 fallback path: fetching challenge for match', oneVOneContext.matchId);
      try {
        const { matchId, userId } = oneVOneContext;
        let res: Response | null = null;
        let attemptData: any = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          res = await fetch(
            `${API_URL}/onevone/matches/${matchId}/challenge?userId=${userId}`,
          );
          if (res.ok) {
            attemptData = await res.json();
            break;
          }
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
        }
        if (res && res.ok && attemptData && attemptData.training) {
          console.log('[TS] 1v1 fallback succeeded, hydrating training');
          const ft: any = attemptData.training;
          setTraining(ft);
          setIsCodeFixChallenge(
            teamRole === 'blue' &&
            ft.type !== 'vulnerability-hunter' &&
            (
              ft.type === 'code-fixing' ||
              ft.type?.startsWith('code-fixing') ||
              (ft.language !== undefined && ft.vulnerable_code !== undefined)
            )
          );
          setIsLogAnalysisChallenge(teamRole === 'blue' && ft.type === 'log-analysis');
          setIsVulnHunterChallenge(teamRole === 'blue' && ft.type === 'vulnerability-hunter');
          setIsSteganographyChallenge(ft.type === 'steganography');
          setSimulatedStep(5);
          setSimulatedPercent(100);
          setSimulatedTitle('Lab fully prepared!');
          setLoading(false);
          return;
        }
        console.warn('[TS] 1v1 fallback exhausted retries; falling through to training/generate');
      } catch (e) {
        console.warn('[TS] 1v1 fallback threw, falling through to training/generate', e);
      }
    }

    const apiFetchPromise = (async () => {
      try {
        const res = await authFetch(`${API_URL}/training/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module: moduleId || moduleTitle, path: pathId, category: categoryId, moduleId, teamRole, challengeId }),
        });

        if (!res.ok) {
          throw new Error('Server Error');
        }

        const data = await res.json();
        if (data.detail) {
          throw new Error(data.detail);
        }
        fetchedTraining = data.training || data;
      } catch (err: any) {
        console.warn('Supabase Edge function is offline or timed out. Gracefully degrading to ultra-secure premium offline fallback challenge...');

        // --- PREMIUM OFFLINE FALLBACK CHALLENGES ---
        if (pathId === 'web-security') {
          fetchedTraining = {
            title: "ثغرة حقن نصوص البرمجة عبر المواقع (XSS) في منصة التعليقات",
            story: "أنت في مهمة استخباراتية لاختراق بوابة التعليقات الخاصة بموقع المطورين الأمني. اكتشف المهندسون وجود ثغرة XSS خطيرة حيث يقوم الموقع بعرض التعليقات مباشرة باستخدام خاصية innerHTML دون تعقيم المدخلات. مهمتك هي العثور على طريقة لحقن حمولة XSS تفاعلية لإثبات الثغرة، ثم الدخول إلى المحرر البرمجي لتأمين الكود بشكل سليم.",
            type: "xss_injection",
            task: "اكتب تعليقاً يحتوي على حمولة XSS تفاعلية (مثل <img src=x onerror=alert(1)>) لإثبات الثغرة، ثم افتح محرر الأكواد (VS Code) لإصلاح الخلل في ملف index.html عن طريق استبدال innerHTML بخاصية آمنة مثل textContent.",
            code: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>بوابة التعليقات الآمنة - CyberArena</title>
    <style>
        body { font-family: sans-serif; background: #0f172a; color: #fff; padding: 20px; text-align: center; }
        .card { background: #1e293b; padding: 24px; border-radius: 12px; max-width: 500px; margin: 40px auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        input, button { width: 100%; padding: 12px; margin: 8px 0; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { background: #6366f1; cursor: pointer; font-weight: bold; border: none; }
        button:hover { background: #4f46e5; }
        .comments { text-align: right; margin-top: 20px; border-top: 1px solid #334155; padding-top: 15px; }
        .comment-item { background: #334155; padding: 10px; border-radius: 6px; margin: 6px 0; font-size: 14px; }
    </style>
</head>
<body>
    <div class="card">
        <h2>قسم تعليقات الموقع الأمني 💬</h2>
        <input type="text" id="commentInput" placeholder="اكتب تعليقك هنا..." />
        <button onclick="addComment()">إرسال التعليق</button>
        <div class="comments" id="commentsContainer">
            <div class="comment-item">مرحباً بكم في منصة التطوير الأمني! التعليقات آمنة حالياً.</div>
        </div>
    </div>

    <script>
        function addComment() {
            const input = document.getElementById('commentInput');
            const commentText = input.value;
            if (!commentText) return;
            
            const container = document.getElementById('commentsContainer');
            const newComment = document.createElement('div');
            newComment.className = 'comment-item';
            
            // الثغرة الأمنية تقع هنا باستخدام innerHTML لعرض النص مباشرة!
            newComment.innerHTML = commentText;
            
            container.appendChild(newComment);
            input.value = '';
        }
    </script>
</body>
</html>`,
            codeLanguage: "html",
            htmlPreview: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>بوابة التعليقات الآمنة - CyberArena</title>
    <style>
        body { font-family: sans-serif; background: #0f172a; color: #fff; padding: 20px; text-align: center; }
        .card { background: #1e293b; padding: 24px; border-radius: 12px; max-width: 500px; margin: 40px auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        input, button { width: 100%; padding: 12px; margin: 8px 0; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { background: #6366f1; cursor: pointer; font-weight: bold; border: none; }
        button:hover { background: #4f46e5; }
        .comments { text-align: right; margin-top: 20px; border-top: 1px solid #334155; padding-top: 15px; }
        .comment-item { background: #334155; padding: 10px; border-radius: 6px; margin: 6px 0; font-size: 14px; }
    </style>
</head>
<body>
    <div class="card">
        <h2>قسم تعليقات الموقع الأمني 💬</h2>
        <input type="text" id="commentInput" placeholder="اكتب تعليقك هنا..." />
        <button onclick="addComment()">إرسال التعليق</button>
        <div class="comments" id="commentsContainer">
            <div class="comment-item">مرحباً بكم في منصة التطوير الأمني! التعليقات آمنة حالياً.</div>
        </div>
    </div>

    <script>
        function addComment() {
            const input = document.getElementById('commentInput');
            const commentText = input.value;
            if (!commentText) return;
            
            const container = document.getElementById('commentsContainer');
            const newComment = document.createElement('div');
            newComment.className = 'comment-item';
            
            newComment.innerHTML = commentText;
            
            container.appendChild(newComment);
            input.value = '';
        }
    </script>
</body>
</html>`,
            vulnerabilityLocation: "سطر 32: استخدام خاصية innerHTML بدلاً من textContent يعرض الموقع لثغرات حقن البرمجيات الخبيثة XSS.",
            hints: [
              "ابحث عن الكود المكتوب بـ JavaScript في الجزء السفلي من ملف index.html.",
              "الثغرة واضحة وتكمن في سطر newComment.innerHTML = commentText.",
              "لتأمين الخلل بشكل سليم، قم بتغيير innerHTML إلى textContent."
            ],
            expectedAnswer: "alert(1)|img src=x onerror|script|onerror",
            explanation: "ثغرة XSS تظهر عند دمج مدخلات المستخدم مباشرة مع الكود التنفيذي للصفحة دون تنظيف، مما يسمح للمهاجم بتنفيذ نصوص برمجية خبيثة في متصفح الزائر.",
            xpReward: 150,
            difficulty: "متوسط"
          };
        } else {
          fetchedTraining = {
            title: "فك تشفير ملف الاتصالات الاستخباراتية المسرب",
            story: "تم اعتراض قناة اتصال مشفرة تحتوي على ملف حساس جداً خاص بجهاز أمني معادٍ. تشير التحليلات الأولية أن الملف تم تشفيره كلياً باستخدام خوارزمية Base64 كطبقة حماية أولى لسرعة النقل. الملف مخزن داخل مجلد Secrets في القرص C باسم secret.enc.",
            type: "cryptography",
            task: "افتح مستكشف الملفات في نظام التشغيل المحاكي، وانتقل إلى مجلد Secrets ثم انقر نقراً مزدوجاً على الملف secret.enc لفتحه وإرساله للأداة، أو انسخه واستخدم أداة فك التشفير السيبرانية Crypto Decryptor مع اختيار خوارزمية Base64 Decode للحصول على العلم.",
            hints: [
              "المجلد المطلوب هو C:\\Secrets",
              "الملف المستهدف هو secret.enc",
              "افتح أداة فك التشفير واختر خوارزمية Base64 Decode لفك التشفير والحصول على العلم."
            ],
            expectedAnswer: "APEX{DEC_SUCCESS_2026}",
            explanation: "تشفير Base64 هو ترميز ثنائي لنقل البيانات النصية بسهولة وليس خوارزمية تشفير أمنية، ويمكن فكه فوراً بأي أداة فك ترميز.",
            xpReward: 120,
            difficulty: "سهل"
          };
        }
      } finally {
        isFinishedFetching = true;
      }
    })();

    const runSimulation = async () => {
      setSimulatedStep(0);
      for (let i = 0; i <= 20; i += 2) {
        setSimulatedPercent(i);
        await new Promise((r) => setTimeout(r, 70));
      }

      setSimulatedStep(1);
      for (let i = 21; i <= 40; i += 2) {
        setSimulatedPercent(i);
        await new Promise((r) => setTimeout(r, 70));
      }

      setSimulatedStep(2);
      setSimulatedTitle('Building the interactive challenge from the scenario...');
      for (let i = 41; i <= 60; i += 2) {
        setSimulatedPercent(i);
        await new Promise((r) => setTimeout(r, 100));
      }

      setSimulatedStep(3);
      setSimulatedTitle('Setting up the web simulator and injecting a real-world vulnerability...');
      for (let i = 61; i <= 80; i += 2) {
        setSimulatedPercent(i);
        await new Promise((r) => setTimeout(r, 120));
      }

      setSimulatedStep(4);
      setSimulatedTitle('Finalizing the security scan and assembling the lab...');
      for (let i = 81; i <= 98; i++) {
        setSimulatedPercent(i);
        await new Promise((r) => setTimeout(r, 150));
      }

      while (!isFinishedFetching) {
        await new Promise((r) => setTimeout(r, 200));
      }

      if (fetchErrorMsg) {
        setError(fetchErrorMsg);
        setLoading(false);
        return;
      }

      if (fetchedTraining) {
        setSimulatedStep(5);
        setSimulatedPercent(100);
        setSimulatedTitle('Lab fully prepared!');
        await new Promise((r) => setTimeout(r, 600));

        setEditorFiles({
          'index.html': normalizeCodeForEditor(fetchedTraining.htmlPreview || fetchedTraining.code || '<!-- Code not loaded -->', 'index.html'),
          'security_config.json': `{
  "security": {
    "xss_filtering": false,
    "sql_parameterization": false,
    "allow_modals": true,
    "debug_mode": true
  },
  "database": {
    "driver": "sqlite",
    "storage": "./data/cyberarena_db.sqlite"
  }
}`,
          'database.sql': `-- قاعدة بيانات تحدي: ${fetchedTraining.title}
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT,
  price REAL,
  is_active INTEGER DEFAULT 1
);

INSERT INTO products (name, price, is_active) VALUES ('كمبيوتر محمول', 2500, 1);
INSERT INTO products (name, price, is_active) VALUES ('هاتف ذكي', 1200, 1);
INSERT INTO products (name, price, is_active) VALUES ('بيانات سرية فائقة الأهمية 🔒', 9999, 0);`
        });

        setTraining(fetchedTraining);
        // Detect code-fixing challenges (blue team with type='code-fixing').
        // We deliberately check `type` first because vulnerability-hunter
        // challenges also carry `language` + `vulnerable_code` but must
        // NOT be misclassified as code-fixing (they have a different UX).
        setIsCodeFixChallenge(
          teamRole === 'blue' &&
          fetchedTraining.type !== 'vulnerability-hunter' &&
          (
            fetchedTraining.type === 'code-fixing' ||
            fetchedTraining.type?.startsWith('code-fixing') ||
            (
              (fetchedTraining as any).language !== undefined &&
              (fetchedTraining as any).vulnerable_code !== undefined
            )
          )
        );
        // Detect log-analysis challenges (blue team with explicit type='log-analysis')
        setIsLogAnalysisChallenge(
          teamRole === 'blue' && fetchedTraining.type === 'log-analysis'
        );
        // Detect vulnerability-hunter challenges (blue team with type='vulnerability-hunter')
        const ft: any = fetchedTraining;
        setIsVulnHunterChallenge(
          teamRole === 'blue' && ft.type === 'vulnerability-hunter'
        );
        setIsSteganographyChallenge(ft.type === 'steganography');
        setLoading(false);
      } else {
        setError('Failed to receive cyber lab contents.');
        setLoading(false);
      }
    };

    await Promise.all([apiFetchPromise, runSimulation()]);
  };

  const handleUrlNavigation = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: '__APEX_URL_CHANGE__',
        url: simulatedUrl
      }, '*');
    }
  };

  const handleSubmit = async () => {
    const userAnswer = answer.trim().toLowerCase();
    const expected = training?.expectedAnswer?.toLowerCase() || '';

    // --- Web payload normalization ---
    // Web exploitation payloads (XSS, SQLi, ...) often vary in quoting/case
    // (e.g. "<img src=x onerror=alert(1)>" vs "<img src=\"x\" onerror=\"alert(1)\">").
    // Normalize both sides so equivalent payloads match.
    const normalizeWebPayload = (s: string): string => {
      return s
        .replace(/['"]/g, '')                          // strip quotes
        .replace(/\s*=\s*/g, '=')                      // normalize = spacing
        .replace(/\s+/g, ' ')                          // collapse whitespace
        .replace(/<[^>]+>/g, m => m.toLowerCase())     // lowercase tag names
        .trim();
    };

    // Bidirectional matching to accept both raw flags and formatted flags (e.g., with or without APEX{} wrapper)
    const correct = expected.split('|').some((e: string) => {
      const trimmedExpected = e.trim();
      if (!userAnswer || !trimmedExpected) return false;
      return (
        userAnswer.includes(trimmedExpected) ||
        trimmedExpected.includes(userAnswer) ||
        userAnswer.replace(/[^a-z0-9]/g, '') === trimmedExpected.replace(/[^a-z0-9]/g, '') ||
        normalizeWebPayload(userAnswer) === normalizeWebPayload(trimmedExpected)
      );
    });

    setIsCorrect(correct);
    setShowResult(true);

    if (correct) {
      // Notify the 1v1 wrapper (if any) so the server can claim the win
      onChallengeSolved?.(answer.trim());
    }

    if (correct && training) {
      try {
        const raw = localStorage.getItem('cyberarena_session') || '{}';
        const session = JSON.parse(raw);
        const userData = session.user || session;
        const userId = userData.id;
        if (userId) {
          await authFetch(`${API_URL}/xp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_xp', user_id: userId, xp_amount: training.xpReward }),
          });
        }

        if ((training.id || training.scenarioId) && !onChallengeSolved) {
          authFetch(`${API_URL}/training/solved`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenarioId: training.scenarioId || training.id,
              teamRole,
              module: training.type || moduleId || moduleTitle,
              path: pathId,
              category: categoryId,
              difficulty: training.difficulty || 'متوسط'
            })
          }).catch(err => console.error('Error reporting solved challenge:', err));
        }
      } catch { }
    }
  };

  // --- Retry the SAME challenge (clear answer, hide result panel,
  //     keep all the training data, hints, files, etc.) ---
  const [attempts, setAttempts] = useState(0);

  const handleRetrySame = () => {
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
    setError('');
    setAttempts((a) => a + 1);
  };

  // --- Code Fixing Challenge Submit ---
  const handleCodeFixSubmit = async (fixedCode: string) => {
    if (!training) return;
    setIsVerifying(true);
    setCodeFixResult(null);

    try {
      const res = await authFetch(`${API_URL}/training/evaluate-code-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: training.scenarioId || training.id,
          fixedCode,
          teamRole: 'blue',
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t}`);
      }

      const data = await res.json();
      const evaluation = data?.evaluation;
      if (!evaluation || typeof evaluation !== 'object') {
        throw new Error('Invalid response from server: missing evaluation object.');
      }
      setCodeFixResult({
        success: !!evaluation.secured,
        feedback: evaluation.feedback || (evaluation.secured ? 'تم تأمين الكود بنجاح!' : 'الثغرة لم تُصلح بعد.'),
      });

      if (evaluation.secured) {
        setIsCorrect(true);
        setShowResult(true);

        // Notify the 1v1 wrapper (if any) so the server can claim the win
        onChallengeSolved?.({ fixedCode });

        // Add XP
        const raw = localStorage.getItem('cyberarena_session') || '{}';
        const session = JSON.parse(raw);
        const userData = session.user || session;
        const userId = userData.id;
        if (userId) {
          await authFetch(`${API_URL}/xp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add_xp',
              user_id: userId,
              xp_amount: training.xpReward,
            }),
          });
        }

        // Mark as solved
        if ((training.id || training.scenarioId) && !onChallengeSolved) {
          authFetch(`${API_URL}/training/solved`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenarioId: training.scenarioId || training.id,
              teamRole: 'blue',
              module: training.type || moduleId || moduleTitle,
              path: pathId,
              category: categoryId,
              difficulty: training.difficulty || 'متوسط',
            }),
          }).catch(err => console.error('Error reporting solved:', err));
        }
      }
    } catch (err: any) {
      setCodeFixResult({
        success: false,
        feedback: 'عذراً، فشل الاتصال بخادم التقييم. حاول مرة أخرى.\n' + (err?.message || ''),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // --- Log Analysis Challenge Submit ---
  const handleLogAnalysisSubmit = async (data: {
    attackType: string;
    attackerIp: string;
    timestamp: string;
    ioc: string;
    explanation: string;
  }) => {
    if (!training) return;
    setIsVerifying(true);
    setLogAnalysisResult(null);

    try {
      const res = await authFetch(`${API_URL}/training/evaluate-log-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: training.scenarioId || training.id,
          ...data,
          teamRole: 'blue',
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t}`);
      }

      const result = (await res.json())?.evaluation;
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response from server: missing evaluation object.');
      }
      setLogAnalysisResult(result);

      if (result.passed) {
        setIsCorrect(true);
        setShowResult(true);

        // Notify the 1v1 wrapper (if any) so the server can claim the win
        onChallengeSolved?.({
          attackType: data.attackType,
          attackerIp: data.attackerIp,
          timestamp: data.timestamp,
          ioc: data.ioc,
          explanation: data.explanation,
        });

        const raw = localStorage.getItem('cyberarena_session') || '{}';
        const session = JSON.parse(raw);
        const userData = session.user || session;
        const userId = userData.id;
        if (userId) {
          await authFetch(`${API_URL}/xp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add_xp',
              user_id: userId,
              xp_amount: result.xp_awarded,
            }),
          });
        }

        if ((training.id || training.scenarioId) && !onChallengeSolved) {
          authFetch(`${API_URL}/training/solved`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenarioId: training.scenarioId || training.id,
              teamRole: 'blue',
              module: training.type || moduleId || moduleTitle,
              path: pathId,
              category: categoryId,
              difficulty: training.difficulty || 'متوسط',
            }),
          }).catch(err => console.error('Error reporting solved:', err));
        }
      }
    } catch (err: any) {
      setLogAnalysisResult({
        passed: false,
        score: 0,
        correct_fields: [],
        feedback: 'عذراً، فشل الاتصال بخادم التقييم. حاول مرة أخرى.\n' + (err?.message || ''),
        xp_awarded: 0,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // --- Vulnerability Hunter Challenge Submit ---
  const handleVulnHunterSubmit = async (vulnerabilityType: string) => {
    if (!training) return;
    setIsVerifying(true);
    setVulnHunterResult(null);

    try {
      const raw = localStorage.getItem('cyberarena_session') || '{}';
      const session = JSON.parse(raw);
      const userData = session.user || session;
      const userId = userData.id;

      const res = await authFetch(`${API_URL}/training/evaluate-vulnerability-hunter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: training.scenarioId || training.id,
          userId: userId || undefined,
          vulnerabilityType,
          teamRole: 'blue',
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t}`);
      }

      const data = await res.json();
      const evaluation = data?.evaluation;
      if (!evaluation || typeof evaluation !== 'object') {
        throw new Error('Invalid response from server: missing evaluation object.');
      }
      const passed = !!evaluation.passed;
      setVulnHunterResult({
        success: passed,
        feedback: evaluation.feedback || (passed ? 'إجابة صحيحة!' : 'إجابة خاطئة.'),
      });

      if (passed) {
        setIsCorrect(true);
        setShowResult(true);

        // Notify the 1v1 wrapper (if any) so the server can claim the win
        onChallengeSolved?.({ vulnerabilityType });

        // Add XP
        if (userId) {
          await authFetch(`${API_URL}/xp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add_xp',
              user_id: userId,
              xp_amount: evaluation.xp_awarded || training.xpReward,
            }),
          });
        }

        // Mark as solved
        if ((training.id || training.scenarioId) && !onChallengeSolved) {
          authFetch(`${API_URL}/training/solved`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenarioId: training.scenarioId || training.id,
              teamRole: 'blue',
              module: training.type || moduleId || moduleTitle,
              path: pathId,
              category: categoryId,
              difficulty: training.difficulty || 'متوسط',
            }),
          }).catch(err => console.error('Error reporting solved:', err));
        }
      }
    } catch (err: any) {
      setVulnHunterResult({
        success: false,
        feedback: 'عذراً، فشل الاتصال بخادم التقييم. حاول مرة أخرى.\n' + (err?.message || ''),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // --- VS Code Code Change Sync ---
  const handleEditorCodeChange = (newCode: string) => {
    setEditorFiles({
      ...editorFiles,
      [selectedFile]: newCode
    });
  };

  // --- VS Code AI Secure Code Evaluation ---
  const handleEvaluateFix = async () => {
    if (!training) return;
    setIsEvaluating(true);
    setEvalResult(null);

    try {
      const userCode = editorFiles['index.html'];
      const res = await authFetch(`${API_URL}/training/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          originalChallenge: training,
          userCode,
          teamRole
        })
      });

      if (!res.ok) throw new Error('Failed to check the code from the server.');
      const data = await res.json();
      const result = data?.evaluation;
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response from server: missing evaluation object.');
      }
      setEvalResult(result);

      if (result.secured) {
        setIsCorrect(true);
        setShowResult(true);

        // Notify the 1v1 wrapper (if any) so the server can claim the win
        onChallengeSolved?.({ fixedCode: userCode });

        const raw = localStorage.getItem('cyberarena_session') || '{}';
        const session = JSON.parse(raw);
        const userData = session.user || session;
        const userId = userData.id;
        if (userId) {
          await authFetch(`${API_URL}/xp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_xp', user_id: userId, xp_amount: training.xpReward }),
          });
        }
      }
    } catch (err: any) {
      setEvalResult({
        secured: false,
        feedback: 'Sorry, failed to reach the AI evaluation server. Make sure your code is solid and try again.'
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  // --- Windows OS Window Management ---
  const openWindow = (id: string) => {
    const nextZ = activeZIndex + 1;
    setActiveZIndex(nextZ);
    setWindowsState({
      ...windowsState,
      [id]: { ...windowsState[id], isOpen: true, isMinimized: false, zIndex: nextZ }
    });
    setActiveWindow(id);
  };

  const closeWindow = (id: string) => {
    setWindowsState({
      ...windowsState,
      [id]: { ...windowsState[id], isOpen: false }
    });
  };

  const focusWindow = (id: string) => {
    const nextZ = activeZIndex + 1;
    setActiveZIndex(nextZ);
    setWindowsState({
      ...windowsState,
      [id]: { ...windowsState[id], isMinimized: false, zIndex: nextZ }
    });
    setActiveWindow(id);
  };

  // --- Windows File explorer navigations & File clickers ---
  const handleExplorerItemDoubleClick = (item: { type: 'dir' | 'file'; name: string; content?: string; editable?: boolean }) => {
    if (item.type === 'dir') {
      const newPath = explorerPath === 'C:\\' ? `C:\\${item.name}` : `${explorerPath}\\${item.name}`;
      setExplorerPath(newPath);
    } else {
      const fileContent = item.content || '';
      // Open every file in notepad. User-authored files open in edit mode so
      // they can be modified and re-saved (e.g. python scripts).
      setNotepadTitle(item.name);
      setNotepadContent(fileContent);
      setNotepadEditable(!!item.editable);
      setNotepadStatus('');
      openWindow('notepad');
    }
  };

  const handleExplorerBack = () => {
    if (explorerPath === 'C:\\') return;
    const parts = explorerPath.split('\\');
    parts.pop();
    const newPath = parts.join('\\') || 'C:\\';
    setExplorerPath(newPath === 'C:' ? 'C:\\' : newPath);
  };

  // --- Sync the workdir files (what the user saved to the sandbox) ---
  const refreshWorkdirFiles = async () => {
    if (!training?.scenarioId) return;
    try {
      const res = await authFetch(`${API_URL}/training/terminal/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamRole, challengeId: training.scenarioId })
      });
      const data = await res.json();
      setUserWorkdirFiles(Array.isArray(data.files) ? data.files : []);
    } catch {
      // silent — keep last known state
    }
  };

  // Refresh once the challenge becomes available
  useEffect(() => {
    if (training?.scenarioId) refreshWorkdirFiles();
  }, [training?.scenarioId]);

  // --- Notepad save (writes to sandbox workdir so `python file.py` works) ---
  const handleNotepadSave = async () => {
    if (!training?.scenarioId) {
      setNotepadStatus('❌ التحدي لم يُحمَّل بعد');
      return;
    }
    const name = (notepadTitle || '').trim();
    if (!name) {
      setNotepadStatus('❌ اكتب اسم الملف أولاً');
      return;
    }
    setNotepadSaving(true);
    setNotepadStatus('');
    try {
      const res = await authFetch(`${API_URL}/training/terminal/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamRole,
          challengeId: training.scenarioId,
          filename: name,
          content: notepadContent
        })
      });
      const data = await res.json();
      if (data.ok) {
        setNotepadStatus(`✅ حُفظ في C:\\Work\\${data.path}`);
        await refreshWorkdirFiles();
      } else {
        setNotepadStatus(data.error || '❌ فشل الحفظ');
      }
    } catch (err: any) {
      setNotepadStatus(`❌ فشل الاتصال: ${err?.message || err}`);
    } finally {
      setNotepadSaving(false);
    }
  };

  const handleNewFile = () => {
    setNotepadTitle('script.py');
    setNotepadContent('# اكتب كود Python هنا\nprint("hello from CyberArena")\n');
    setNotepadEditable(true);
    setNotepadStatus('');
    openWindow('notepad');
  };

  // --- Windows Terminal Command Handler ---
  // For commands that don't need the backend (help, submit, ls of fallback),
  // we still handle them locally so the user can navigate even when the API
  // is down. Everything else is sent to /api/training/terminal and executed
  // in a real sandbox on the server.
  const handleTerminalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawCmd = cmdInput.trim();
    if (!rawCmd) return;
    const cmd = rawCmd.toLowerCase();
    const typed = cmdInput; // keep the user's original casing for the request
    const echoLine = `> ${cmdInput}`;

    // 1) help, submit, clear → handled locally
    if (cmd === 'help') {
      const builtIn = [
        '- ls: عرض الملفات والمجلدات الحالية',
        '- cat [filename]: قراءة محتوى ملف',
        '- pwd: عرض المسار الحالي',
        '- whoami: عرض اسم المستخدم الحالي',
        '- clear: مسح الشاشة',
        '- submit [flag]: تقديم العلم',
        '- sha256sum/md5sum/sha1sum [file]: هاش ملف',
        '- base64 [-d] [file]: ترميز/فك Base64',
        '- xxd [file]: عرض hex',
      ].join('\n');
      const whitelistBlock = allowedTools
        .filter(t => !['ls', 'cat', 'pwd', 'whoami', 'clear', 'sha256sum', 'md5sum', 'sha1sum', 'base64', 'xxd'].includes(t))
        .map(t => `  - ${t}`)
        .join('\n') || '  (لا توجد أدوات إضافية)';
      const response = `الأوامر الأساسية المدمجة:\n${builtIn}\n\nأدوات whitelist في هذا التحدي (تُنفَّذ فعلياً على الخادم):\n${whitelistBlock}\n\nمثال:  python -c "print(2+2)"`;
      setCmdHistory([...cmdHistory, echoLine, response, '']);
      setCmdInput('');
      return;
    }

    if (cmd === 'clear') {
      setCmdHistory([]);
      setCmdInput('');
      return;
    }

    if (cmd.startsWith('submit ')) {
      const flag = cmd.substring(7).trim();
      const expected = (training?.expectedAnswer || '').split('|')[0].trim();
      let response = '';
      if (!flag) {
        response = '❌ اكتب العلم بعد الأمر submit';
      } else if (expected && flag === expected) {
        response = '✅ صحيح! تم قبول العلم 🎉';
      } else {
        response = '❌ العلم غير صحيح. حاول مرة أخرى.';
      }
      setCmdHistory([...cmdHistory, echoLine, response, '']);
      setCmdInput('');
      return;
    }

    // 2) Everything else → real sandbox on the backend
    if (!training?.scenarioId) {
      const response = '❌ لم يتم تحميل التحدي بعد. انتظر لحظة.';
      setCmdHistory([...cmdHistory, echoLine, response, '']);
      setCmdInput('');
      return;
    }

    setCmdInput('');
    setCmdHistory(prev => [...prev, echoLine, '... جاري التنفيذ في الساندبوكس ...', '']);

    try {
      const res = await authFetch(`${API_URL}/training/terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamRole: teamRole,
          challengeId: training.scenarioId,
          command: typed,
        }),
      });
      const data = await res.json();
      const stdout = data.stdout || '';
      const stderr = data.stderr || '';
      const out = (stderr ? stderr : '') + (stdout ? (stderr ? '\n' : '') + stdout : '');
      const response = (out || '(no output)').trimEnd();
      setCmdHistory(prev => {
        const copy = [...prev];
        // Replace the last "جاري التنفيذ" placeholder
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i] === '... جاري التنفيذ في الساندبوكس ...') {
            copy[i] = response;
            return copy;
          }
        }
        return [...copy, response, ''];
      });
      // Refresh the explorer after every command — the script may have created new files
      refreshWorkdirFiles();
    } catch (err: any) {
      const response = `❌ فشل الاتصال بالساندبوكس: ${err?.message || err}`;
      setCmdHistory(prev => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i] === '... جاري التنفيذ في الساندبوكس ...') {
            copy[i] = response;
            return copy;
          }
        }
        return [...copy, response, ''];
      });
    }
  };

  const isWebChallenge =
    !pathId.toLowerCase().includes('crypto') &&
    !categoryId.toLowerCase().includes('crypto') &&
    pathId !== 'basics-crypto' &&
    pathId !== 'vulnerability-hunter' &&
    !categoryId.toLowerCase().includes('vulnerability hunter') &&
    (training as any)?.type !== 'vulnerability-hunter';
  
  const isCryptoChallenge =
    pathId.toLowerCase().includes('crypto') ||
    categoryId.toLowerCase().includes('crypto') ||
    pathId === 'basics-crypto' ||
    training?.type === 'crypto' ||
    training?.type === 'cryptography';

  // Web exploitation challenges have been removed from the platform —
  // see AGENTS.md for the supported types. The browser/IDE view is
  // still used for code-fixing / log-analysis / etc.
  const showWebView = isWebChallenge;
  const hasLog = training?.type === 'analyze_log';

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          textAlign: 'center',
          padding: '24px',
          backgroundColor: '#030712',
          color: '#ffffff',
          fontFamily: 'var(--font-arabic)',
        }}
        dir="rtl"
      >
        <div
          style={{
            maxWidth: '440px',
            width: '100%',
            padding: '32px',
            borderRadius: '16px',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            backgroundColor: 'rgba(17, 24, 39, 0.6)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          <AlertTriangle style={{ margin: '0 auto 16px', color: '#ef4444' }} size={48} />
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px', color: '#f3f4f6' }}>فشل تحميل المختبر</h2>
          <p style={{ color: '#9ca3af', marginBottom: '24px', fontSize: '14px', lineHeight: '1.6' }}>{error}</p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <button
              onClick={generateTraining}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                backgroundColor: '#1f2937',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#374151'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1f2937'}
            >
              إعادة المحاولة 🔄
            </button>
            <button
              onClick={onBack}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            >
              العودة
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !training) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          backgroundColor: '#030712',
          color: '#ffffff',
          fontFamily: 'var(--font-arabic)',
          position: 'relative',
          overflow: 'hidden',
        }}
        dir="rtl"
      >
        {/* Animated decorative glow effects */}
        <div style={{
          position: 'absolute',
          top: '-160px',
          right: '-160px',
          width: '320px',
          height: '320px',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderRadius: '50%',
          filter: 'blur(80px)',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-160px',
          left: '-160px',
          width: '320px',
          height: '320px',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          borderRadius: '50%',
          filter: 'blur(80px)',
          pointerEvents: 'none'
        }} />

        <div
          style={{
            maxWidth: '576px',
            width: '100%',
            padding: '32px',
            borderRadius: '24px',
            border: '1px solid #1f2937',
            backgroundColor: 'rgba(17, 24, 39, 0.45)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Cpu style={{ color: '#818cf8' }} size={24} />
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#e5e7eb', margin: 0 }}>
                جاري تهيئة بيئة التحدي السيبراني...
              </h2>
            </div>
            <Flame style={{ color: '#f59e0b', marginRight: 'auto' }} size={20} />
          </div>

          {/* Large dynamic percent display */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px', margin: '24px 0' }}>
            <span style={{ fontSize: '48px', fontWeight: '800', color: '#818cf8' }}>
              {simulatedPercent}
            </span>
            <span style={{ fontSize: '20px', fontWeight: '500', color: '#6b7280' }}>%</span>
          </div>

          {/* Progress bar container */}
          <div style={{ width: '100%', height: '10px', backgroundColor: '#030712', borderRadius: '9999px', overflow: 'hidden', marginBottom: '16px', border: '1px solid #1f2937' }}>
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)',
                width: `${simulatedPercent}%`,
                transition: 'width 0.3s ease-out',
                boxShadow: '0 0 12px rgba(99, 102, 241, 0.5)',
              }}
            />
          </div>

          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <p style={{ color: '#d1d5db', fontSize: '14px', fontWeight: '500', margin: 0 }}>{simulatedTitle}</p>
          </div>

          {/* Simulated initialization checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid rgba(31, 41, 55, 0.8)', paddingTop: '24px', fontSize: '14px' }}>
            {[
              { id: 1, label: 'Loading scenario from store' },
              { id: 2, label: 'Building full challenge with AI' },
              { id: 3, label: 'Setting up interactive lab and files' },
              { id: 4, label: 'Final security check' }
            ].map(step => {
              const active = simulatedStep >= step.id;
              return (
                <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      backgroundColor: active ? '#6366f1' : '#030712',
                      color: active ? '#ffffff' : '#6b7280',
                      border: active ? 'none' : '1px solid #1f2937',
                      fontWeight: 'bold',
                    }}
                  >
                    {active ? '✓' : step.id}
                  </div>
                  <span style={{ color: active ? '#e5e7eb' : '#6b7280', fontWeight: active ? '500' : '400' }}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Code Fixing Challenge: render CodeFixEditor component
  if (isCodeFixChallenge && training) {
    return (
      <div className="dash-page session-page team-blue">
        <CodeFixEditor
          challenge={{
            id: training.id || '',
            scenarioId: training.scenarioId || '',
            language: (training as any).language || 'PYTHON',
            title: training.title,
            story: training.story,
            task_outline: training.task,
            vulnerable_code: (training as any).vulnerable_code || (training as any).code || '',
            vulnerability_type: (training as any).vulnerability_type || '',
            vulnerability_description: (training as any).vulnerability_description || '',
            difficulty: training.difficulty,
            xp_reward: training.xpReward,
            hints: (training as any).hints || [],
          }}
          onSubmit={handleCodeFixSubmit}
          onBack={onBack}
          isVerifying={isVerifying}
          result={codeFixResult}
          inOneVOne={!!onChallengeSolved}
        />
      </div>
    );
  }

  // Vulnerability Hunter Challenge: render VulnerabilityHunterEditor component
  if (isVulnHunterChallenge && training) {
    return (
      <div className="dash-page session-page team-blue">
        <VulnerabilityHunterEditor
          challenge={{
            id: training.id || '',
            scenarioId: training.scenarioId || '',
            language: (training as any).language || 'PYTHON',
            title: training.title,
            story: training.story,
            task_outline: training.task,
            vulnerable_code: (training as any).vulnerable_code || (training as any).code || '',
            vulnerability_type: (training as any).vulnerability_type || '',
            vulnerability_class: (training as any).vulnerability_class || '',
            vulnerability_description: (training as any).vulnerability_description || '',
            difficulty: training.difficulty,
            xp_reward: training.xpReward,
            hints: (training as any).hints || [],
          }}
          onSubmit={handleVulnHunterSubmit}
          onBack={onBack}
          isVerifying={isVerifying}
          result={vulnHunterResult}
          inOneVOne={!!onChallengeSolved}
        />
      </div>
    );
  }

  // Log Analysis Challenge: render LogAnalysisEditor component
  if (isLogAnalysisChallenge && training) {
    return (
      <div className="dash-page session-page team-blue">
        <LogAnalysisEditor
          challenge={{
            id: training.id || '',
            scenarioId: training.scenarioId || '',
            title: training.title,
            story: training.story,
            task_outline: training.task,
            log_type: (training as any).log_type || 'auth',
            storage_path: (training as any).storage_path || '',
            log_url: (training as any).log_url || '',
            is_inline: (training as any).is_inline || false,
            file_size_bytes: (training as any).file_size_bytes || 0,
            vulnerability_description: (training as any).vulnerability_description || '',
            difficulty: training.difficulty,
            xp_reward: training.xpReward,
            hints: (training as any).hints || [],
          }}
          onSubmit={handleLogAnalysisSubmit}
          onBack={onBack}
          isVerifying={isVerifying}
          result={logAnalysisResult}
          inOneVOne={!!onChallengeSolved}
        />
      </div>
    );
  }

  const themeClass = isSteganographyChallenge 
    ? 'theme-stego' 
    : isCryptoChallenge 
      ? 'theme-crypto' 
      : 'theme-default';

  return (
    <div className={`dash-page session-page team-${teamRole} ${themeClass}`}>
      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="/" className="dash-logo">CyberArena</a>
          <div className="dash-header-right">
            <LanguageSwitcher />
            <div className="session-top-bar">
              <span className="team-role-badge" style={{ color: teamRole === 'blue' ? '#3b82f6' : '#ef4444' }}>
                {teamRole === 'blue' ? (
                  <BlueTeamIcon size={24} />
                ) : (
                  <RedTeamIcon size={24} />
                )}
                <span>{teamRole === 'blue' ? t.oneVOne.teamBlueFull : t.oneVOne.teamRedFull}</span>
              </span>
              <span className="session-badge">{moduleTitle}</span>
              <span className={`session-diff ${training.difficulty === 'مبتدئ' ? 'easy' : training.difficulty === 'متوسط' ? 'medium' : 'hard'}`}>
                {training.difficulty}
              </span>
              <span className="session-xp">+{training.xpReward} XP</span>
            </div>
            <button onClick={onBack} className="path-back-link">
              <ArrowRight size={14} />
              <span>{t.oneVOne.back}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="session-split">
        {/* LEFT WORKSPACE: WEB PREVIEW + VS CODE OR WINDOWS DESKTOP SIMULATOR */}
        <div className="session-left">

          {isSteganographyChallenge ? (
            /* --- STEGANOGRAPHY DOWNLOAD WORKSPACE --- */
            <div className="stego-download-workspace" style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              padding: '24px',
              background: 'radial-gradient(circle at center, #0b0f19 0%, #030712 100%)',
              color: '#fff',
              overflowY: 'auto'
            }} dir="rtl">
              
              {/* Forensics Lab Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                marginBottom: '20px',
                borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
                paddingBottom: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 10px #10b981',
                    display: 'inline-block'
                  }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#e2e8f0', letterSpacing: '0.5px' }}>
                    منصة التحليل الجنائي الرقمي <span style={{ color: '#818cf8', fontSize: '11px', fontFamily: 'monospace' }}>[FORENSICS_LAB_V2.5]</span>
                  </h3>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                  STATUS: READY_FOR_ANALYSIS
                </div>
              </div>

              {/* Grid Layout */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '20px',
                width: '100%',
                flex: 1
              }}>
                
                {/* Right Panel: File Metadata & Preview */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.45)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
                }}>
                  <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Settings size={16} style={{ color: '#818cf8' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>خصائص الملف الفنيّة</span>
                  </div>

                  {/* File Preview Container */}
                  <div style={{
                    width: '100%',
                    height: '180px',
                    background: '#070a13',
                    border: '1px dashed rgba(99, 102, 241, 0.15)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {(() => {
                      const files = training?.files || {};
                      const filename = Object.keys(files)[0] || 'suspect.jpg';
                      const base64Data = files[filename] || '';
                      const isImage = /\.(jpg|jpeg|png|jfif|gif)$/i.test(filename);
                      
                      if (isImage && base64Data) {
                        return (
                          <>
                            <div style={{
                              position: 'absolute',
                              inset: 0,
                              background: `url(data:image/jpeg;base64,${base64Data}) center/cover no-repeat`,
                              filter: 'blur(6px)',
                              opacity: 0.15
                            }} />
                            <img 
                              src={`data:image/jpeg;base64,${base64Data}`}
                              alt="Forensic Target"
                              style={{
                                maxHeight: '160px',
                                maxWidth: '90%',
                                objectFit: 'contain',
                                borderRadius: '8px',
                                boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
                                zIndex: 2,
                                border: '1px solid rgba(255,255,255,0.1)'
                              }}
                            />
                            <div style={{
                              position: 'absolute',
                              bottom: '8px',
                              left: '8px',
                              background: 'rgba(2, 6, 23, 0.75)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              color: '#a5b4fc',
                              fontFamily: 'monospace',
                              zIndex: 3
                            }}>
                              PREVIEW_ACTIVE
                            </div>
                          </>
                        );
                      }
                      
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 2 }}>
                          <FileArchive size={48} style={{ color: '#4f46e5' }} />
                          <span style={{ fontSize: '12px', color: '#64748b' }}>معاينة الصورة غير متوفرة لهذا النوع من الملفات</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Metadata fields */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                    {(() => {
                      const files = training?.files || {};
                      const filename = Object.keys(files)[0] || 'suspect.jpg';
                      const size = training?.fileMetadata?.[filename]?.size || 0;
                      let formattedSize = `${size} Bytes`;
                      if (size > 1024 * 1024) formattedSize = `${(size / (1024 * 1024)).toFixed(2)} MB`;
                      else if (size > 1024) formattedSize = `${(size / 1024).toFixed(1)} KB`;

                      // Mock MD5/SHA256 based on filename & size for realism
                      const mockMD5 = Array.from(filename + size).reduce((acc, char) => (acc + char.charCodeAt(0)).toString(16), '').padEnd(32, 'a').slice(0, 32);

                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                            <span style={{ color: '#64748b' }}>الاسم البرمجي:</span>
                            <span style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{filename}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                            <span style={{ color: '#64748b' }}>الحجم الإجمالي:</span>
                            <span style={{ fontWeight: 'bold', color: '#f1f5f9' }}>{formattedSize}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                            <span style={{ color: '#64748b' }}>بصمة MD5:</span>
                            <span style={{ fontFamily: 'monospace', color: '#a5b4fc', fontSize: '11px' }}>{mockMD5}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                            <span style={{ color: '#64748b' }}>أسلوب الإخفاء المتوقع:</span>
                            <span style={{ color: '#f43f5e', fontWeight: 600 }}>{((training as any)?.hiding_method || 'غير معروف').toUpperCase()}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => {
                      const files = training?.files || {};
                      const filename = Object.keys(files)[0] || 'suspect.jpg';
                      const base64Data = files[filename] || '';
                      if (!base64Data) return;
                      const byteCharacters = atob(base64Data);
                      const byteNumbers = new Array(byteCharacters.length);
                      for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                      }
                      const byteArray = new Uint8Array(byteNumbers);
                      const blob = new Blob([byteArray], { type: 'application/octet-stream' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = filename;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                      color: '#fff',
                      padding: '12px 20px',
                      borderRadius: '10px',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(79, 72, 229, 0.3)',
                      transition: 'all 0.2s',
                      marginTop: 'auto'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(79, 72, 229, 0.45)';
                      e.currentTarget.style.filter = 'brightness(1.1)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 72, 229, 0.3)';
                      e.currentTarget.style.filter = 'none';
                    }}
                  >
                    <Download size={16} />
                    <span>تنزيل ملف التحليل (.zip/.jpg)</span>
                  </button>
                </div>

                {/* Left Panel: Hex Dump Terminal */}
                <div style={{
                  background: '#05070f',
                  border: '1px solid rgba(99, 102, 241, 0.15)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
                }}>
                  <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Terminal size={16} style={{ color: '#10b981' }} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', fontFamily: 'monospace' }}>HEX_DUMP (xxd output)</span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#475569', fontFamily: 'monospace' }}>FIRST 128 BYTES</span>
                  </div>

                  <div style={{
                    flex: 1,
                    background: '#020408',
                    border: '1px solid rgba(255,255,255,0.03)',
                    borderRadius: '10px',
                    padding: '12px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#34d399',
                    overflowX: 'auto',
                    whiteSpace: 'pre',
                    lineHeight: '1.6',
                    direction: 'ltr',
                    textAlign: 'left'
                  }}>
                    {(() => {
                      const files = training?.files || {};
                      const filename = Object.keys(files)[0] || 'suspect.jpg';
                      const base64Data = files[filename] || '';
                      if (!base64Data) return 'No hex dump available...';
                      try {
                        const binary = atob(base64Data.slice(0, 1000));
                        const lines = [];
                        for (let i = 0; i < Math.min(binary.length, 128); i += 16) {
                          const chunk = binary.slice(i, i + 16);
                          const hex = Array.from(chunk).map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
                          const ascii = Array.from(chunk).map(c => {
                            const code = c.charCodeAt(0);
                            return (code >= 32 && code <= 126) ? c : '.';
                          }).join('');
                          const offset = i.toString(16).padStart(8, '0').toUpperCase();
                          lines.push(`${offset}  ${hex.padEnd(47, ' ')}  |${ascii}|`);
                        }
                        return lines.join('\n');
                      } catch (e) {
                        return 'Error decoding binary stream...';
                      }
                    })()}
                  </div>
                </div>

              </div>
            </div>
          ) : showWebView ? (
            /* --- WEB VIEW --- */
            <div className="session-browser">
              <div className="session-browser-tabs">
                <button
                  className={`browser-tab ${!isOpenEditor ? 'active' : ''}`}
                  onClick={() => setIsOpenEditor(false)}
                >
                  <Globe size={14} style={{ marginLeft: '6px' }} />
                  <span>الموقع التفاعلي (المعاينة)</span>
                </button>
                {teamRole !== 'red' && (
                  <button
                    className={`browser-tab code-editor-tab-btn ${isOpenEditor ? 'active' : ''}`}
                    onClick={() => setIsOpenEditor(true)}
                  >
                    <Terminal size={14} style={{ marginLeft: '6px' }} />
                    <span>فتح محرر الأكواد (VS Code) 💻</span>
                  </button>
                )}
              </div>

              <div className="session-browser-url">
                <Lock size={12} className="text-emerald-400" style={{ marginLeft: '6px' }} />
                {isOpenEditor ? (
                  <div className="browser-url-text">vscode://workspace/apex-challenge-security</div>
                ) : (
                  <input
                    type="text"
                    className="browser-url-input"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'inherit',
                      width: '100%',
                      outline: 'none',
                      fontFamily: 'monospace',
                      direction: 'ltr',
                      textAlign: 'left'
                    }}
                    value={simulatedUrl}
                    onChange={(e) => setSimulatedUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUrlNavigation();
                      }
                    }}
                    onBlur={handleUrlNavigation}
                  />
                )}
                {isOpenEditor && (
                  <button
                    className="editor-eval-btn"
                    onClick={handleEvaluateFix}
                    disabled={isEvaluating}
                  >
                    {isEvaluating ? (
                      <>
                        <Loader2 size={12} className="animate-spin" style={{ marginLeft: '4px' }} />
                        <span>جاري التقييم...</span>
                      </>
                    ) : (
                      <span>{teamRole === 'blue' ? '✅ أكملت الإصلاح' : '🔍 تحقق من الحل'}</span>
                    )}
                  </button>
                )}
              </div>

              <div className="session-browser-body" style={{ background: isOpenEditor ? '#1e1e1e' : '#fff' }}>
                {!isOpenEditor ? (
                  <>
                    {/* v3: Theme context chip — extracted from lab HTML (brand bar) */}
                    {training.htmlPreview && (() => {
                      const iconMatch = training.htmlPreview.match(/apex-brand-icon">([^<]+)</);
                      const nameMatch = training.htmlPreview.match(/apex-brand-name">([^<]+)</);
                      const tagMatch = training.htmlPreview.match(/apex-brand-tag">· ([^<]+)</);
                      const primaryMatch = training.htmlPreview.match(/--apex-primary:\s*([^;]+);/);
                      if (!nameMatch && !iconMatch) return null;
                      return (
                        <div
                          className="session-theme-chip"
                          style={{
                            background: 'var(--card-bg, #111827)',
                            borderLeft: `3px solid ${primaryMatch ? primaryMatch[1].trim() : '#10b981'}`,
                          }}
                        >
                          {iconMatch && <span className="theme-chip-icon">{iconMatch[1]}</span>}
                          {nameMatch && <span className="theme-chip-name">{nameMatch[1]}</span>}
                          {tagMatch && <span className="theme-chip-tag">· {tagMatch[1]}</span>}
                        </div>
                      );
                    })()}
                    <iframe
                      ref={iframeRef}
                      className="session-browser-iframe"
                      srcDoc={editorFiles['index.html'] || training.htmlPreview}
                      sandbox="allow-scripts allow-modals allow-forms"
                      title="Website Preview"
                    />
                    {!showVuln && training.vulnerabilityLocation && (
                      <div className="session-browser-overlay" onClick={() => setShowVuln(true)}>
                        <Eye size={24} style={{ marginBottom: '8px' }} />
                        <p>اضغط لاكتشاف وملاحظة الثغرة</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="vscode-container" dir="ltr">
                    <div className="vscode-sidebar">
                      <div className="sidebar-header">EXPLORER</div>
                      <div className="sidebar-tree">
                        <div className="tree-project-title">CyberArena_PROJECT</div>

                        <button
                          className={`tree-file ${selectedFile === 'index.html' ? 'active' : ''}`}
                          onClick={() => setSelectedFile('index.html')}
                        >
                          <FileText size={14} className="text-orange-500" />
                          <span>index.html</span>
                        </button>

                        <button
                          className={`tree-file ${selectedFile === 'security_config.json' ? 'active' : ''}`}
                          onClick={() => setSelectedFile('security_config.json')}
                        >
                          <Settings size={14} className="text-yellow-500" />
                          <span>security_config.json</span>
                        </button>

                        <button
                          className={`tree-file ${selectedFile === 'database.sql' ? 'active' : ''}`}
                          onClick={() => setSelectedFile('database.sql')}
                        >
                          <DatabaseIcon size={14} className="text-cyan-500" />
                          <span>database.sql</span>
                        </button>
                      </div>
                    </div>

                    <div className="vscode-editor-pane">
                      <div className="editor-tab-bar">
                        <div className="editor-tab active">
                          <FileText size={12} style={{ marginRight: '6px' }} />
                          <span>{selectedFile}</span>
                        </div>
                      </div>

                      <div className="editor-workspace">
                        <div className="line-numbers">
                          {Array.from({ length: (editorFiles[selectedFile] || '').split('\n').length + 2 }).map((_, i) => (
                            <span key={i}>{i + 1}</span>
                          ))}
                        </div>
                        <textarea
                          className="vscode-textarea"
                          value={editorFiles[selectedFile] || ''}
                          onChange={(e) => handleEditorCodeChange(e.target.value)}
                          spellCheck={false}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* --- DRAGGABLE WINDOWS DESKTOP SIMULATOR --- */
            <div className="windows-desktop">
              {/* Desktop Icons */}
              <div className="desktop-icons" dir="rtl">
                <button className="desktop-icon" onDoubleClick={() => openWindow('fileExplorer')}>
                  <FolderOpen size={36} className="text-amber-400" />
                  <span>مستكشف الملفات</span>
                </button>

                <button className="desktop-icon" onDoubleClick={() => openWindow('cryptoTools')}>
                  <Key size={36} className="text-cyan-400" />
                  <span>أدوات التشفير</span>
                </button>

                <button className="desktop-icon" onDoubleClick={() => openWindow('terminal')}>
                  <Terminal size={36} className="text-emerald-400" />
                  <span>موجه الأوامر (CMD)</span>
                </button>

                <button className="desktop-icon" onDoubleClick={handleNewFile}>
                  <FileText size={36} className="text-indigo-400" />
                  <span>ملف بايثون جديد</span>
                </button>
              </div>

              {/* Start Menu Popup */}
              {isStartMenuOpen && (
                <div className="windows-start-menu" dir="rtl">
                  <div className="start-menu-sidebar">
                    <div className="user-profile">
                      <div className="avatar">AP</div>
                      <span>المشغل الأمني</span>
                    </div>
                    <button className="start-power-btn" onClick={onBack}>
                      <Power size={16} />
                      <span>إيقاف التشغيل</span>
                    </button>
                  </div>
                  <div className="start-menu-content">
                    <div className="start-search-row">
                      <Search size={14} className="text-slate-400" />
                      <input type="text" placeholder="Search APEX files and tools..." readOnly />
                    </div>
                    <div className="start-pins-section">
                      <h3>البرامج المثبتة</h3>
                      <div className="pins-grid">
                        <button className="pin-item" onClick={() => { openWindow('fileExplorer'); setIsStartMenuOpen(false); }}>
                          <FolderOpen size={24} className="text-amber-400" />
                          <span>الملفات</span>
                        </button>
                        <button className="pin-item" onClick={() => { openWindow('cryptoTools'); setIsStartMenuOpen(false); }}>
                          <Key size={24} className="text-cyan-400" />
                          <span>أدوات التشفير</span>
                        </button>
                        <button className="pin-item" onClick={() => { openWindow('terminal'); setIsStartMenuOpen(false); }}>
                          <Terminal size={24} className="text-emerald-400" />
                          <span>CMD</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Windows Draggable Containers */}

              {/* 1. File Explorer Window */}
              {windowsState.fileExplorer.isOpen && (
                <div
                  className={`window-frame ${activeWindow === 'fileExplorer' ? 'active' : ''}`}
                  style={{ zIndex: windowsState.fileExplorer.zIndex, left: `${windowsState.fileExplorer.x}px`, top: `${windowsState.fileExplorer.y}px` }}
                  onClick={() => focusWindow('fileExplorer')}
                  dir="rtl"
                >
                  <div className="window-header" onMouseDown={(e) => handleMouseDown(e, 'fileExplorer')}>
                    <span className="window-title">مستكشف الملفات - {explorerPath}</span>
                    <div className="window-controls">
                      <button onClick={(e) => { e.stopPropagation(); closeWindow('fileExplorer'); }} className="control-btn close">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="window-body explorer-body">
                    <div className="explorer-sidebar">
                      <div className="sidebar-section">المجلدات الأساسية</div>
                      <button className="explorer-nav-item" onClick={() => setExplorerPath('C:\\')}>📁 القرص المحلي (C:)</button>
                      <button className="explorer-nav-item" onClick={() => setExplorerPath('C:\\Work')}>📁 مجلد العمل</button>
                    </div>
                    <div className="explorer-tools-banner" style={{
                      padding: '6px 10px',
                      margin: '6px 8px',
                      background: 'rgba(99, 102, 241, 0.10)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: '#a5b4fc',
                      direction: 'rtl',
                    }}>
                      <span style={{ fontWeight: 600, color: '#c7d2fe' }}>القائمة البيضاء للأدوات: </span>
                      {allowedTools.map(t => (
                        <span key={t} style={{
                          display: 'inline-block',
                          margin: '0 4px',
                          padding: '1px 8px',
                          background: 'rgba(99, 102, 241, 0.18)',
                          borderRadius: '10px',
                          fontFamily: 'monospace',
                          color: '#e0e7ff',
                        }}>{t}</span>
                      ))}
                    </div>
                    <div className="explorer-content">
                      <div className="explorer-toolbar">
                        {explorerPath !== 'C:\\' && (
                          <button onClick={handleExplorerBack} className="explorer-back-btn">⬆️ لأعلى</button>
                        )}
                        <span>المسار: {explorerPath}</span>
                      </div>
                      <div className="explorer-files-grid">
                        {(directoryStructure[explorerPath] || []).map((item, idx) => (
                          <div
                            key={idx}
                            className="explorer-file-item"
                            onDoubleClick={() => handleExplorerItemDoubleClick(item)}
                          >
                            {item.type === 'dir' ? (
                              <Folder size={40} className="text-amber-400" />
                            ) : (
                              <FileText size={40} className={item.name.endsWith('.enc') ? 'text-indigo-400' : 'text-emerald-400'} />
                            )}
                            <span>{item.name}</span>
                            <span className="file-desc">{item.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Swiss Tools — read-only Cheat Sheet (no execution; use Terminal) */}
              {windowsState.cryptoTools.isOpen && (
                <div
                  className={`window-frame ${activeWindow === 'cryptoTools' ? 'active' : ''}`}
                  style={{ zIndex: windowsState.cryptoTools.zIndex, left: `${windowsState.cryptoTools.x}px`, top: `${windowsState.cryptoTools.y}px`, width: '520px' }}
                  onClick={() => focusWindow('cryptoTools')}
                  dir="rtl"
                >
                  <div className="window-header" onMouseDown={(e) => handleMouseDown(e, 'cryptoTools')}>
                    <span className="window-title">أدوات فك التشفير السيبرانية - CyberArena Swiss Tools</span>
                    <div className="window-controls">
                      <button onClick={(e) => { e.stopPropagation(); closeWindow('cryptoTools'); }} className="control-btn close">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="window-body crypto-body" style={{ padding: '14px' }}>
                    <div style={{
                      background: 'rgba(99, 102, 241, 0.10)',
                      border: '1px solid rgba(99, 102, 241, 0.30)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      marginBottom: '12px',
                      color: '#c7d2fe',
                      fontSize: '13px',
                      lineHeight: '1.6',
                    }}>
                      <strong style={{ color: '#e0e7ff' }}>⚠️ هذه النافذة للعرض فقط.</strong><br />
                      التنفيذ الفعلي للأدوات يتم حصرياً عبر <strong>CMD Terminal</strong>.
                      اكتب الأمر هناك لمشاهدة المخرجات الحقيقية.
                    </div>

                    <h4 style={{ color: '#a5b4fc', margin: '0 0 8px 0', fontSize: '14px' }}>
                      🧰 الأدوات المسموح بها في هذا التحدي
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                      {allowedTools.map(t => (
                        <span key={t} style={{
                          fontFamily: 'monospace',
                          padding: '3px 10px',
                          background: 'rgba(99, 102, 241, 0.18)',
                          border: '1px solid rgba(99, 102, 241, 0.35)',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: '#e0e7ff',
                        }}>{t}</span>
                      ))}
                    </div>

                    <h4 style={{ color: '#a5b4fc', margin: '0 0 8px 0', fontSize: '14px' }}>
                      📖 شرح مختصر للأدوات
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '4px 12px', fontSize: '12px', marginBottom: '14px' }}>
                      {Object.entries(CHEATSHEET).filter(([k]) => allowedTools.includes(k)).map(([tool, desc]) => (
                        <React.Fragment key={tool}>
                          <span style={{ fontFamily: 'monospace', color: '#a5f3fc', fontWeight: 600 }}>{tool}</span>
                          <span style={{ color: '#cbd5e1' }}>{desc}</span>
                        </React.Fragment>
                      ))}
                    </div>

                    {training?.hints && training.hints.length > 0 && (
                      <>
                        <h4 style={{ color: '#a5b4fc', margin: '0 0 8px 0', fontSize: '14px' }}>
                          💡 التلميحات
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {training.hints.map((h, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '8px 10px',
                                background: i < hintIndex ? 'rgba(34, 197, 94, 0.10)' : 'rgba(148, 163, 184, 0.08)',
                                border: `1px solid ${i < hintIndex ? 'rgba(34, 197, 94, 0.35)' : 'rgba(148, 163, 184, 0.20)'}`,
                                borderRadius: '6px',
                                fontSize: '12px',
                                color: i < hintIndex ? '#bbf7d0' : '#475569',
                                filter: i < hintIndex ? 'none' : 'blur(4px)',
                                userSelect: i < hintIndex ? 'text' : 'none',
                                transition: 'all 0.2s',
                              }}
                            >
                              <strong style={{ marginLeft: '6px' }}>تلميح {i + 1}:</strong>{h}
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => setHintIndex((i) => Math.min(i + 1, training.hints.length))}
                          disabled={hintIndex >= training.hints.length}
                          style={{
                            marginTop: '10px',
                            padding: '6px 12px',
                            background: hintIndex >= training.hints.length ? '#1e293b' : 'rgba(99, 102, 241, 0.25)',
                            color: hintIndex >= training.hints.length ? '#475569' : '#e0e7ff',
                            border: '1px solid rgba(99, 102, 241, 0.4)',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: hintIndex >= training.hints.length ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          {hintIndex >= training.hints.length
                            ? '✓ تم كشف جميع التلميحات'
                            : `🔓 كشف التلميح التالي (${hintIndex}/${training.hints.length})`}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 3. Terminal/CMD Window */}
              {windowsState.terminal.isOpen && (
                <div
                  className={`window-frame ${activeWindow === 'terminal' ? 'active' : ''}`}
                  style={{ zIndex: windowsState.terminal.zIndex, left: `${windowsState.terminal.x}px`, top: `${windowsState.terminal.y}px` }}
                  onClick={() => focusWindow('terminal')}
                  dir="ltr"
                >
                  <div className="window-header" onMouseDown={(e) => handleMouseDown(e, 'terminal')}>
                    <span className="window-title">Command Prompt - CMD</span>
                    <div className="window-controls">
                      <button onClick={(e) => { e.stopPropagation(); closeWindow('terminal'); }} className="control-btn close">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="window-body cmd-body">
                    <div className="cmd-outputs">
                      {cmdHistory.map((line, idx) => (
                        <pre key={idx}>{line}</pre>
                      ))}
                    </div>
                    <form onSubmit={handleTerminalSubmit} className="cmd-form-input">
                      <span>{explorerPath}&gt;</span>
                      <input
                        type="text"
                        value={cmdInput}
                        onChange={(e) => setCmdInput(e.target.value)}
                        autoFocus
                        spellCheck={false}
                      />
                    </form>
                  </div>
                </div>
              )}

              {/* 4. Notepad Window Clone */}
              {windowsState.notepad.isOpen && (
                <div
                  className={`window-frame ${activeWindow === 'notepad' ? 'active' : ''}`}
                  style={{ zIndex: windowsState.notepad.zIndex, left: `${windowsState.notepad.x}px`, top: `${windowsState.notepad.y}px`, width: '460px', height: '360px' }}
                  onClick={() => focusWindow('notepad')}
                  dir="rtl"
                >
                  <div className="window-header" onMouseDown={(e) => handleMouseDown(e, 'notepad')}>
                    <span className="window-title">المفكرة - {notepadTitle}</span>
                    <div className="window-controls">
                      <button onClick={(e) => { e.stopPropagation(); closeWindow('notepad'); }} className="control-btn close">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="window-body notepad-body" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px' }}>
                    {notepadEditable && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={notepadTitle}
                          onChange={(e) => setNotepadTitle(e.target.value)}
                          placeholder="اسم الملف (مثال: script.py)"
                          style={{ flex: '1 1 160px', padding: '4px 8px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px' }}
                        />
                        <button
                          onClick={handleNotepadSave}
                          disabled={notepadSaving}
                          style={{ padding: '4px 10px', background: notepadSaving ? '#475569' : '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                        >
                          {notepadSaving ? '...' : '💾 حفظ'}
                        </button>
                      </div>
                    )}
                    <textarea
                      className="notepad-textarea"
                      value={notepadContent}
                      onChange={(e) => setNotepadContent(e.target.value)}
                      readOnly={!notepadEditable}
                      style={{ flex: 1, fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }}
                    />
                    {notepadEditable && notepadStatus && (
                      <div style={{ fontSize: '11px', color: notepadStatus.startsWith('✅') ? '#10b981' : '#ef4444', direction: 'ltr', textAlign: 'left' }}>
                        {notepadStatus}
                      </div>
                    )}
                    {notepadEditable && (
                      <div style={{ fontSize: '10px', color: '#64748b', direction: 'ltr', textAlign: 'left' }}>
                        tip: احفظ كـ <code>file.py</code> ثم نفّذ <code>python file.py</code> في CMD
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Windows Taskbar */}
              <div className="desktop-taskbar" dir="rtl">
                <button className="start-btn" onClick={() => setIsStartMenuOpen(!isStartMenuOpen)}>💻 ابدأ</button>
                <div className="taskbar-tabs">
                  <button
                    className={`task-tab ${windowsState.fileExplorer.isOpen ? 'active' : ''}`}
                    onClick={() => {
                      if (windowsState.fileExplorer.isOpen) focusWindow('fileExplorer');
                      else openWindow('fileExplorer');
                    }}
                  >
                    مستكشف الملفات
                  </button>
                  <button
                    className={`task-tab ${windowsState.cryptoTools.isOpen ? 'active' : ''}`}
                    onClick={() => {
                      if (windowsState.cryptoTools.isOpen) focusWindow('cryptoTools');
                      else openWindow('cryptoTools');
                    }}
                  >
                    أدوات التشفير
                  </button>
                  <button
                    className={`task-tab ${windowsState.terminal.isOpen ? 'active' : ''}`}
                    onClick={() => {
                      if (windowsState.terminal.isOpen) focusWindow('terminal');
                      else openWindow('terminal');
                    }}
                  >
                    CMD
                  </button>
                  {windowsState.notepad.isOpen && (
                    <button
                      className={`task-tab ${activeWindow === 'notepad' ? 'active' : ''}`}
                      onClick={() => focusWindow('notepad')}
                    >
                      المفكرة
                    </button>
                  )}
                </div>
                <div className="taskbar-clock">07:00 م</div>
              </div>
            </div>
          )}

          {/* Vulnerability Highlight location banner */}
          {showVuln && training.vulnerabilityLocation && (
            <div className="session-vuln-marker">
              <div className="vuln-marker-pulse" />
              <div className="vuln-marker-text">
                <span>⚠️ الثغرة المكتشفة</span>
                <p>{training.vulnerabilityLocation}</p>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT WORKSPACE: TASK, STORY & ANSWERS */}
        <div className="session-right">
          <div className="session-right-scroll">

            {/* AI evaluation result alert */}
            {evalResult && (
              <div className={`eval-feedback-alert ${evalResult.secured ? 'success' : 'fail'}`}>
                <div className="feedback-header">
                  {evalResult.secured ? <CheckCircle size={20} className="text-emerald-400" /> : <AlertTriangle size={20} className="text-rose-400" />}
                  <h4>نتائج التقييم الأمني التلقائي:</h4>
                </div>
                <p>{evalResult.feedback}</p>
              </div>
            )}

            <h1 className="session-title">{training.title}</h1>

            <div className="session-story">
              <div className="session-story-icon">
                <StoryIcon size={32} />
              </div>
              <p>{training.story}</p>
            </div>

            <div className="session-task-box">
              <div className="session-task-header">
                <TaskIcon size={28} />
                <h3>المهمة المطلوبة</h3>
              </div>
              <p>{training.task}</p>
            </div>

            {(() => {
              let downloadableFile: string | null = null;
              let logPreviewText: string | null = null;
              
              if (training.logData) {
                try {
                  const parsedLog = JSON.parse(training.logData);
                  if (parsedLog && typeof parsedLog === 'object' && parsedLog.downloadable_file) {
                    downloadableFile = parsedLog.downloadable_file;
                    logPreviewText = parsedLog.preview || '';
                  } else {
                    logPreviewText = training.logData;
                  }
                } catch (e) {
                  logPreviewText = training.logData;
                }
              }

              return (
                <>
                  {downloadableFile && (
                    <div className="session-file-download-box" style={{
                      background: 'rgba(99, 102, 241, 0.08)',
                      border: '1px dashed rgba(99, 102, 241, 0.3)',
                      borderRadius: '12px',
                      padding: '16px',
                      marginBottom: '20px',
                      textAlign: 'right',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }} dir="rtl">
                      <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📁 ملف التحدي المرفق جاهز للتحميل
                      </span>
                      <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
                        يتطلب هذا التحدي العملي تحميل ملف وتحليله باستخدام أدواتك الخاصة.
                      </p>
                      <a
                        href={`${API_URL.replace('/api', '')}/challenge_files/${downloadableFile}`}
                        download={downloadableFile}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          background: '#6366f1',
                          color: '#fff',
                          padding: '10px 16px',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          textDecoration: 'none',
                          fontSize: '14px',
                          transition: 'background 0.2s',
                          width: 'fit-content'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#4f46e5'}
                        onMouseOut={(e) => e.currentTarget.style.background = '#6366f1'}
                      >
                        <Download size={16} />
                        <span>تحميل ملف التحدي ({downloadableFile.split('_').slice(3).join('_') || downloadableFile})</span>
                      </a>
                    </div>
                  )}

                  {logPreviewText && (hasLog || downloadableFile) && (
                    <div className="session-log-box">
                      <div className="session-log-header">
                        <Terminal size={14} style={{ marginLeft: '6px' }} />
                        <span>{downloadableFile ? 'Preview from system logs / file contents' : 'System logs'}</span>
                      </div>
                      <pre className="session-log-body"><code>{logPreviewText}</code></pre>
                    </div>
                  )}
                </>
              );
            })()}

            {!showResult && (
              <>
                {teamRole === 'blue' && isWebChallenge ? (
                  <button
                    className="session-submit eval-btn-blue"
                    onClick={handleEvaluateFix}
                    disabled={isEvaluating}
                  >
                    {isEvaluating ? (
                      <>
                        <Loader2 size={18} className="animate-spin" style={{ marginLeft: '8px' }} />
                        <span>جاري فحص الإصلاح...</span>
                      </>
                    ) : (
                      <>
                        <Check size={18} style={{ marginLeft: '8px' }} />
                        <span>✅ أكملت الإصلاح</span>
                      </>
                    )}
                  </button>
                ) : (
                  <>
                    {(!isWebChallenge || !isOpenEditor) && (
                      <div className="session-answer-area">
                        <label className="session-answer-label">
                          {teamRole === 'red'
                            ? '🎯 أدخل الـ Payload أو العلم (Flag)'
                            : '✏️ تقديم الإجابة أو العلم (Flag)'}
                        </label>
                        <textarea
                          className="session-answer-input"
                          placeholder={teamRole === 'red'
                            ? "أدخل حمولة الاختراق (Payload)..."
                            : "اكتب إجابتك هنا..."}
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          dir="auto"
                          spellCheck={false}
                        />
                      </div>
                    )}

                    {(!isWebChallenge || !isOpenEditor) && (
                      <button
                        className={`session-submit ${teamRole === 'red' ? 'submit-red' : 'submit-blue'}`}
                        onClick={handleSubmit}
                        disabled={isEvaluating}
                      >
                        {isEvaluating ? (
                          <>
                            <Loader2 size={18} className="animate-spin" style={{ marginLeft: '8px' }} />
                            <span>جاري التحقق...</span>
                          </>
                        ) : (
                          <>
                            <Check size={18} style={{ marginLeft: '8px' }} />
                            <span>{teamRole === 'red' ? '🎯 أرسل الاستغلال' : 'تأكيد الإجابة'}</span>
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}

                {isSteganographyChallenge ? (
                  training?.hints && training.hints.length > 0 && (
                    <div className="session-hints-box" style={{
                      marginTop: '20px',
                      padding: '16px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      borderRadius: '12px',
                      textAlign: 'right'
                    }} dir="rtl">
                      <h4 style={{ color: '#a5b4fc', margin: '0 0 12px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>💡 التلميحات المساعدة</span>
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {training.hints.map((h, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '10px 12px',
                              background: i < hintIndex ? 'rgba(34, 197, 94, 0.06)' : 'rgba(148, 163, 184, 0.04)',
                              border: `1px solid ${i < hintIndex ? 'rgba(34, 197, 94, 0.25)' : 'rgba(148, 163, 184, 0.10)'}`,
                              borderRadius: '8px',
                              fontSize: '13px',
                              color: i < hintIndex ? '#cbd5e1' : '#475569',
                              filter: i < hintIndex ? 'none' : 'blur(4px)',
                              userSelect: i < hintIndex ? 'text' : 'none',
                              transition: 'all 0.3s',
                              lineHeight: '1.5'
                            }}
                          >
                            <strong style={{ color: i < hintIndex ? '#4ade80' : '#475569', marginLeft: '6px' }}>تلميح {i + 1}:</strong>
                            {h}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setHintIndex((i) => Math.min(i + 1, training.hints.length))}
                        disabled={hintIndex >= training.hints.length}
                        style={{
                          marginTop: '12px',
                          padding: '8px 16px',
                          background: hintIndex >= training.hints.length ? 'rgba(30, 41, 59, 0.5)' : 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.35))',
                          color: hintIndex >= training.hints.length ? '#475569' : '#e0e7ff',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          cursor: hintIndex >= training.hints.length ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          width: '100%',
                          transition: 'all 0.2s'
                        }}
                      >
                        {hintIndex >= training.hints.length
                          ? '✓ تم كشف جميع التلميحات'
                          : `🔓 كشف التلميح المساعد التالي (${hintIndex}/${training.hints.length})`}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="session-hints" style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.18)', borderRadius: '6px', fontSize: '12px', color: '#a5b4fc' }}>
                    💡 التلميحات موجودة داخل نافذة <strong>أدوات التشفير السيبرانية</strong> (Swiss Tools) — افتحها من سطح المكتب.
                  </div>
                )}
              </>
            )}

            {showResult && (
              <div className={`session-result ${isCorrect ? 'success' : 'fail'}`}>
                <div className="session-result-glow" />
                <span className="session-result-emoji">
                  {isCorrect ? <CheckCircle size={36} className="text-emerald-400" /> : <AlertTriangle size={36} className="text-rose-500" />}
                </span>
                <h3>
                  {isCorrect
                    ? (teamRole === 'blue' ? '🛡️ تم تأمين الكود بنجاح!' : '🎯 تم تنفيذ الاختراق بنجاح!')
                    : (teamRole === 'blue' ? '⚠️ الكود غير آمن أو لم يتم إصلاح الثغرة!' : '❌ استغلال خاطئ، لم يتم الحصول على العلم!')}
                </h3>
                <div className="session-result-xp">
                  {isCorrect ? `+${training.xpReward} XP 🚀` : '0 XP'}
                </div>
                <div className="session-explanation-box">
                  <h4>📖 الشرح والأبعاد الأمنية</h4>
                  <p>{training.explanation}</p>
                </div>
                {attempts > 0 && (
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>
                    عدد المحاولات: <strong style={{ color: '#fbbf24' }}>{attempts + 1}</strong>
                  </div>
                )}
                <div className="session-result-actions">
                  {!isCorrect && (
                    <button className="session-btn" onClick={handleRetrySame}>
                      🔁 حاول مرة أخرى
                    </button>
                  )}
                  <button className="session-btn" onClick={generateTraining}>🔄 تحدٍ جديد</button>
                  <button className="session-btn ghost" onClick={onBack}>العودة</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const DatabaseIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5V19A9 3 0 0 0 21 19V5" />
    <path d="M3 12A9 3 0 0 0 21 12" />
  </svg>
);

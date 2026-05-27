import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Cpu, 
  Shield, 
  Loader2, 
  CheckCircle, 
  Flame,
  Globe,
  Lock,
  Eye,
  AlertTriangle,
  Check,
  ChevronLeft,
  FileText,
  Settings,
  Key,
  X,
  FolderOpen,
  Folder,
  Search,
  Power
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

interface TrainingData {
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
}

interface TrainingSessionProps {
  moduleTitle: string;
  categoryId: string;
  pathId: string;
  moduleId: string;
  onBack: () => void;
}

export const TrainingSession: React.FC<TrainingSessionProps> = ({
  moduleTitle, categoryId, pathId, moduleId, onBack,
}) => {
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
  const [simulatedTitle, setSimulatedTitle] = useState('جاري التفكير...');
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hasCalledRef = useRef(false);

  // --- VS Code IDE Simulator States ---
  const [isOpenEditor, setIsOpenEditor] = useState(false);
  const [editorFiles, setEditorFiles] = useState<{ [key: string]: string }>({});
  const [selectedFile, setSelectedFile] = useState('index.html');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<{ secured: boolean; feedback: string } | null>(null);

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
  
  // Notepad state
  const [notepadTitle, setNotepadTitle] = useState('Apex_Readme.txt');
  const [notepadContent, setNotepadContent] = useState('');

  // Swiss-Army Cryptanalysis tool states
  const [decrypterInput, setDecrypterInput] = useState('');
  const [decrypterOutput, setDecrypterOutput] = useState('');
  const [decrypterType, setDecrypterType] = useState('base64_decode');
  const [caesarShift, setCaesarShift] = useState(3);
  
  // Windows Drag-and-drop state management
  const [draggingWindow, setDraggingWindow] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeZIndex, setActiveZIndex] = useState(15);

  // Windows Desktop navigable directory contents dynamically synced with the active dynamic challenge expected flag!
  const rawExpected = training?.expectedAnswer || 'APEX{C3RPT0_M15S10N_SUCCESS}';
  const primaryExpected = rawExpected.split('|')[0].trim();
  
  let dynamicB64 = '';
  try {
    dynamicB64 = btoa(primaryExpected);
  } catch (e) {
    dynamicB64 = btoa(encodeURIComponent(primaryExpected));
  }

  const directoryStructure: { [key: string]: { type: 'dir' | 'file'; name: string; desc: string; content?: string }[] } = {
    'C:\\': [
      { type: 'dir', name: 'Secrets', desc: 'مجلد محمي للملفات الحساسة' },
      { type: 'dir', name: 'System32', desc: 'ملفات نظام ويندوز الأساسية' },
      { type: 'file', name: 'Apex_Readme.txt', desc: 'ملف المساعدة والتعليمات', content: 'مرحباً بك في نظام المهمات السيبرانية من APEX!\nاستخدم أدوات التشفير وموجه الأوامر والملفات المتاحة لتجاوز التحديات واكتشاف الأعلام.' }
    ],
    'C:\\Secrets': [
      { type: 'file', name: 'secret.enc', desc: 'ملف استخباراتي مشفر', content: dynamicB64 },
      { type: 'file', name: 'flag.txt', desc: 'ملف الإشارة المباشر', content: `العلم الخاص بك هو:\n${primaryExpected}` }
    ],
    'C:\\System32': [
      { type: 'file', name: 'kernel32.dll', desc: 'مكتبة النظام الأساسية', content: 'APEX SYSTEM WINDOWS KERNEL CORE DLL REGISTERED SUCCESSFULLY' },
      { type: 'file', name: 'cmd.exe', desc: 'موجه الأوامر التنفيذي', content: 'Command Executor' }
    ],
    'C:\\Users\\Admin\\Documents': [
      { type: 'file', name: 'security_report.txt', desc: 'التقرير الأمني للشبكة', content: 'تم فحص جميع المنافذ وتأمين قاعدة البيانات.' }
    ],
    'C:\\Users\\Admin\\Downloads': [
      { type: 'file', name: 'payload_template.txt', desc: 'أمثلة ثغرات الحقن', content: 'XSS: <img src=x onerror=alert(1)>\nSQLi: \' OR \'1\'=\'1' }
    ]
  };

  // Terminal history state
  const [cmdInput, setCmdInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([
    'APEX(R) CYBERSEC OS [Version 11.2.2026]',
    '(c) APEX Security Systems Corporation. All rights reserved.',
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
    if (hasCalledRef.current) return;
    hasCalledRef.current = true;
    generateTraining();
  }, []);

  const generateTraining = async () => {
    setLoading(true);
    setShowResult(false);
    setAnswer('');
    setHintIndex(0);
    setError('');
    setShowVuln(false);
    setTraining(null);
    setSimulatedStep(0);
    setSimulatedPercent(0);
    setSimulatedTitle('جاري التفكير في فكرة التحدي...');
    setIsOpenEditor(false);
    setEvalResult(null);

    let isFinishedFetching = false;
    let fetchedTraining: TrainingData | null = null;
    let fetchErrorMsg = '';

    const apiFetchPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/training/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module: moduleTitle, path: pathId, category: categoryId, moduleId }),
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
    <title>بوابة التعليقات الآمنة - APEX</title>
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
    <title>بوابة التعليقات الآمنة - APEX</title>
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
      setSimulatedTitle('جاري صياغة السيناريو السيبراني القتالي...');
      for (let i = 41; i <= 60; i += 2) {
        setSimulatedPercent(i);
        await new Promise((r) => setTimeout(r, 100));
      }

      setSimulatedStep(3);
      setSimulatedTitle('جاري إعداد محاكي الويب وحقن ثغرة أمنية واقعية...');
      for (let i = 61; i <= 80; i += 2) {
        setSimulatedPercent(i);
        await new Promise((r) => setTimeout(r, 120));
      }

      setSimulatedStep(4);
      setSimulatedTitle('جاري إتمام الفحص الأمني وتجميع المختبر...');
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
        setSimulatedTitle('تم تجهيز المختبر بالكامل بنجاح!');
        await new Promise((r) => setTimeout(r, 600));

        setEditorFiles({
          'index.html': fetchedTraining.htmlPreview || fetchedTraining.code || '<!-- Code not loaded -->',
          'security_config.json': `{
  "security": {
    "xss_filtering": false,
    "sql_parameterization": false,
    "allow_modals": true,
    "debug_mode": true
  },
  "database": {
    "driver": "sqlite",
    "storage": "./data/apex_db.sqlite"
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
        setLoading(false);
      } else {
        setError('فشل استلام محتويات المختبر السيبراني.');
        setLoading(false);
      }
    };

    await Promise.all([apiFetchPromise, runSimulation()]);
  };

  const handleSubmit = async () => {
    const userAnswer = answer.trim().toLowerCase();
    const expected = training?.expectedAnswer?.toLowerCase() || '';
    
    // Bidirectional matching to accept both raw flags and formatted flags (e.g., with or without APEX{} wrapper)
    const correct = expected.split('|').some((e: string) => {
      const trimmedExpected = e.trim();
      if (!userAnswer || !trimmedExpected) return false;
      return (
        userAnswer.includes(trimmedExpected) || 
        trimmedExpected.includes(userAnswer) ||
        userAnswer.replace(/[^a-z0-9]/g, '') === trimmedExpected.replace(/[^a-z0-9]/g, '')
      );
    });

    setIsCorrect(correct);
    setShowResult(true);

    if (correct && training) {
      try {
        const raw = localStorage.getItem('apex_session') || '{}';
        const session = JSON.parse(raw);
        const userData = session.user || session;
        const userId = userData.id;
        if (userId) {
          await fetch(`${API_URL}/xp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_xp', user_id: userId, xp_amount: training.xpReward }),
          });
        }
      } catch {}
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
      const res = await fetch(`${API_URL}/training/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          originalChallenge: training,
          userCode
        })
      });

      if (!res.ok) throw new Error('فشل فحص الكود من المخدم.');
      const data = await res.json();
      const result = data.evaluation;
      setEvalResult(result);
      
      if (result.secured) {
        setIsCorrect(true);
        setShowResult(true);
        const raw = localStorage.getItem('apex_session') || '{}';
        const session = JSON.parse(raw);
        const userData = session.user || session;
        const userId = userData.id;
        if (userId) {
          await fetch(`${API_URL}/xp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_xp', user_id: userId, xp_amount: training.xpReward }),
          });
        }
      }
    } catch (err: any) {
      setEvalResult({
        secured: false,
        feedback: 'عذراً، فشل الاتصال بخادم التقييم الذكي. تأكد من جودة كودك وحاول مرة أخرى.'
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

  // --- Swiss-Army Cryptanalysis Tool (100% Real General Utility) ---
  const handleDecrypt = () => {
    let output = '';
    const input = decrypterInput;

    if (!input) {
      setDecrypterOutput('❌ الرجاء كتابة بعض النصوص أو الحمولات للتشفير/فك التشفير!');
      return;
    }

    try {
      if (decrypterType === 'base64_decode') {
        output = atob(input);
      } else if (decrypterType === 'base64_encode') {
        output = btoa(input);
      } else if (decrypterType === 'rot13') {
        output = input.replace(/[a-zA-Z]/g, (c: string) => {
          const base = c <= 'Z' ? 65 : 97;
          return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
        });
      } else if (decrypterType === 'caesar_decode') {
        const shift = (26 - caesarShift) % 26;
        output = input.replace(/[a-zA-Z]/g, (c: string) => {
          const base = c <= 'Z' ? 65 : 97;
          return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
        });
      } else if (decrypterType === 'caesar_encode') {
        const shift = caesarShift % 26;
        output = input.replace(/[a-zA-Z]/g, (c: string) => {
          const base = c <= 'Z' ? 65 : 97;
          return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
        });
      } else if (decrypterType === 'hex_decode') {
        const hex = input.replace(/\s+/g, '');
        let str = '';
        for (let i = 0; i < hex.length; i += 2) {
          str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        }
        output = str;
      } else if (decrypterType === 'hex_encode') {
        let hex = '';
        for (let i = 0; i < input.length; i++) {
          hex += input.charCodeAt(i).toString(16).padStart(2, '0') + ' ';
        }
        output = hex.trim().toUpperCase();
      } else if (decrypterType === 'url_decode') {
        output = decodeURIComponent(input);
      } else if (decrypterType === 'url_encode') {
        output = encodeURIComponent(input);
      } else if (decrypterType === 'reverse') {
        output = input.split('').reverse().join('');
      } else {
        output = 'طريقة غير مدعومة حالياً!';
      }
      setDecrypterOutput(output);
    } catch (err: any) {
      setDecrypterOutput('❌ فشل تشفير/فك التشفير! تأكد من توافق تنسيق النص مع الخوارزمية المختارة.');
    }
  };

  // --- Windows File explorer navigations & File clickers ---
  const handleExplorerItemDoubleClick = (item: { type: 'dir' | 'file'; name: string; content?: string }) => {
    if (item.type === 'dir') {
      const newPath = explorerPath === 'C:\\' ? `C:\\${item.name}` : `${explorerPath}\\${item.name}`;
      setExplorerPath(newPath);
    } else {
      const fileContent = item.content || '';
      // If it is a encrypted file, automatically send to Decrypter input and open it
      if (item.name.endsWith('.enc')) {
        setDecrypterInput(fileContent);
        openWindow('cryptoTools');
      } else {
        // Open in notepad
        setNotepadTitle(item.name);
        setNotepadContent(fileContent);
        openWindow('notepad');
      }
    }
  };

  const handleExplorerBack = () => {
    if (explorerPath === 'C:\\') return;
    const parts = explorerPath.split('\\');
    parts.pop();
    const newPath = parts.join('\\') || 'C:\\';
    setExplorerPath(newPath === 'C:' ? 'C:\\' : newPath);
  };

  // --- Windows Terminal Command Handler ---
  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = cmdInput.trim().toLowerCase();
    if (!cmd) return;

    let response = '';
    if (cmd === 'help') {
      response = 'الأوامر المتاحة:\n- ls: عرض الملفات والمجلدات الحالية\n- cat [filename]: قراءة محتوى ملف\n- whoami: عرض اسم المستخدم الحالي\n- clear: مسح الشاشة\n- decrypt-tool: فتح واجهة فك التشفير\n- cd [dir]: تغيير المجلد';
    } else if (cmd === 'ls') {
      const items = directoryStructure[explorerPath] || [];
      response = items.map(item => {
        const typeStr = item.type === 'dir' ? '<DIR>          ' : '               ';
        return `05/27/2026  12:00 PM    ${typeStr} ${item.name}`;
      }).join('\n');
    } else if (cmd.startsWith('cat ')) {
      const file = cmd.substring(4).trim();
      const items = directoryStructure[explorerPath] || [];
      const found = items.find(i => i.name.toLowerCase() === file.toLowerCase());
      if (found) {
        response = `محتوى الملف ${found.name}:\n\n${found.content}`;
      } else {
        response = `خطأ: الملف "${file}" غير موجود في المسار الحالي!`;
      }
    } else if (cmd === 'whoami') {
      response = 'apex_operator_admin';
    } else if (cmd === 'clear') {
      setCmdHistory([]);
      setCmdInput('');
      return;
    } else if (cmd.startsWith('cd ')) {
      const folder = cmd.substring(3).trim();
      if (folder === '..') {
        handleExplorerBack();
        response = 'تم الرجوع للمجلد السابق.';
      } else {
        const items = directoryStructure[explorerPath] || [];
        const found = items.find(i => i.type === 'dir' && i.name.toLowerCase() === folder.toLowerCase());
        if (found) {
          const newPath = explorerPath === 'C:\\' ? `C:\\${found.name}` : `${explorerPath}\\${found.name}`;
          setExplorerPath(newPath);
          response = `تم الانتقال إلى ${newPath}`;
        } else {
          response = `خطأ: المجلد "${folder}" غير موجود!`;
        }
      }
    } else {
      response = `أمر غير معروف: "${cmd}". اكتب help للمساعدة.`;
    }

    setCmdHistory([...cmdHistory, `> ${cmdInput}`, response, '']);
    setCmdInput('');
  };

  const isWebChallenge = 
    !pathId.toLowerCase().includes('crypto') && 
    !categoryId.toLowerCase().includes('crypto') && 
    pathId !== 'basics-crypto';
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
              { id: 1, label: 'توليد فكرة التحدي بالذكاء الاصطناعي' },
              { id: 2, label: 'صياغة السيناريو القتالي الأمني' },
              { id: 3, label: 'حقن الثغرة وبناء المختبر التفاعلي' },
              { id: 4, label: 'إعداد أدوات التحليل والتشفير' }
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

  return (
    <div className="dash-page session-page">
      <header className="dash-header">
        <a href="/" className="dash-logo">APEX<sup>®</sup></a>
        <div className="dash-header-right">
          <div className="session-top-bar">
            <span className="session-badge">{moduleTitle}</span>
            <span className={`session-diff ${training.difficulty === 'مبتدئ' ? 'easy' : training.difficulty === 'متوسط' ? 'medium' : 'hard'}`}>
              {training.difficulty}
            </span>
            <span className="session-xp">+{training.xpReward} XP</span>
          </div>
          <button onClick={onBack} className="path-back-link">
            <ChevronLeft size={16} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
            <span>العودة</span>
          </button>
        </div>
      </header>

      <main className="session-split">
        {/* LEFT WORKSPACE: WEB PREVIEW + VS CODE OR WINDOWS DESKTOP SIMULATOR */}
        <div className="session-left">
          
          {isWebChallenge ? (
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
                <button 
                  className={`browser-tab code-editor-tab-btn ${isOpenEditor ? 'active' : ''}`}
                  onClick={() => setIsOpenEditor(true)}
                >
                  <Terminal size={14} style={{ marginLeft: '6px' }} />
                  <span>فتح محرر الأكواد (VS Code) 💻</span>
                </button>
              </div>

              <div className="session-browser-url">
                <Lock size={12} className="text-emerald-400" style={{ marginLeft: '6px' }} />
                <div className="browser-url-text">
                  {isOpenEditor ? 'vscode://workspace/apex-challenge-security' : 'https://apex-train.com/lab-preview'}
                </div>
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
                      <span>🔍 تحقق من الحل</span>
                    )}
                  </button>
                )}
              </div>

              <div className="session-browser-body" style={{ background: isOpenEditor ? '#1e1e1e' : '#fff' }}>
                {!isOpenEditor ? (
                  <>
                    <iframe
                      ref={iframeRef}
                      className="session-browser-iframe"
                      srcDoc={editorFiles['index.html'] || training.htmlPreview}
                      sandbox="allow-scripts allow-modals"
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
                        <div className="tree-project-title">APEX_PROJECT</div>
                        
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
                      <input type="text" placeholder="ابحث في ملفات وأدوات APEX..." readOnly />
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
                      <button className="explorer-nav-item" onClick={() => setExplorerPath('C:\\Users\\Admin\\Documents')}>📁 المستندات</button>
                      <button className="explorer-nav-item" onClick={() => setExplorerPath('C:\\Users\\Admin\\Downloads')}>📁 التنزيلات</button>
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

              {/* 2. Cryptography tools Window */}
              {windowsState.cryptoTools.isOpen && (
                <div 
                  className={`window-frame ${activeWindow === 'cryptoTools' ? 'active' : ''}`}
                  style={{ zIndex: windowsState.cryptoTools.zIndex, left: `${windowsState.cryptoTools.x}px`, top: `${windowsState.cryptoTools.y}px` }}
                  onClick={() => focusWindow('cryptoTools')}
                  dir="rtl"
                >
                  <div className="window-header" onMouseDown={(e) => handleMouseDown(e, 'cryptoTools')}>
                    <span className="window-title">أدوات فك التشفير السيبرانية - APEX Swiss Tools</span>
                    <div className="window-controls">
                      <button onClick={(e) => { e.stopPropagation(); closeWindow('cryptoTools'); }} className="control-btn close">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="window-body crypto-body">
                    <div className="crypto-tool-row">
                      <label>النص المراد تشفيره أو فكه (Input Text):</label>
                      <textarea 
                        value={decrypterInput} 
                        onChange={(e) => setDecrypterInput(e.target.value)}
                        placeholder="اكتب أو الصق النص هنا..."
                      />
                    </div>
                    
                    <div className="crypto-tool-row-actions">
                      <div className="select-wrapper">
                        <label>الخوارزمية / العملية:</label>
                        <select value={decrypterType} onChange={(e) => setDecrypterType(e.target.value)}>
                          <option value="base64_decode">فك تشفير Base64</option>
                          <option value="base64_encode">تشفير Base64</option>
                          <option value="rot13">فك/تشفير ROT13</option>
                          <option value="caesar_decode">فك تشفير Caesar (إزاحة)</option>
                          <option value="caesar_encode">تشفير Caesar (إزاحة)</option>
                          <option value="hex_decode">فك تشفير Hex</option>
                          <option value="hex_encode">تشفير Hex</option>
                          <option value="url_decode">فك ترميز URL</option>
                          <option value="url_encode">ترميز URL</option>
                          <option value="reverse">عكس السلسلة النصية</option>
                        </select>
                      </div>

                      {(decrypterType === 'caesar_decode' || decrypterType === 'caesar_encode') && (
                        <div className="shift-wrapper">
                          <label>قيمة الإزاحة:</label>
                          <input 
                            type="number" 
                            min="1" 
                            max="25" 
                            value={caesarShift} 
                            onChange={(e) => setCaesarShift(parseInt(e.target.value) || 3)}
                            style={{ width: '60px', padding: '4px', background: '#0b0e14', color: '#fff', border: '1px solid #333', borderRadius: '4px' }}
                          />
                        </div>
                      )}

                      <button onClick={handleDecrypt} className="crypto-btn">تنفيذ العملية ⚙️</button>
                    </div>

                    <div className="crypto-tool-row mt-2">
                      <label>النتيجة المعالجة (Output Text):</label>
                      <div className="crypto-result-box">{decrypterOutput || 'بانتظار تنفيذ العملية...'}</div>
                    </div>
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
                  style={{ zIndex: windowsState.notepad.zIndex, left: `${windowsState.notepad.x}px`, top: `${windowsState.notepad.y}px`, width: '400px', height: '300px' }}
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
                  <div className="window-body notepad-body">
                    <textarea 
                      className="notepad-textarea"
                      value={notepadContent}
                      readOnly
                    />
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
                <Shield size={18} />
              </div>
              <p>{training.story}</p>
            </div>

            <div className="session-task-box">
              <h3>🎯 المهمة المطلوبة</h3>
              <p>{training.task}</p>
            </div>

            {hasLog && training.logData && (
              <div className="session-log-box">
                <div className="session-log-header">
                  <Terminal size={14} style={{ marginLeft: '6px' }} />
                  <span>سجلات النظام</span>
                </div>
                <pre className="session-log-body"><code>{training.logData}</code></pre>
              </div>
            )}

            {!showResult && (
              <>
                {(!isWebChallenge || !isOpenEditor) && (
                  <div className="session-answer-area">
                    <label className="session-answer-label">✏️ تقديم الإجابة أو العلم (Flag)</label>
                    <textarea
                      className="session-answer-input"
                      placeholder="اكتب إجابتك هنا..."
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      dir="auto"
                      spellCheck={false}
                    />
                  </div>
                )}

                <div className="session-hints">
                  <button className="session-hint-btn" onClick={() => setHintIndex((i) => Math.min(i + 1, training.hints.length))}>
                    💡 تلميح ({hintIndex}/{training.hints.length})
                  </button>
                  {hintIndex > 0 && (
                    <div className="session-hint-content">
                      {training.hints.slice(0, hintIndex).map((h, i) => (
                        <p key={i} className="session-hint-text">🔹 {h}</p>
                      ))}
                    </div>
                  )}
                </div>

                {(!isWebChallenge || !isOpenEditor) && (
                  <button className="session-submit" onClick={handleSubmit}>
                    <Check size={18} style={{ marginLeft: '8px' }} />
                    <span>تأكيد الإجابة</span>
                  </button>
                )}
              </>
            )}

            {showResult && (
              <div className={`session-result ${isCorrect ? 'success' : 'fail'}`}>
                <div className="session-result-glow" />
                <span className="session-result-emoji">
                  {isCorrect ? <CheckCircle size={36} className="text-emerald-400" /> : <AlertTriangle size={36} className="text-rose-500" />}
                </span>
                <h3>{isCorrect ? 'إجابة صحيحة!' : 'إجابة خاطئة، حاول مرة أخرى!'}</h3>
                <div className="session-result-xp">
                  {isCorrect ? `+${training.xpReward} XP 🚀` : '0 XP'}
                </div>
                <div className="session-explanation-box">
                  <h4>📖 الشرح والأبعاد الأمنية</h4>
                  <p>{training.explanation}</p>
                </div>
                <div className="session-result-actions">
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
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M3 5V19A9 3 0 0 0 21 19V5"/>
    <path d="M3 12A9 3 0 0 0 21 12"/>
  </svg>
);

export type Lang = 'ar' | 'en';

export const DEFAULT_LANG: Lang = 'ar'; // Arabic is the default (spec §18)

type Dict = Record<string, { ar: string; en: string }>;

export const dict: Dict = {
  appName: { ar: 'مسار 34', en: 'MASAR 34' },
  tagline: {
    ar: 'منصة ذكية لإدارة الحشود والطوابير والعمليات',
    en: 'Smart crowd, queue & operations management',
  },
  login: { ar: 'تسجيل الدخول', en: 'Sign in' },
  email: { ar: 'البريد الإلكتروني', en: 'Email' },
  password: { ar: 'كلمة المرور', en: 'Password' },
  signIn: { ar: 'دخول', en: 'Sign in' },
  signingIn: { ar: 'جارٍ الدخول...', en: 'Signing in...' },
  logout: { ar: 'تسجيل الخروج', en: 'Logout' },
  invalidCredentials: { ar: 'بيانات الدخول غير صحيحة', en: 'Invalid credentials' },
  dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
  crowd: { ar: 'مراقبة الحشود', en: 'Crowd Monitoring' },
  queues: { ar: 'الطوابير', en: 'Queues' },
  alerts: { ar: 'التنبيهات', en: 'Alerts' },
  incidents: { ar: 'الحوادث', en: 'Incidents' },
  simulation: { ar: 'مركز المحاكاة', en: 'Simulation Center' },
  activeEvents: { ar: 'الفعاليات النشطة', en: 'Active Events' },
  totalVisitors: { ar: 'إجمالي الزوار', en: 'Total Visitors' },
  currentOccupancy: { ar: 'الإشغال الحالي', en: 'Current Occupancy' },
  avgQueueTime: { ar: 'متوسط زمن الانتظار', en: 'Avg Queue Time' },
  activeAlerts: { ar: 'التنبيهات النشطة', en: 'Active Alerts' },
  openIncidents: { ar: 'الحوادث المفتوحة', en: 'Open Incidents' },
  highRiskZones: { ar: 'مناطق عالية الخطورة', en: 'High-Risk Zones' },
  gateThroughput: { ar: 'إنتاجية البوابات', en: 'Gate Throughput' },
  predictedCongestion: { ar: 'الاختناق المتوقع', en: 'Predicted Congestion' },
  minutes: { ar: 'دقيقة', en: 'min' },
  occupancy: { ar: 'الإشغال', en: 'Occupancy' },
  density: { ar: 'الكثافة', en: 'Density' },
  risk: { ar: 'الخطورة', en: 'Risk' },
  zone: { ar: 'المنطقة', en: 'Zone' },
  startSim: { ar: 'بدء المحاكاة', en: 'Start Simulation' },
  stopSim: { ar: 'إيقاف المحاكاة', en: 'Stop Simulation' },
  scenario: { ar: 'السيناريو', en: 'Scenario' },
  loading: { ar: 'جارٍ التحميل...', en: 'Loading...' },
  noData: { ar: 'لا توجد بيانات', en: 'No data' },
  error: { ar: 'حدث خطأ', en: 'Something went wrong' },
  waitingTime: { ar: 'زمن الانتظار', en: 'Waiting Time' },
  queueLength: { ar: 'طول الطابور', en: 'Queue Length' },
  gate: { ar: 'البوابة', en: 'Gate' },
  severity: { ar: 'الخطورة', en: 'Severity' },
  message: { ar: 'الرسالة', en: 'Message' },
  status: { ar: 'الحالة', en: 'Status' },
  acknowledge: { ar: 'إقرار', en: 'Acknowledge' },
  resolve: { ar: 'حل', en: 'Resolve' },
  demoNote: {
    ar: 'مستخدمون تجريبيون — كلمة المرور: Masar34!Demo',
    en: 'Demo users — password: Masar34!Demo',
  },
};

export function t(key: keyof typeof dict, lang: Lang): string {
  return dict[key]?.[lang] ?? String(key);
}

export const DENSITY_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  VERY_LOW: { ar: 'منخفضة جداً', en: 'Very Low', color: '#16a34a' },
  LOW: { ar: 'منخفضة', en: 'Low', color: '#16a34a' },
  MODERATE: { ar: 'متوسطة', en: 'Moderate', color: '#eab308' },
  HIGH: { ar: 'عالية', en: 'High', color: '#f97316' },
  CRITICAL: { ar: 'حرجة', en: 'Critical', color: '#dc2626' },
};

export const RISK_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  LOW: { ar: 'منخفضة', en: 'Low', color: '#16a34a' },
  MODERATE: { ar: 'متوسطة', en: 'Moderate', color: '#eab308' },
  HIGH: { ar: 'عالية', en: 'High', color: '#f97316' },
  CRITICAL: { ar: 'حرجة', en: 'Critical', color: '#7c3aed' },
};

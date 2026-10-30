'use client';
import { useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@/components/ui';
import { useLang } from '@/lib/i18n';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import type { Employee } from '@/lib/types';
import { useBranches, useDepartments, useEmployeeOptions } from './hooks';
import { Toggle } from './primitives';
import { useAction } from './utils';

export const NATIONALITIES: { code: string; ar: string; en: string }[] = [
  { code: 'SA', ar: 'سعودي', en: 'Saudi' }, { code: 'EG', ar: 'مصري', en: 'Egyptian' }, { code: 'IN', ar: 'هندي', en: 'Indian' },
  { code: 'PK', ar: 'باكستاني', en: 'Pakistani' }, { code: 'BD', ar: 'بنغلاديشي', en: 'Bangladeshi' }, { code: 'PH', ar: 'فلبيني', en: 'Filipino' },
  { code: 'YE', ar: 'يمني', en: 'Yemeni' }, { code: 'SY', ar: 'سوري', en: 'Syrian' }, { code: 'JO', ar: 'أردني', en: 'Jordanian' },
  { code: 'SD', ar: 'سوداني', en: 'Sudanese' }, { code: 'LB', ar: 'لبناني', en: 'Lebanese' }, { code: 'NP', ar: 'نيبالي', en: 'Nepali' },
  { code: 'LK', ar: 'سريلانكي', en: 'Sri Lankan' }, { code: 'ID', ar: 'إندونيسي', en: 'Indonesian' }, { code: 'KE', ar: 'كيني', en: 'Kenyan' },
  { code: 'MA', ar: 'مغربي', en: 'Moroccan' }, { code: 'TN', ar: 'تونسي', en: 'Tunisian' }, { code: 'OTHER', ar: 'أخرى', en: 'Other' },
];
export function nationalityLabel(code: string | null | undefined, lang: 'ar' | 'en') {
  const n = NATIONALITIES.find((x) => x.code === code);
  return n ? (lang === 'ar' ? n.ar : n.en) : code || '—';
}

type FormState = Record<string, string | boolean>;
const empty: FormState = {
  firstNameAr: '', lastNameAr: '', fullNameEn: '', nationality: 'SA', gender: 'MALE', birthDate: '', maritalStatus: '',
  nationalId: '', idExpiry: '', passportNumber: '', passportExpiry: '', phone: '', email: '',
  branchId: '', departmentId: '', managerId: '', jobTitle: '', hireDate: '', contractType: 'UNLIMITED', contractEndDate: '', probationEndDate: '',
  basicSalary: '', housingAllowance: '', transportAllowance: '', otherAllowances: '0', iban: '', bankCode: '', gosiRegistered: true, gosiFirstRegisteredAt: '', hoursPerDay: '8',
  createLogin: false, loginEmail: '', loginPassword: '',
};
const d10 = (v?: string | null) => (v ? v.slice(0, 10) : '');
function fromEmployee(e: Employee): FormState {
  return {
    ...empty,
    firstNameAr: e.firstNameAr, lastNameAr: e.lastNameAr, fullNameEn: e.fullNameEn ?? '', nationality: e.nationality, gender: e.gender,
    birthDate: d10(e.birthDate), maritalStatus: e.maritalStatus ?? '', nationalId: e.nationalId ?? '', idExpiry: d10(e.idExpiry),
    passportNumber: e.passportNumber ?? '', passportExpiry: d10(e.passportExpiry), phone: e.phone ?? '', email: e.email ?? '',
    branchId: e.branchId ?? '', departmentId: e.departmentId ?? '', managerId: e.managerId ?? '', jobTitle: e.jobTitle ?? '',
    hireDate: d10(e.hireDate), contractType: e.contractType, contractEndDate: d10(e.contractEndDate), probationEndDate: d10(e.probationEndDate),
    basicSalary: String(e.basicSalary ?? ''), housingAllowance: String(e.housingAllowance ?? ''), transportAllowance: String(e.transportAllowance ?? ''),
    otherAllowances: String(e.otherAllowances ?? 0), iban: e.iban ?? '', bankCode: e.bankCode ?? '', gosiRegistered: !!e.gosiRegistered, hoursPerDay: String(e.hoursPerDay ?? 8),
    gosiFirstRegisteredAt: d10(e.gosiFirstRegisteredAt),
  };
}

const SECTIONS = ['personal', 'job', 'salary', 'access'] as const;
type Section = (typeof SECTIONS)[number];

/** Create / edit employee in a modal with sectioned form. */
export function EmployeeFormModal({ open, onClose, employee, onSaved, initialSection = 'personal' }:
  { open: boolean; onClose: () => void; employee?: Employee | null; onSaved: (e: Employee) => void; initialSection?: Section }) {
  const { t, lang } = useLang();
  const editing = !!employee;
  const [f, setF] = useState<FormState>(() => (employee ? fromEmployee(employee) : empty));
  const [section, setSection] = useState<Section>(initialSection);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, run } = useAction();
  const { options: branchOpts } = useBranches();
  const { options: deptOpts } = useDepartments();
  const { options: empOpts } = useEmployeeOptions();

  const s = (k: string) => (f[k] as string) ?? '';
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const validate = () => {
    const req: [string, Section][] = [['firstNameAr', 'personal'], ['lastNameAr', 'personal'], ['nationalId', 'personal'], ['jobTitle', 'job'], ['hireDate', 'job'], ['branchId', 'job'], ['basicSalary', 'salary']];
    const errs: Record<string, string> = {};
    for (const [k] of req) if (!s(k).trim()) errs[k] = t('حقل مطلوب', 'Required');
    if (s('iban') && !/^SA\d{22}$/.test(s('iban').replace(/\s/g, '').toUpperCase())) errs.iban = t('آيبان سعودي غير صالح (SA + 22 رقماً)', 'Invalid Saudi IBAN (SA + 22 digits)');
    if (f.createLogin && (!s('loginEmail') || s('loginPassword').length < 8)) errs.loginEmail = t('أدخل بريداً وكلمة مرور (8 أحرف على الأقل)', 'Enter email and password (min 8 chars)');
    setErrors(errs);
    const first = req.find(([k]) => errs[k]);
    if (first) setSection(first[1]);
    else if (errs.iban) setSection('salary');
    else if (errs.loginEmail) setSection('access');
    return !Object.keys(errs).length;
  };

  const submit = async () => {
    if (!validate()) return;
    const opt = (k: string) => (s(k).trim() ? s(k).trim() : null);
    const n = (k: string) => Number(s(k) || 0);
    const body: Record<string, unknown> = {
      firstNameAr: s('firstNameAr').trim(), lastNameAr: s('lastNameAr').trim(), fullNameEn: s('fullNameEn').trim(),
      nationality: s('nationality'), gender: s('gender'), birthDate: opt('birthDate'), maritalStatus: opt('maritalStatus'),
      nationalId: s('nationalId').trim(), idExpiry: opt('idExpiry'), passportNumber: opt('passportNumber'), passportExpiry: opt('passportExpiry'),
      phone: opt('phone'), email: opt('email'), branchId: opt('branchId'), departmentId: opt('departmentId'), managerId: opt('managerId'),
      jobTitle: s('jobTitle').trim(), hireDate: s('hireDate'), contractType: s('contractType'),
      contractEndDate: s('contractType') === 'FIXED' ? opt('contractEndDate') : null, probationEndDate: opt('probationEndDate'),
      basicSalary: n('basicSalary'), housingAllowance: n('housingAllowance'), transportAllowance: n('transportAllowance'), otherAllowances: n('otherAllowances'),
      iban: opt('iban')?.replace(/\s/g, '').toUpperCase() ?? null, bankCode: opt('bankCode'), gosiRegistered: !!f.gosiRegistered, hoursPerDay: n('hoursPerDay') || 8,
      gosiFirstRegisteredAt: opt('gosiFirstRegisteredAt'),
    };
    if (!editing && f.createLogin) body.createUser = { email: s('loginEmail').trim(), password: s('loginPassword') };
    let saved: Employee | null = null;
    const ok = await run('save', async () => {
      saved = editing ? await api.patch<Employee>(`/employees/${employee!.id}`, body) : await api.post<Employee>('/employees', body);
    }, editing ? t('تم حفظ التعديلات', 'Changes saved') : t('تمت إضافة الموظف', 'Employee added'));
    if (ok && saved) { onSaved(saved); if (!editing) { setF(empty); setSection('personal'); } }
  };

  const total = ['basicSalary', 'housingAllowance', 'transportAllowance', 'otherAllowances'].reduce((a, k) => a + Number(s(k) || 0), 0);
  const tabs: { v: Section; l: string }[] = [
    { v: 'personal', l: t('البيانات الشخصية', 'Personal') }, { v: 'job', l: t('الوظيفة', 'Job') },
    { v: 'salary', l: t('الراتب والبنك', 'Salary & bank') }, ...(!editing ? [{ v: 'access' as Section, l: t('حساب الدخول', 'App access') }] : []),
  ];
  const err = (k: string) => errors[k];
  const nat = NATIONALITIES.map((n) => ({ value: n.code, label: lang === 'ar' ? n.ar : n.en }));
  const idx = tabs.findIndex((x) => x.v === section);

  return (
    <Modal open={open} onClose={onClose} size="xl" title={editing ? t('تعديل بيانات الموظف', 'Edit employee') : t('إضافة موظف جديد', 'Add new employee')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
        {idx < tabs.length - 1 && <Button variant="ghost" onClick={() => setSection(tabs[idx + 1].v)}>{t('التالي', 'Next')}</Button>}
        <Button onClick={submit} loading={busy === 'save'}>{editing ? t('حفظ', 'Save') : t('إضافة الموظف', 'Add employee')}</Button>
      </>}>
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-sand p-1">
        {tabs.map((x, i) => (
          <button key={x.v} type="button" onClick={() => setSection(x.v)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${section === x.v ? 'bg-white text-primary shadow-soft' : 'text-ink-muted hover:text-primary'}`}>
            <span className={`num flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${section === x.v ? 'bg-accent text-night' : 'bg-sand-300 text-ink-muted'}`}>{i + 1}</span>{x.l}
          </button>
        ))}
      </div>

      {section === 'personal' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('الاسم الأول (عربي)', 'First name (Arabic)')} required error={err('firstNameAr')}><Input value={s('firstNameAr')} onChange={set('firstNameAr')} /></Field>
          <Field label={t('اسم العائلة (عربي)', 'Last name (Arabic)')} required error={err('lastNameAr')}><Input value={s('lastNameAr')} onChange={set('lastNameAr')} /></Field>
          <Field label={t('الاسم الكامل (إنجليزي)', 'Full name (English)')}><Input dir="ltr" value={s('fullNameEn')} onChange={set('fullNameEn')} /></Field>
          <Field label={t('الجنسية', 'Nationality')} required><Select value={s('nationality')} onChange={set('nationality')} options={nat} /></Field>
          <Field label={t('الجنس', 'Gender')}><Select value={s('gender')} onChange={set('gender')} options={[{ value: 'MALE', label: t('ذكر', 'Male') }, { value: 'FEMALE', label: t('أنثى', 'Female') }]} /></Field>
          <Field label={t('تاريخ الميلاد', 'Birth date')}><Input type="date" value={s('birthDate')} onChange={set('birthDate')} /></Field>
          <Field label={s('nationality') === 'SA' ? t('رقم الهوية الوطنية', 'National ID') : t('رقم الإقامة', 'Iqama number')} required error={err('nationalId')}>
            <Input dir="ltr" value={s('nationalId')} onChange={set('nationalId')} maxLength={10} />
          </Field>
          <Field label={t('انتهاء الهوية/الإقامة', 'ID expiry')}><Input type="date" value={s('idExpiry')} onChange={set('idExpiry')} /></Field>
          <Field label={t('الحالة الاجتماعية', 'Marital status')}>
            <Select value={s('maritalStatus')} onChange={set('maritalStatus')} placeholder="—" options={[{ value: 'SINGLE', label: t('أعزب', 'Single') }, { value: 'MARRIED', label: t('متزوج', 'Married') }, { value: 'DIVORCED', label: t('مطلق', 'Divorced') }, { value: 'WIDOWED', label: t('أرمل', 'Widowed') }]} />
          </Field>
          <Field label={t('رقم الجواز', 'Passport number')}><Input dir="ltr" value={s('passportNumber')} onChange={set('passportNumber')} /></Field>
          <Field label={t('انتهاء الجواز', 'Passport expiry')}><Input type="date" value={s('passportExpiry')} onChange={set('passportExpiry')} /></Field>
          <Field label={t('الجوال', 'Phone')}><Input dir="ltr" type="tel" value={s('phone')} onChange={set('phone')} placeholder="05xxxxxxxx" /></Field>
          <Field label={t('البريد الإلكتروني', 'Email')} className="sm:col-span-2 lg:col-span-1"><Input dir="ltr" type="email" value={s('email')} onChange={set('email')} /></Field>
        </div>
      )}

      {section === 'job' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('المسمى الوظيفي', 'Job title')} required error={err('jobTitle')}><Input value={s('jobTitle')} onChange={set('jobTitle')} /></Field>
          <Field label={t('الفرع', 'Branch')} required error={err('branchId')}><Select value={s('branchId')} onChange={set('branchId')} placeholder={t('اختر الفرع', 'Select branch')} options={branchOpts} /></Field>
          <Field label={t('القسم', 'Department')}><Select value={s('departmentId')} onChange={set('departmentId')} placeholder="—" options={deptOpts} /></Field>
          <Field label={t('المدير المباشر', 'Manager')}><Select value={s('managerId')} onChange={set('managerId')} placeholder="—" options={empOpts.filter((o) => o.value !== employee?.id)} /></Field>
          <Field label={t('تاريخ المباشرة', 'Hire date')} required error={err('hireDate')}><Input type="date" value={s('hireDate')} onChange={set('hireDate')} /></Field>
          <Field label={t('نهاية فترة التجربة', 'Probation end')}><Input type="date" value={s('probationEndDate')} onChange={set('probationEndDate')} /></Field>
          <Field label={t('نوع العقد', 'Contract type')}>
            <Select value={s('contractType')} onChange={set('contractType')} options={[{ value: 'UNLIMITED', label: t('غير محدد المدة', 'Unlimited') }, { value: 'FIXED', label: t('محدد المدة', 'Fixed term') }]} />
          </Field>
          {s('contractType') === 'FIXED' && <Field label={t('نهاية العقد', 'Contract end')}><Input type="date" value={s('contractEndDate')} onChange={set('contractEndDate')} /></Field>}
          <Field label={t('ساعات العمل اليومية', 'Hours per day')}><Input type="number" min={1} max={12} dir="ltr" value={s('hoursPerDay')} onChange={set('hoursPerDay')} /></Field>
        </div>
      )}

      {section === 'salary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('الراتب الأساسي', 'Basic salary')} required error={err('basicSalary')}><Input type="number" min={0} dir="ltr" value={s('basicSalary')} onChange={set('basicSalary')} /></Field>
            <Field label={t('بدل السكن', 'Housing')}><Input type="number" min={0} dir="ltr" value={s('housingAllowance')} onChange={set('housingAllowance')} placeholder={s('basicSalary') ? String(Math.round(Number(s('basicSalary')) * 0.25)) : ''} /></Field>
            <Field label={t('بدل النقل', 'Transport')}><Input type="number" min={0} dir="ltr" value={s('transportAllowance')} onChange={set('transportAllowance')} /></Field>
            <Field label={t('بدلات أخرى', 'Other allowances')}><Input type="number" min={0} dir="ltr" value={s('otherAllowances')} onChange={set('otherAllowances')} /></Field>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-primary-50 px-4 py-3">
            <span className="text-sm text-ink-muted">{t('إجمالي الأجر الشهري', 'Total monthly wage')}</span>
            <span className="num text-lg font-bold text-primary">{money(total)}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('الآيبان (IBAN)', 'IBAN')} error={err('iban')} hint={t('مطلوب لملف حماية الأجور', 'Required for the WPS file')}>
              <Input dir="ltr" value={s('iban')} onChange={set('iban')} placeholder="SA0000000000000000000000" />
            </Field>
            <Field label={t('رمز البنك', 'Bank code')}><Input dir="ltr" value={s('bankCode')} onChange={set('bankCode')} placeholder={s('iban').length >= 6 ? s('iban').slice(4, 6) : ''} /></Field>
          </div>
          <Toggle checked={!!f.gosiRegistered} onChange={(v) => setF((x) => ({ ...x, gosiRegistered: v }))} label={t('مسجل في التأمينات الاجتماعية (GOSI)', 'Registered in GOSI')} />
          {!!f.gosiRegistered && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('تاريخ أول تسجيل في التأمينات', 'First GOSI registration date')} hint={t('يحدد نظام النسب (القديم/الجديد)', 'Sets the contribution regime (legacy/new)')}>
                <Input type="date" value={s('gosiFirstRegisteredAt')} onChange={set('gosiFirstRegisteredAt')} />
              </Field>
            </div>
          )}
        </div>
      )}

      {section === 'access' && !editing && (
        <div className="space-y-4">
          <Toggle checked={!!f.createLogin} onChange={(v) => setF((x) => ({ ...x, createLogin: v, loginEmail: (x.loginEmail as string) || (x.email as string) }))}
            label={t('إنشاء حساب دخول للخدمة الذاتية (تطبيق الموظف)', 'Create a self-service login (employee app)')} />
          {f.createLogin && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('بريد الدخول', 'Login email')} required error={err('loginEmail')}><Input dir="ltr" type="email" value={s('loginEmail')} onChange={set('loginEmail')} /></Field>
              <Field label={t('كلمة المرور المؤقتة', 'Temporary password')} required hint={t('8 أحرف على الأقل', 'Min 8 characters')}><Input dir="ltr" type="text" value={s('loginPassword')} onChange={set('loginPassword')} /></Field>
            </div>
          )}
          <p className="rounded-xl bg-sand p-3 text-xs text-ink-muted">{t('يستطيع الموظف من خلال التطبيق تسجيل الحضور بالموقع، وطلب الإجازات، والاطلاع على قسائم الرواتب.', 'Employees can check in by location, request leave and view payslips from the app.')}</p>
        </div>
      )}
    </Modal>
  );
}

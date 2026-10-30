import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { cleanName, isolate } from '../text';
import { UpdateCompanyDto } from '../../settings/settings.dto';
import { UpdateCompanyAdminDto } from '../../admin/admin.dto';
import { RegisterDto } from '../../auth/auth.dto';

describe('cleanName (v2.1 company names)', () => {
  it('strips control characters, newlines and bidi overrides; collapses spaces', () => {
    expect(cleanName('شركة\nحوّل المبلغ إلى SA00\r\n\tفوراً')).toBe('شركة حوّل المبلغ إلى SA00 فوراً');
    expect(cleanName('  منشأة‮abc\u0007  ')).toBe('منشأةabc');
    expect(cleanName('Acme Ltd')).toBe('Acme Ltd');
    expect(cleanName(5 as never)).toBe(5);
  });
  it('DTOs apply it and cap names at 200 characters', () => {
    const s = plainToInstance(UpdateCompanyDto, { nameAr: 'اسم\nثاني', nameEn: 'A'.repeat(201) });
    expect(s.nameAr).toBe('اسم ثاني');
    expect(validateSync(s).map((e) => e.property)).toEqual(['nameEn']);
    const a = plainToInstance(UpdateCompanyAdminDto, { nameAr: 'ب'.repeat(201) });
    expect(validateSync(a).map((e) => e.property)).toEqual(['nameAr']);
    const r = plainToInstance(RegisterDto, { companyNameAr: 'منشأة\n\nجديدة', companyNameEn: 'New\u0000Co' });
    expect(r.companyNameAr).toBe('منشأة جديدة');
    expect(r.companyNameEn).toBe('NewCo');
  });
});

describe('isolate (v2.1 email bidi)', () => {
  it('wraps a value in LRI … PDI', () => {
    expect(isolate('2026-10-29')).toBe('⁦2026-10-29⁩');
  });
});

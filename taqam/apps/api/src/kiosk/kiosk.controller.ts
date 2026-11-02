import { Body, Controller, createParamDecorator, Delete, ExecutionContext, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import { ADMIN, ALL_ROLES, CurrentUser, Public, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { KioskGuard } from './kiosk.guard';
import { KioskContext, KioskService } from './kiosk.service';

const MANAGERS = ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'] as const;
/** Kiosk punches per minute per IP (KIOSK_RATE_LIMIT_MAX, default 60 — a busy shift change at one branch). */
const KIOSK_PUNCH_LIMIT = Number(process.env.KIOSK_RATE_LIMIT_MAX ?? 60);

export class PairKioskDto {
  @ApiProperty({ example: 'جهاز المدخل' }) @IsString() @MaxLength(60) name: string;
}

/** 4–6 digits (Arabic-Indic accepted); validated by the service so the error carries an Arabic message. */
export class KioskPinDto {
  @ApiProperty({ example: '1234' }) @IsString() @MaxLength(32) pin: string;
}

export class KioskPunchDto {
  @ApiProperty({ example: 'EMP-0007', description: 'Employee number, or only its digits as typed on the keypad' }) @IsString() @MaxLength(32) employeeNumber: string;
  @ApiProperty({ example: '1234' }) @IsString() @MaxLength(32) pin: string;
}

const CurrentKiosk = createParamDecorator((_d: unknown, ctx: ExecutionContext): KioskContext => ctx.switchToHttp().getRequest().kiosk);

/** HR side of branch kiosks (pairing, revoking) and the kiosk PIN. Branch managers manage their own branch only. */
@ApiTags('branch kiosk')
@ApiBearerAuth()
@Controller()
export class KioskAdminController {
  constructor(private readonly svc: KioskService) {}

  @Roles(...MANAGERS)
  @Post('branches/:id/kiosks')
  pair(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PairKioskDto) {
    return this.svc.pair(u, id, dto.name);
  }

  @Roles(...MANAGERS)
  @Get('branches/:id/kiosks')
  list(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.list(u, id);
  }

  @Roles(...MANAGERS)
  @Delete('kiosks/:id')
  revoke(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.revoke(u, id);
  }

  @Roles(...ALL_ROLES)
  @Get('me/kiosk-pin')
  myPin(@CurrentUser() u: AuthUser) {
    return this.svc.myPin(u);
  }

  @Roles(...ALL_ROLES)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  @Post('me/kiosk-pin')
  setMyPin(@CurrentUser() u: AuthUser, @Body() dto: KioskPinDto) {
    return this.svc.setMyPin(u, dto.pin);
  }

  @Roles(...ADMIN)
  @Get('employees/:id/kiosk-pin')
  employeePin(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.employeePin(u, id);
  }

  @Roles(...ADMIN)
  @HttpCode(200)
  @Post('employees/:id/kiosk-pin')
  setEmployeePin(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: KioskPinDto) {
    return this.svc.setEmployeePin(u, id, dto.pin);
  }
}

/** The paired kiosk screen itself: no user login, X-Kiosk-Token instead. Never uses the camera. */
@ApiTags('branch kiosk')
@ApiHeader({ name: 'X-Kiosk-Token', required: true, description: 'Pairing token shown once when the kiosk was paired' })
@Public()
@UseGuards(KioskGuard)
@Controller('kiosk')
export class KioskController {
  constructor(private readonly svc: KioskService) {}

  /** Branch, company and the rotating branch code the screen shows (polled about twice a minute). */
  @Throttle({ default: { limit: Math.max(30, KIOSK_PUNCH_LIMIT / 2), ttl: 60000 } })
  @Get('me')
  me(@CurrentKiosk() k: KioskContext) {
    return this.svc.me(k);
  }

  /** Employee number + PIN → IN (no check-in today) or OUT. Wrong PINs lock the employee's PIN (5 in 15 minutes). */
  @Throttle({ default: { limit: KIOSK_PUNCH_LIMIT, ttl: 60000 } })
  @HttpCode(200)
  @Post('punch')
  punch(@CurrentKiosk() k: KioskContext, @Body() dto: KioskPunchDto) {
    return this.svc.punch(k, dto.employeeNumber, dto.pin);
  }
}

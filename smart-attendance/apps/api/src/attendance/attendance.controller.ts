import { Body, Controller, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PUNCH_TYPES, PunchType } from '@sa/domain';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { badRequest, forbidden } from '../common/errors';
import { auditMeta } from '../common/audit.service';
import { AuthedRequest, CurrentPrincipal, Principal, RequirePermission } from '../common/principal';
import { AttendanceService, PunchInput } from './attendance.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class PunchSampleDto {
  @ApiProperty() @IsLatitude()
  lat!: number;

  @ApiProperty() @IsLongitude()
  lng!: number;

  @ApiProperty({ description: 'دقة أفقية بالأمتار' }) @IsNumber() @Min(0) @Max(100_000)
  accuracy_m!: number;

  @ApiProperty({ description: 'وقت التقاط العينة على الهاتف (ISO8601)' }) @IsISO8601()
  captured_at!: string;

  @ApiPropertyOptional({ enum: ['gps', 'fused', 'network'] }) @IsOptional() @IsIn(['gps', 'fused', 'network'])
  provider?: 'gps' | 'fused' | 'network';

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  is_mock?: boolean;

  @ApiPropertyOptional({ description: 'iOS: isSimulatedBySoftware / isProducedByAccessory' })
  @IsOptional() @IsObject()
  source_info?: { simulated?: boolean; accessory?: boolean };
}

class PunchDto implements PunchInput {
  @ApiProperty() @IsUUID()
  challenge_id!: string;

  @ApiProperty({ enum: PUNCH_TYPES }) @IsIn(PUNCH_TYPES as unknown as string[])
  type!: PunchType;

  @ApiProperty({ type: [PunchSampleDto], description: 'من 1 إلى 3 عينات طازجة بعد التحدي' })
  @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => PunchSampleDto)
  location_samples!: PunchSampleDto[];

  @ApiPropertyOptional() @IsOptional() @IsISO8601()
  client_time?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64)
  client_tz?: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(32)
  app_version!: string;

  @ApiProperty({ enum: ['ios', 'android'] }) @IsIn(['ios', 'android'])
  os!: 'ios' | 'android';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32)
  os_version?: string;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean()
  offline?: boolean;

  @ApiPropertyOptional({ enum: ['full', 'reduced', 'approximate'] }) @IsOptional() @IsIn(['full', 'reduced', 'approximate'])
  accuracy_authorization?: 'full' | 'reduced' | 'approximate';

  @ApiProperty({ description: 'App Attest assertion أو توقيع Keystore + Play Integrity' })
  @IsObject()
  attestation!: Record<string, unknown>;
}

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('v1/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('challenges')
  @RequirePermission('attendance.punch')
  @ApiOperation({ summary: 'تحدٍّ لمرة واحدة قبل البصمة (صلاحيته من السياسة، افتراضيًا 60 ثانية).' })
  challenge(@CurrentPrincipal() p: Principal) {
    return this.attendance.createChallenge(p);
  }

  @Post('punches')
  @HttpCode(201)
  @RequirePermission('attendance.punch')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID لكل محاولة؛ الإعادة بالطلب نفسه تعيد الرد نفسه' })
  @ApiOperation({ summary: 'تسجيل حضور أو انصراف. يُنشئ حدثًا وقرارًا حتى للطلب المرفوض.' })
  punch(
    @CurrentPrincipal() p: Principal,
    @Body() body: PunchDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
      throw badRequest('VALIDATION_FAILED', { field: 'Idempotency-Key', reason: 'UUID required' });
    }
    return this.attendance.punch(p, body, idempotencyKey, auditMeta(req, p));
  }

  @Get('me/events')
  @RequirePermission('attendance.punch')
  @ApiOperation({ summary: 'سجل بصماتي مع القرار والأسباب.' })
  myEvents(@CurrentPrincipal() p: Principal) {
    if (!p.employeeId) throw forbidden();
    return this.attendance.myEvents(p);
  }
}

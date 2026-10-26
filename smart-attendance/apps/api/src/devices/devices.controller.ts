import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CHANGE_REASONS, ChangeReason } from '@sa/domain';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Audited } from '../common/audit.interceptor';
import { auditMeta } from '../common/audit.service';
import { AuthedRequest, CurrentPrincipal, Principal, RequirePermission } from '../common/principal';
import { DevicesService } from './devices.service';

class IssueActivationCodeDto {
  @ApiProperty() @IsUUID()
  employee_id!: string;
}

class ChallengeDto {
  @ApiProperty({ enum: ['BIND', 'CHANGE'] }) @IsIn(['BIND', 'CHANGE'])
  purpose!: 'BIND' | 'CHANGE';
}

class DeviceRegistrationDto {
  @ApiProperty() @IsUUID()
  challenge_id!: string;

  @ApiProperty({ enum: ['ios', 'android'] }) @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';

  @ApiProperty({ description: 'App Attest key id أو معرف مفتاح Keystore' })
  @IsString() @IsNotEmpty() @MaxLength(512)
  key_id!: string;

  @ApiProperty({ description: 'حمولة attestation الخاصة بالمنصة، وتتضمن nonce التحدي', type: 'object', additionalProperties: true })
  @IsObject()
  attestation!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'HMAC لـ ANDROID_ID من التطبيق (لا قيمة خام)' })
  @IsOptional() @IsString() @MaxLength(128)
  android_id_hash?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  devicecheck_bit0?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128)
  model?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64)
  os_version?: string;
}

class BindDto {
  @ApiProperty({ example: 'K7P3-XQ9M' }) @IsString() @Length(8, 12)
  activation_code!: string;

  @ApiProperty({ type: DeviceRegistrationDto }) @ValidateNested() @Type(() => DeviceRegistrationDto)
  device!: DeviceRegistrationDto;
}

class ChangeRequestDto {
  @ApiProperty({ enum: CHANGE_REASONS }) @IsIn(CHANGE_REASONS as unknown as string[])
  reason!: ChangeReason;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  @ApiProperty({ type: DeviceRegistrationDto }) @ValidateNested() @Type(() => DeviceRegistrationDto)
  device!: DeviceRegistrationDto;
}

@ApiTags('devices')
@ApiBearerAuth()
@Controller('v1/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('activation-codes')
  @RequirePermission('devices.activation.issue')
  @Audited('device.activation_code.issue', 'activation_code')
  @ApiOperation({ summary: 'HR يصدر رمز تفعيل لمرة واحدة (8 خانات، صلاحية وفق السياسة).' })
  issueCode(@CurrentPrincipal() p: Principal, @Body() body: IssueActivationCodeDto, @Req() req: AuthedRequest) {
    return this.devices.issueActivationCode(p, body.employee_id, auditMeta(req, p));
  }

  @Post('challenges')
  @RequirePermission('devices.self')
  @ApiOperation({ summary: 'تحدٍّ لمرة واحدة يُضمَّن في attestation قبل الربط أو طلب التغيير.' })
  challenge(@CurrentPrincipal() p: Principal, @Body() body: ChallengeDto) {
    return this.devices.createChallenge(p, body.purpose);
  }

  @Post('bind')
  @RequirePermission('devices.self')
  @Audited('device.binding.create', 'device_binding')
  @ApiOperation({ summary: 'الربط الأول برمز التفعيل. يُرفض (403) إن وُجد ارتباط قائم: استخدم طلب التغيير.' })
  bind(@CurrentPrincipal() p: Principal, @Body() body: BindDto, @Req() req: AuthedRequest) {
    return this.devices.bindFirstDevice(p, body.activation_code, body.device, auditMeta(req, p));
  }

  @Post('change-requests')
  @RequirePermission('devices.self')
  @Audited('device.change_request.create', 'device_change_request')
  @ApiOperation({ summary: 'طلب تغيير الجهاز من الجهاز الجديد. لا يغيّر أي ارتباط حتى اعتماد HR.' })
  requestChange(@CurrentPrincipal() p: Principal, @Body() body: ChangeRequestDto, @Req() req: AuthedRequest) {
    return this.devices.requestChange(p, body.reason, body.note, body.device, auditMeta(req, p));
  }

  @Get('change-requests')
  @RequirePermission('devices.change.decide')
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'APPROVED', 'REJECTED', 'EXPIRED'] })
  @ApiOperation({ summary: 'طلبات تغيير الأجهزة.' })
  listChangeRequests(@CurrentPrincipal() p: Principal, @Query('status') status?: string) {
    return this.devices.listChangeRequests(p, status);
  }

  @Post('change-requests/:id/approve')
  @HttpCode(200)
  @RequirePermission('devices.change.decide')
  @Audited('device.change_request.approve', 'device_change_request')
  @ApiOperation({ summary: 'اعتماد HR: القديم SUPERSEDED، والجديد ACTIVE، وإلغاء الجلسات.' })
  approve(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.devices.approveChange(p, id, auditMeta(req, p));
  }

  @Post('change-requests/:id/reject')
  @HttpCode(200)
  @RequirePermission('devices.change.decide')
  @Audited('device.change_request.reject', 'device_change_request')
  @ApiOperation({ summary: 'رفض طلب تغيير الجهاز.' })
  reject(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.devices.rejectChange(p, id, auditMeta(req, p));
  }

  @Get('bindings')
  @RequirePermission('devices.read')
  @ApiQuery({ name: 'employee_id', required: false })
  @ApiOperation({ summary: 'ارتباطات الأجهزة (مدير الفرع: فروعه فقط).' })
  listBindings(@CurrentPrincipal() p: Principal, @Query('employee_id') employeeId?: string) {
    return this.devices.listBindings(p, employeeId);
  }

  @Post('bindings/:id/suspend')
  @HttpCode(200)
  @RequirePermission('devices.binding.suspend')
  @Audited('device.binding.suspend', 'device_binding')
  @ApiOperation({ summary: 'إيقاف فوري (بلاغ سرقة). يلغي الجلسات.' })
  suspend(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.devices.transitionBinding(p, id, 'SUSPENDED', auditMeta(req, p));
  }

  @Post('bindings/:id/reactivate')
  @HttpCode(200)
  @RequirePermission('devices.binding.reactivate')
  @Audited('device.binding.reactivate', 'device_binding')
  @ApiOperation({ summary: 'إعادة تفعيل ارتباط موقوف (HR فقط).' })
  reactivate(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.devices.transitionBinding(p, id, 'ACTIVE', auditMeta(req, p));
  }
}

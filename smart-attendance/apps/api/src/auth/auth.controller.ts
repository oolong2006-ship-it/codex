import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';
import { auditMeta } from '../common/audit.service';
import { AuthedRequest, Public } from '../common/principal';
import { AuthService } from './auth.service';

class LoginDto {
  @ApiProperty({ description: 'البريد أو رقم الجوال' })
  @IsString() @IsNotEmpty() @MaxLength(254)
  identifier!: string;

  @ApiProperty()
  @IsString() @IsNotEmpty() @MaxLength(256)
  password!: string;
}

class MfaTokenDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  mfa_token!: string;
}

class MfaVerifyDto extends MfaTokenDto {
  @ApiProperty({ example: '123456' }) @IsString() @Length(6, 6)
  code!: string;
}

class RefreshDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(128)
  refresh_token!: string;
}

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'الدخول بالبريد أو الجوال. أدوار HR والإدارة تتطلب MFA.' })
  login(@Body() body: LoginDto, @Req() req: AuthedRequest) {
    return this.auth.login(body.identifier, body.password, auditMeta(req));
  }

  @Public()
  @Post('mfa/enroll')
  @HttpCode(200)
  @ApiOperation({ summary: 'بدء تفعيل TOTP (لا يُفعّل حتى التحقق من أول رمز).' })
  enroll(@Body() body: MfaTokenDto) {
    return this.auth.mfaEnroll(body.mfa_token);
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'التحقق من رمز TOTP وإصدار الرموز.' })
  verify(@Body() body: MfaVerifyDto, @Req() req: AuthedRequest) {
    return this.auth.mfaVerify(body.mfa_token, body.code, auditMeta(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'تدوير refresh token مع كشف إعادة الاستخدام.' })
  refresh(@Body() body: RefreshDto, @Req() req: AuthedRequest) {
    return this.auth.refresh(body.refresh_token, auditMeta(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'إلغاء عائلة refresh token.' })
  async logout(@Body() body: RefreshDto): Promise<void> {
    await this.auth.logout(body.refresh_token);
  }
}

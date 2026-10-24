import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ALL_ROLES, CurrentRequestUser, Public, Roles } from '../common/decorators';
import { RequestUser } from '../common/types';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiBearerAuth()
  @Roles(...ALL_ROLES, 'SUPER_ADMIN')
  @Get('me')
  me(@CurrentRequestUser() user: RequestUser) {
    return this.auth.me(user);
  }

  @ApiBearerAuth()
  @Roles(...ALL_ROLES, 'SUPER_ADMIN')
  @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentRequestUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }
}

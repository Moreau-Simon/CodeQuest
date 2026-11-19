import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { AuthenticationGuard } from './authentication.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LockoutService } from './lockout.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    PasswordResetService,
    SessionService,
    LockoutService,
    AuthenticationGuard
  ],
  exports: [AuthService, SessionService, AuthenticationGuard]
})
export class AuthModule {}

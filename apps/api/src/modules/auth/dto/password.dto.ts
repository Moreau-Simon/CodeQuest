import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Demande de réinitialisation (réponse identique que le compte existe ou non). */
export class ForgotPasswordDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  identifier!: string;
}

/** Consommation d'un lien de réinitialisation à usage unique (T055). */
export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token!: string;

  @IsString()
  @MinLength(12, { message: 'Le mot de passe doit contenir au moins 12 caractères' })
  @MaxLength(128)
  password!: string;
}

/** Confirmation d'adresse e-mail (T051). */
export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  token!: string;
}

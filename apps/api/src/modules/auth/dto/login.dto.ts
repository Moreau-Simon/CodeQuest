import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Connexion par e-mail **ou** pseudo (T053). */
export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

/** Déconnexion : session courante ou toutes les sessions. */
export class LogoutDto {
  @IsOptional()
  all?: boolean;
}

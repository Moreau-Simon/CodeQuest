import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Inscription (T049) — contraintes alignées sur `POST /auth/register`. */
export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(3, { message: 'Le pseudo doit contenir au moins 3 caractères' })
  @MaxLength(20, { message: 'Le pseudo ne peut dépasser 20 caractères' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Le pseudo ne peut contenir que des lettres, chiffres, tirets et soulignés'
  })
  pseudonym!: string;

  @IsString()
  @MinLength(12, { message: 'Le mot de passe doit contenir au moins 12 caractères' })
  @MaxLength(128)
  password!: string;
}

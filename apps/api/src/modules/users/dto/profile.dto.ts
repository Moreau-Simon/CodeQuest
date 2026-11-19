import { Transform } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator';

/**
 * Mise à jour du profil (T057, FR-015).
 * `avatarKey` référence un objet du bucket avatars ; l'URL signée est calculée
 * à la lecture du profil, jamais stockée.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Le pseudo doit contenir au moins 3 caractères' })
  @MaxLength(20, { message: 'Le pseudo ne peut dépasser 20 caractères' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Le pseudo ne peut contenir que des lettres, chiffres, tirets et soulignés'
  })
  pseudonym?: string;

  @IsOptional()
  @IsIn(['python', 'javascript'], { message: "Langue d'exécution inconnue" })
  preferredLanguage?: 'python' | 'javascript';

  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @MaxLength(512)
  avatarKey?: string;
}

/** Suppression de compte : réauthentification par mot de passe (FR-012). */
export class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

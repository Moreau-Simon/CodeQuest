import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Authenticated, CurrentUser, Public } from '../rbac/rbac.constants';
import { LoreService, type LoreChapterView } from './lore.service';

/** Routes `/lore` (T201). Lecture publique, progression réservée aux comptes confirmés. */
@Controller('lore')
export class LoreController {
  constructor(private readonly lore: LoreService) {}

  @Public()
  @Get('chapters')
  list(@CurrentUser() user?: AuthenticatedUser): Promise<LoreChapterView[]> {
    return this.lore.list(user?.id);
  }

  @Authenticated()
  @Post('chapters/:chapterId/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @Param('chapterId') chapterId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<LoreChapterView> {
    return this.lore.markRead(user.id, chapterId);
  }
}

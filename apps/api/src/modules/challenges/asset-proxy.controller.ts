import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { Authenticated } from '../rbac/rbac.constants';
import {
  AssetProxyService,
  type AssetKind,
  type AssetQrStyle,
  type AssetVerificationView,
  type AssetView
} from './asset-proxy.service';

class SubjectDto {
  @IsIn(['player', 'team'])
  type!: 'player' | 'team';

  @IsString()
  @MaxLength(200)
  id!: string;
}

class QrStyleDto implements AssetQrStyle {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  fragments?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-180)
  @Max(180)
  rotationDeg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  noiseLevel?: number;

  @IsOptional()
  @IsBoolean()
  overlay?: boolean;
}

class GenerateAssetDto {
  @IsString()
  @MaxLength(200)
  challengeId!: string;

  @Type(() => Number)
  @IsInt()
  challengeVersion!: number;

  @IsIn(['steganography', 'qr_code'])
  kind!: AssetKind;

  @ValidateNested()
  @Type(() => SubjectDto)
  subject!: SubjectDto;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  payload?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => QrStyleDto)
  qrStyle?: QrStyleDto;
}

class AnswerDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assetId?: string;
}

class VerifyAssetDto extends GenerateAssetDto {
  @ValidateNested()
  @Type(() => AnswerDto)
  answer!: AnswerDto;
}

/** Routes `/assets` (T214) : relais court, authentifié, sans graine exposée. */
@Controller('assets')
@Authenticated()
export class AssetProxyController {
  constructor(private readonly assets: AssetProxyService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  generate(@Body() body: GenerateAssetDto): Promise<AssetView> {
    return this.assets.generate({
      ...body,
      subjectType: body.subject.type,
      subjectId: body.subject.id
    });
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() body: VerifyAssetDto): Promise<AssetVerificationView> {
    return this.assets.verify(
      {
        challengeId: body.challengeId,
        challengeVersion: body.challengeVersion,
        kind: body.kind,
        subjectType: body.subject.type,
        subjectId: body.subject.id,
        payload: body.payload,
        qrStyle: body.qrStyle
      },
      body.answer
    );
  }

  @Get(':assetId/content')
  redirect(@Param('assetId') assetId: string, @Res() response: Response): void {
    response.redirect(HttpStatus.FOUND, this.assets.signedUrl(assetId));
  }
}

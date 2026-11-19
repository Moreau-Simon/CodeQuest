import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AesGcmService } from '../../src/common/crypto/aes-gcm.service';

/** Non-régression : `AesGcmService` doit être instanciable par le conteneur Nest. */
@Module({ providers: [AesGcmService] })
class CryptoTestModule {}

describe('AesGcmService — injection Nest (T101)', () => {
  it('laisse les valeurs par défaut de env s’appliquer sans provider String', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [CryptoTestModule] }).compile();
    const service = moduleRef.get(AesGcmService);

    expect(service).toBeInstanceOf(AesGcmService);
    expect(service.keyId).toBe('v1');
  });
});

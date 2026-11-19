import { Test } from '@nestjs/testing';
import { InstanceService } from './instance.service';

/**
 * Régression CI : `fetchImpl` est un alias de type fonction. Sans jeton
 * d'injection explicite, TypeScript émet `Function` dans `design:paramtypes`
 * et Nest échoue à compiler AppModule (`argument Function at index [0]`).
 */
describe('InstanceService — résolution par le conteneur Nest', () => {
  it('se résout sans fournisseur explicite pour la fonction fetch', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [InstanceService]
    }).compile();

    expect(moduleRef.get(InstanceService)).toBeInstanceOf(InstanceService);
    await moduleRef.close();
  });
});

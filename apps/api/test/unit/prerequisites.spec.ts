import {
  PrerequisiteCondition,
  PrerequisiteGraphService,
  validatePrerequisiteExclusivity
} from '../../src/modules/challenges/prerequisite-graph.service';

/**
 * T117 [P] [US5] Tests unitaires du graphe de prérequis (FR-023, FR-024)
 * - Cycle direct et indirect → refus (DAG strict)
 * - Auto-référence interdite
 * - Les quatre types de conditions reconnus
 * - Exclusivité stricte : exactement une seule condition par prérequis
 */
describe('PrerequisiteGraphService & Exclusivity (T117)', () => {
  const graphService = new PrerequisiteGraphService();

  describe('Validation d’exclusivité des 4 types de conditions (FR-023)', () => {
    it('accepte exactement une condition de type requiredChallengeId', () => {
      const condition: PrerequisiteCondition = {
        requiredChallengeId: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01'
      };
      expect(() => validatePrerequisiteExclusivity(condition)).not.toThrow();
    });

    it('accepte exactement une condition de type requiredLevel', () => {
      const condition: PrerequisiteCondition = {
        requiredLevel: 5
      };
      expect(() => validatePrerequisiteExclusivity(condition)).not.toThrow();
    });

    it('accepte exactement une condition de type requiredLessonId', () => {
      const condition: PrerequisiteCondition = {
        requiredLessonId: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b02'
      };
      expect(() => validatePrerequisiteExclusivity(condition)).not.toThrow();
    });

    it('accepte exactement une condition de type requiredLoreChapterId', () => {
      const condition: PrerequisiteCondition = {
        requiredLoreChapterId: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b03'
      };
      expect(() => validatePrerequisiteExclusivity(condition)).not.toThrow();
    });

    it('rejette une condition vide (0 condition renseignée)', () => {
      const condition: PrerequisiteCondition = {};
      expect(() => validatePrerequisiteExclusivity(condition)).toThrow();
      try {
        validatePrerequisiteExclusivity(condition);
      } catch (err: unknown) {
        const response = (err as { getResponse(): { message: string } }).getResponse();
        expect(response.message).toMatch(/exactement une des quatre conditions/i);
      }
    });

    it('rejette un cumul de plusieurs conditions (ex: défi + niveau)', () => {
      const condition: PrerequisiteCondition = {
        requiredChallengeId: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01',
        requiredLevel: 3
      };
      expect(() => validatePrerequisiteExclusivity(condition)).toThrow();
      try {
        validatePrerequisiteExclusivity(condition);
      } catch (err: unknown) {
        const response = (err as { getResponse(): { message: string } }).getResponse();
        expect(response.message).toMatch(/exactement une des quatre conditions/i);
      }
    });

    it('rejette un niveau invalide (ex: <= 0)', () => {
      const condition: PrerequisiteCondition = {
        requiredLevel: 0
      };
      expect(() => validatePrerequisiteExclusivity(condition)).toThrow();
      try {
        validatePrerequisiteExclusivity(condition);
      } catch (err: unknown) {
        const response = (err as { getResponse(): { message: string } }).getResponse();
        expect(response.message).toMatch(/niveau/i);
      }
    });
  });

  describe('Détection de cycles dans le graphe des défis (FR-024 - DAG)', () => {
    it('autorise une chaîne acyclique A -> B -> C', () => {
      // B dépend de A, C dépend de B
      const edges = [
        { challengeId: 'B', requiredChallengeId: 'A' },
        { challengeId: 'C', requiredChallengeId: 'B' }
      ];
      expect(graphService.hasCycle(edges)).toBe(false);
      expect(() => graphService.assertAcyclic(edges)).not.toThrow();
    });

    it('autorise une structure en diamant (DAG avec chemins multiples)', () => {
      // D dépend de B et C, B et C dépendent de A
      const edges = [
        { challengeId: 'B', requiredChallengeId: 'A' },
        { challengeId: 'C', requiredChallengeId: 'A' },
        { challengeId: 'D', requiredChallengeId: 'B' },
        { challengeId: 'D', requiredChallengeId: 'C' }
      ];
      expect(graphService.hasCycle(edges)).toBe(false);
      expect(() => graphService.assertAcyclic(edges)).not.toThrow();
    });

    it('rejette une auto-dépendance A -> A', () => {
      const edges = [{ challengeId: 'A', requiredChallengeId: 'A' }];
      expect(graphService.hasCycle(edges)).toBe(true);
      expect(() => graphService.assertAcyclic(edges)).toThrow(/cycle détecté/i);
    });

    it('rejette un cycle direct A -> B -> A', () => {
      const edges = [
        { challengeId: 'B', requiredChallengeId: 'A' },
        { challengeId: 'A', requiredChallengeId: 'B' }
      ];
      expect(graphService.hasCycle(edges)).toBe(true);
      expect(() => graphService.assertAcyclic(edges)).toThrow(/cycle détecté/i);
    });

    it('rejette un cycle indirect transitif A -> B -> C -> A', () => {
      const edges = [
        { challengeId: 'B', requiredChallengeId: 'A' },
        { challengeId: 'C', requiredChallengeId: 'B' },
        { challengeId: 'A', requiredChallengeId: 'C' }
      ];
      expect(graphService.hasCycle(edges)).toBe(true);
      expect(() => graphService.assertAcyclic(edges)).toThrow(/cycle détecté/i);
    });

    it('vérifie si l’ajout d’une arête introduirait un cycle (canAddEdge)', () => {
      const currentEdges = [
        { challengeId: 'B', requiredChallengeId: 'A' },
        { challengeId: 'C', requiredChallengeId: 'B' }
      ];

      // Ajouter D -> C est valide
      expect(
        graphService.canAddEdge(currentEdges, { challengeId: 'D', requiredChallengeId: 'C' })
      ).toBe(true);

      // Ajouter A -> C créerait le cycle A -> C -> B -> A
      expect(
        graphService.canAddEdge(currentEdges, { challengeId: 'A', requiredChallengeId: 'C' })
      ).toBe(false);
    });
  });
});

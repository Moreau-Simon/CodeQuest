import { BadRequestException, Injectable } from '@nestjs/common';

export interface PrerequisiteCondition {
  requiredChallengeId?: string | null;
  requiredLevel?: number | null;
  requiredLessonId?: string | null;
  requiredLoreChapterId?: string | null;
}

export interface PrerequisiteEdge {
  challengeId: string;
  requiredChallengeId: string;
}

/**
 * Valide qu'exactement une des quatre conditions de prérequis est renseignée (FR-023).
 */
export function validatePrerequisiteExclusivity(condition: PrerequisiteCondition): void {
  const presentConditions = [
    condition.requiredChallengeId !== undefined && condition.requiredChallengeId !== null,
    condition.requiredLevel !== undefined && condition.requiredLevel !== null,
    condition.requiredLessonId !== undefined && condition.requiredLessonId !== null,
    condition.requiredLoreChapterId !== undefined && condition.requiredLoreChapterId !== null
  ].filter(Boolean);

  if (presentConditions.length !== 1) {
    throw new BadRequestException({
      code: 'INVALID_PREREQUISITE_CONDITIONS',
      message: 'Exactement une des quatre conditions de prérequis doit être renseignée'
    });
  }

  if (
    condition.requiredLevel !== undefined &&
    condition.requiredLevel !== null &&
    condition.requiredLevel < 1
  ) {
    throw new BadRequestException({
      code: 'INVALID_REQUIRED_LEVEL',
      message: 'Le niveau requis doit être un entier supérieur ou égal à 1'
    });
  }
}

/**
 * Service de validation du graphe de dépendances entre défis (FR-024).
 * Représente les prérequis sous forme de DAG et refuse toute boucle.
 */
@Injectable()
export class PrerequisiteGraphService {
  /**
   * Vérifie si l'ensemble des arêtes contient au moins un cycle via parcours en profondeur (DFS).
   */
  hasCycle(edges: PrerequisiteEdge[]): boolean {
    const adj = new Map<string, string[]>();

    for (const edge of edges) {
      if (edge.challengeId === edge.requiredChallengeId) {
        return true;
      }
      const neighbors = adj.get(edge.challengeId) ?? [];
      neighbors.push(edge.requiredChallengeId);
      adj.set(edge.challengeId, neighbors);

      if (!adj.has(edge.requiredChallengeId)) {
        adj.set(edge.requiredChallengeId, []);
      }
    }

    // États de visite DFS : 0 = unvisited, 1 = visiting (dans la pile d'appel), 2 = visited
    const state = new Map<string, number>();

    const dfs = (node: string): boolean => {
      state.set(node, 1);
      const neighbors = adj.get(node) ?? [];
      for (const neighbor of neighbors) {
        const neighborState = state.get(neighbor) ?? 0;
        if (neighborState === 1) {
          return true; // Retour sur un nœud de la pile d'appel courante = cycle
        }
        if (neighborState === 0 && dfs(neighbor)) {
          return true;
        }
      }
      state.set(node, 2);
      return false;
    };

    for (const node of adj.keys()) {
      if ((state.get(node) ?? 0) === 0) {
        if (dfs(node)) return true;
      }
    }

    return false;
  }

  /**
   * Valide l'acyclicité du graphe et lève une exception HTTP 400 si un cycle est détecté.
   */
  assertAcyclic(edges: PrerequisiteEdge[]): void {
    if (this.hasCycle(edges)) {
      throw new BadRequestException({
        code: 'PREREQUISITE_CYCLE_DETECTED',
        message:
          'Cycle détecté dans les prérequis de défi : la configuration doit former un graphe acyclique'
      });
    }
  }

  /**
   * Détermine si l'ajout d'une arête est permis sans introduire de cycle.
   */
  canAddEdge(currentEdges: PrerequisiteEdge[], newEdge: PrerequisiteEdge): boolean {
    return !this.hasCycle([...currentEdges, newEdge]);
  }
}

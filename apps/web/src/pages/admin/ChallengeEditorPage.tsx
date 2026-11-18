import { useState } from 'react';
import { Button, Input } from '../../components/ui';
import {
  createChallengeDraft,
  validateChallenge,
  type ChallengeDraftInput
} from '../../services/admin';

/**
 * Éditeur et validation de défis pour les administrateurs (T113, FR-084, FR-085).
 */
export function ChallengeEditorPage(): JSX.Element {
  const [title, setTitle] = useState('');
  const [themeId, setThemeId] = useState('');
  const [type, setType] = useState('sorting');
  const [difficulty, setDifficulty] = useState(2);
  const [basePoints, setBasePoints] = useState(200);
  const [perfMax, setPerfMax] = useState(80);
  const [statement, setStatement] = useState('');
  const [referenceSolution, setReferenceSolution] = useState(
    'def solve(values):\n    return sorted(values)'
  );
  const [testsRaw, setTestsRaw] = useState(
    JSON.stringify(
      [
        { input: [3, 1, 2], expected: [1, 2, 3], isHidden: false },
        { input: [10, -1, 5], expected: [-1, 5, 10], isHidden: true }
      ],
      null,
      2
    )
  );

  const [createdChallengeId, setCreatedChallengeId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setValidationError(null);
    setValidationResult(null);

    try {
      let parsedTests = [];
      try {
        parsedTests = JSON.parse(testsRaw);
      } catch {
        throw new Error('Le format JSON des tests est invalide.');
      }

      const payload: ChallengeDraftInput = {
        themeId,
        type,
        difficulty: Number(difficulty),
        title,
        statement,
        languages: ['python'],
        basePoints: Number(basePoints),
        perfMax: Number(perfMax),
        referenceSolution,
        tests: parsedTests
      };

      const res = await createChallengeDraft(payload);
      setCreatedChallengeId(res.id);
      setValidationResult(`Brouillon enregistré avec succès (ID: ${res.id})`);
    } catch (err: unknown) {
      setValidationError((err as Error).message || 'Erreur lors de la sauvegarde du défi');
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!createdChallengeId) return;
    setLoading(true);
    setValidationError(null);
    setValidationResult(null);

    try {
      const res = await validateChallenge(createdChallengeId);
      setValidationResult(
        `✓ Défi validé et publié avec succès !\n` +
          `• Bornes calibrées : t_opt = ${res.tOptMs} ms, t_max = ${res.tMaxMs} ms\n` +
          `• Tests validés : ${res.testsTotal}`
      );
    } catch (err: unknown) {
      setValidationError(
        (err as Error).message ||
          'La validation a échoué. La solution de référence ne passe pas tous les tests.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Créateur de défi</h1>
      <p className="mt-1 text-muted">
        Rédigez l'énoncé, configurez la solution et validez l'épreuve.
      </p>

      {validationResult && (
        <div className="mt-6 whitespace-pre-line rounded-xl bg-success/10 p-4 text-sm text-success">
          {validationResult}
        </div>
      )}

      {validationError && (
        <div className="mt-6 whitespace-pre-line rounded-xl bg-error/10 p-4 text-sm text-error">
          {validationError}
        </div>
      )}

      <form onSubmit={handleSaveDraft} className="mt-8 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Titre</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Tri fusion"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">ID Thématique (UUID)</label>
            <Input
              value={themeId}
              onChange={(e) => setThemeId(e.target.value)}
              placeholder="UUID de la thématique"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="text-sm font-medium">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="sorting">Tri (sorting)</option>
              <option value="debugging">Débogage (debugging)</option>
              <option value="decryption">Décryptage (decryption)</option>
              <option value="steganography">Stéganographie</option>
              <option value="qr_code">QR Code</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Difficulté (1 à 5)</label>
            <Input
              type="number"
              min={1}
              max={5}
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Points de base</label>
            <Input
              type="number"
              min={0}
              value={basePoints}
              onChange={(e) => setBasePoints(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Bonus performance</label>
            <Input
              type="number"
              min={0}
              value={perfMax}
              onChange={(e) => setPerfMax(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Énoncé (Markdown)</label>
          <textarea
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            rows={5}
            className="mt-1 block w-full rounded-lg border border-border bg-surface p-3 font-mono text-sm"
            placeholder="Rédigez les consignes du défi en Markdown..."
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium">Solution de référence (Python)</label>
          <textarea
            value={referenceSolution}
            onChange={(e) => setReferenceSolution(e.target.value)}
            rows={4}
            className="mt-1 block w-full rounded-lg border border-border bg-surface p-3 font-mono text-sm"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium">Jeux de tests (JSON)</label>
          <textarea
            value={testsRaw}
            onChange={(e) => setTestsRaw(e.target.value)}
            rows={6}
            className="mt-1 block w-full rounded-lg border border-border bg-surface p-3 font-mono text-sm"
            required
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border">
          <Button type="submit" disabled={loading}>
            {loading ? 'Enregistrement...' : '1. Enregistrer le brouillon'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={handleValidate}
            disabled={!createdChallengeId || loading}
          >
            2. Valider et calibrer la solution
          </Button>
        </div>
      </form>
    </section>
  );
}

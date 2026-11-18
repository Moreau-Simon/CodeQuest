import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonText } from './Skeleton';

describe('Skeleton', () => {
  it('reste décoratif sans libellé', () => {
    render(<Skeleton />);
    const block = screen.getByTestId('skeleton-block');
    expect(block).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('annonce l’attente quand un libellé est fourni', () => {
    render(<Skeleton label="Chargement des défis" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Chargement des défis');
  });

  it('compose plusieurs lignes de texte', () => {
    render(<SkeletonText lines={3} label="Chargement du profil" />);
    expect(screen.getAllByTestId('skeleton-block')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement du profil');
  });
});

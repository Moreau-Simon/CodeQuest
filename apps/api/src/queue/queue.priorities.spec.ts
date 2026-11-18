import { submissionJobOptions, SUBMISSION_PRIORITIES } from './queue.priorities';

describe('priorités de la file de soumissions', () => {
  it('respecte le contrat runner-job.md §6', () => {
    expect(SUBMISSION_PRIORITIES).toEqual({
      event: 1,
      boss: 2,
      standard: 3,
      validation: 4
    });
  });

  it('utilise submissionId comme jobId (idempotence)', () => {
    const options = submissionJobOptions('018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01', 'standard');
    expect(options.jobId).toBe('018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01');
  });

  it('ne rejoue jamais un échec de code (attempts = 1)', () => {
    expect(submissionJobOptions('sub-1', 'event').attempts).toBe(1);
  });

  it('applique la priorité du type de soumission', () => {
    expect(submissionJobOptions('sub-1', 'event').priority).toBe(1);
    expect(submissionJobOptions('sub-1', 'boss').priority).toBe(2);
    expect(submissionJobOptions('sub-1', 'standard').priority).toBe(3);
    expect(submissionJobOptions('sub-1', 'validation').priority).toBe(4);
  });
});

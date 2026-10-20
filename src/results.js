const feelingResults = {
  calor: 1,
  sudor: 2,
  ambas: 2,
  interrumpe: 3,
  todas: 3,
};

export function resultForAnswers(frequency, feeling) {
  if (frequency === 'never') return 0;
  if (frequency !== 'sometimes' && frequency !== 'often') return null;
  return feelingResults[feeling] ?? null;
}

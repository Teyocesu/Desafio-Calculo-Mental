import {
  Difficulty,
  GameMode,
  Operation,
  QuestionRecord,
  RoundConfig,
  RoundResult,
} from './types';

export const DEFAULT_CONFIG: RoundConfig = {
  difficulty: 'easy',
  mode: 'classic',
  questionCount: 10,
  dynamicDifficulty: true,
};

export const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; shortLabel: string; description: string; timeLimitMs: number; totalTimeMs: number }
> = {
  easy: {
    label: 'Fácil',
    shortLabel: 'Fácil',
    description: 'Sumas y restas simples con más tiempo por operación.',
    timeLimitMs: 12000,
    totalTimeMs: 60000,
  },
  medium: {
    label: 'Medio',
    shortLabel: 'Medio',
    description: 'Suma, resta y multiplicación con números moderados.',
    timeLimitMs: 9000,
    totalTimeMs: 50000,
  },
  hard: {
    label: 'Difícil',
    shortLabel: 'Difícil',
    description: 'Operaciones más grandes, multiplicación y división exacta.',
    timeLimitMs: 7000,
    totalTimeMs: 40000,
  },
};

export const MODE_META: Record<GameMode, { label: string; description: string }> = {
  classic: {
    label: 'Clásico',
    description: 'Escribí el resultado correcto de cada operación.',
  },
  trueFalse: {
    label: 'Verdadero / falso',
    description: 'Decidí si la igualdad mostrada es correcta.',
  },
  multipleChoice: {
    label: 'Multiple choice',
    description: 'Elegí una respuesta entre cuatro opciones.',
  },
  timeAttack: {
    label: 'Contra reloj',
    description: 'Respondé en cadena hasta fallar o agotar el tiempo total.',
  },
};

const OPERATORS: Record<Difficulty, ('+' | '-' | 'x' | '/')[]> = {
  easy: ['+', '-'],
  medium: ['+', '-', 'x'],
  hard: ['+', '-', 'x', '/'],
};

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const shuffle = <T,>(items: T[]) =>
  [...items].sort(() => Math.random() - 0.5);

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const baseOperationForDifficulty = (difficulty: Difficulty) => {
  const operator = OPERATORS[difficulty][randomInt(0, OPERATORS[difficulty].length - 1)];

  if (difficulty === 'easy') {
    const a = randomInt(2, 25);
    const b = randomInt(1, 20);
    if (operator === '+') return { expression: `${a} + ${b}`, result: a + b };
    const bigger = Math.max(a, b);
    const smaller = Math.min(a, b);
    return { expression: `${bigger} - ${smaller}`, result: bigger - smaller };
  }

  if (difficulty === 'medium') {
    if (operator === 'x') {
      const a = randomInt(3, 12);
      const b = randomInt(2, 12);
      return { expression: `${a} x ${b}`, result: a * b };
    }
    const a = randomInt(12, 70);
    const b = randomInt(8, 55);
    if (operator === '+') return { expression: `${a} + ${b}`, result: a + b };
    return { expression: `${Math.max(a, b)} - ${Math.min(a, b)}`, result: Math.abs(a - b) };
  }

  if (operator === '/') {
    const divisor = randomInt(3, 15);
    const result = randomInt(4, 18);
    return { expression: `${divisor * result} / ${divisor}`, result };
  }

  if (operator === 'x') {
    const a = randomInt(7, 19);
    const b = randomInt(6, 16);
    return { expression: `${a} x ${b}`, result: a * b };
  }

  const a = randomInt(35, 160);
  const b = randomInt(20, 130);
  if (operator === '+') return { expression: `${a} + ${b}`, result: a + b };
  return { expression: `${Math.max(a, b)} - ${Math.min(a, b)}`, result: Math.abs(a - b) };
};

const buildDistractors = (answer: number, difficulty: Difficulty) => {
  const distance = difficulty === 'easy' ? 8 : difficulty === 'medium' ? 18 : 32;
  const values = new Set<number>([answer]);

  while (values.size < 4) {
    const offset = randomInt(-distance, distance);
    if (offset !== 0) values.add(Math.max(0, answer + offset));
  }

  return shuffle([...values]);
};

const makeFalseAnswer = (answer: number, difficulty: Difficulty) => {
  const distance = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 15 : 28;
  let proposed = answer;
  while (proposed === answer) {
    proposed = Math.max(0, answer + randomInt(-distance, distance));
  }
  return proposed;
};

export function generateOperation(config: RoundConfig): Operation {
  const base = baseOperationForDifficulty(config.difficulty);
  const mode = config.mode;

  if (mode === 'trueFalse') {
    const isStatementTrue = Math.random() >= 0.5;
    const proposedAnswer = isStatementTrue
      ? base.result
      : makeFalseAnswer(base.result, config.difficulty);

    return {
      id: makeId(),
      expression: base.expression,
      correctAnswer: base.result,
      proposedAnswer,
      isStatementTrue,
      mode,
    };
  }

  if (mode === 'multipleChoice') {
    return {
      id: makeId(),
      expression: base.expression,
      correctAnswer: base.result,
      options: buildDistractors(base.result, config.difficulty),
      mode,
    };
  }

  return {
    id: makeId(),
    expression: base.expression,
    correctAnswer: base.result,
    mode,
  };
}

export function getQuestionTimeLimit(config: RoundConfig, answeredCount: number) {
  const baseLimit = DIFFICULTY_META[config.difficulty].timeLimitMs;
  if (!config.dynamicDifficulty) return baseLimit;

  const step = config.mode === 'timeAttack' ? 450 : 350;
  const reduction = Math.min(answeredCount * step, baseLimit * 0.5);
  return Math.round(baseLimit - reduction);
}

export function getTotalTimeLimit(config: RoundConfig) {
  return DIFFICULTY_META[config.difficulty].totalTimeMs;
}

export function normalizeNumericAnswer(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function scoreAnswer(correct: boolean, timedOut: boolean, responseTimeMs: number, timeLimitMs: number) {
  if (timedOut) return -50;
  if (!correct) return -30;
  return responseTimeMs < timeLimitMs * 0.75 ? 100 : 70;
}

export function summarizeRound(records: QuestionRecord[]): RoundResult {
  const correct = records.filter((record) => record.correct).length;
  const timedOut = records.filter((record) => record.timedOut).length;
  const incorrect = records.length - correct - timedOut;
  const score = records.reduce((total, record) => total + record.scoreDelta, 0);
  const answered = records.filter((record) => !record.timedOut);
  const averageResponseTimeMs = answered.length
    ? Math.round(answered.reduce((total, record) => total + record.responseTimeMs, 0) / answered.length)
    : 0;

  return {
    correct,
    incorrect,
    timedOut,
    score,
    accuracy: records.length ? Math.round((correct / records.length) * 100) : 0,
    averageResponseTimeMs,
    totalQuestions: records.length,
  };
}

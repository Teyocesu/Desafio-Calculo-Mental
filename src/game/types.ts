export type Difficulty = 'easy' | 'medium' | 'hard';

export type GameMode = 'classic' | 'trueFalse' | 'multipleChoice' | 'timeAttack';

export type FeedbackType = 'correct' | 'incorrect' | 'timeout';

export type RoundConfig = {
  difficulty: Difficulty;
  mode: GameMode;
  questionCount: number;
  dynamicDifficulty: boolean;
};

export type Operation = {
  id: string;
  expression: string;
  correctAnswer: number;
  mode: GameMode;
  proposedAnswer?: number;
  isStatementTrue?: boolean;
  options?: number[];
};

export type QuestionRecord = {
  operation: Operation;
  selectedAnswer: number | boolean | null;
  correct: boolean;
  timedOut: boolean;
  responseTimeMs: number;
  scoreDelta: number;
};

export type RoundResult = {
  correct: number;
  incorrect: number;
  timedOut: number;
  score: number;
  accuracy: number;
  averageResponseTimeMs: number;
  totalQuestions: number;
};

export type StoredSession = {
  id: string;
  dateIso: string;
  config: RoundConfig;
  result: RoundResult;
  records: QuestionRecord[];
};

export type StoredSettings = RoundConfig;

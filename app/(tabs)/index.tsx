import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  DEFAULT_CONFIG,
  DIFFICULTY_META,
  MODE_META,
  generateOperation,
  getQuestionTimeLimit,
  getTotalTimeLimit,
  normalizeNumericAnswer,
  scoreAnswer,
  summarizeRound,
} from '@/src/game/engine';
import { loadSettings, saveSession, saveSettings } from '@/src/game/storage';
import {
  Difficulty,
  FeedbackType,
  GameMode,
  Operation,
  QuestionRecord,
  RoundConfig,
  StoredSession,
} from '@/src/game/types';

type Phase = 'setup' | 'playing' | 'result';

type FeedbackState = {
  type: FeedbackType;
  message: string;
};

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const MODES: GameMode[] = ['classic', 'trueFalse', 'multipleChoice', 'timeAttack'];

const formatSeconds = (ms: number) => `${Math.ceil(ms / 1000)}s`;
const formatTime = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export default function GameScreen() {
  const [config, setConfig] = useState<RoundConfig>(DEFAULT_CONFIG);
  const [phase, setPhase] = useState<Phase>('setup');
  const [operation, setOperation] = useState<Operation | null>(null);
  const [records, setRecords] = useState<QuestionRecord[]>([]);
  const [answer, setAnswer] = useState('');
  const [remainingMs, setRemainingMs] = useState(DIFFICULTY_META.easy.timeLimitMs);
  const [questionLimitMs, setQuestionLimitMs] = useState(DIFFICULTY_META.easy.timeLimitMs);
  const [totalRemainingMs, setTotalRemainingMs] = useState(DIFFICULTY_META.easy.totalTimeMs);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [inputError, setInputError] = useState('');
  const [lastSession, setLastSession] = useState<StoredSession | null>(null);

  const feedbackScale = useRef(new Animated.Value(0)).current;
  const operationRef = useRef<Operation | null>(null);
  const recordsRef = useRef<QuestionRecord[]>([]);
  const questionStartedAtRef = useRef(0);
  const questionLimitMsRef = useRef(questionLimitMs);
  const totalStartedAtRef = useRef(0);
  const totalLimitMsRef = useRef(getTotalTimeLimit(DEFAULT_CONFIG));
  const lockedRef = useRef(false);

  useEffect(() => {
    loadSettings().then((settings) => {
      setConfig(settings);
      const limit = DIFFICULTY_META[settings.difficulty].timeLimitMs;
      setRemainingMs(limit);
      setQuestionLimitMs(limit);
      setTotalRemainingMs(getTotalTimeLimit(settings));
    });
  }, []);

  useEffect(() => {
    operationRef.current = operation;
  }, [operation]);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    questionLimitMsRef.current = questionLimitMs;
  }, [questionLimitMs]);

  useEffect(() => {
    if (!feedback) {
      feedbackScale.setValue(0);
      return;
    }

    Animated.sequence([
      Animated.spring(feedbackScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 16,
        bounciness: 8,
      }),
      Animated.timing(feedbackScale, {
        toValue: 0.96,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [feedback, feedbackScale]);

  const currentScore = useMemo(
    () => records.reduce((total, record) => total + record.scoreDelta, 0),
    [records],
  );

  const roundResult = useMemo(() => summarizeRound(records), [records]);
  const questionProgress = Math.max(0, Math.min(1, remainingMs / questionLimitMs));
  const totalLimitMs = getTotalTimeLimit(config);
  const totalProgress = Math.max(0, Math.min(1, totalRemainingMs / totalLimitMs));

  const patchConfig = (changes: Partial<RoundConfig>) => {
    const nextConfig = { ...config, ...changes };
    setConfig(nextConfig);
    saveSettings(nextConfig).catch(() => undefined);
  };

  const startQuestion = useCallback((answeredCount: number) => {
    const nextOperation = generateOperation(config);
    const limit = getQuestionTimeLimit(config, answeredCount);
    const now = Date.now();

    lockedRef.current = false;
    questionStartedAtRef.current = now;
    questionLimitMsRef.current = limit;
    operationRef.current = nextOperation;
    setOperation(nextOperation);
    setAnswer('');
    setInputError('');
    setFeedback(null);
    setQuestionLimitMs(limit);
    setRemainingMs(limit);
  }, [config]);

  const finishRound = useCallback(async (nextRecords: QuestionRecord[]) => {
    lockedRef.current = true;
    const session: StoredSession = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dateIso: new Date().toISOString(),
      config,
      result: summarizeRound(nextRecords),
      records: nextRecords,
    };

    setRecords(nextRecords);
    setLastSession(session);
    setPhase('result');
    setOperation(null);
    setFeedback(null);
    await saveSession(session);
  }, [config]);

  const continueOrFinish = useCallback((nextRecords: QuestionRecord[], record: QuestionRecord) => {
    const shouldStopTimeAttack = config.mode === 'timeAttack' && (!record.correct || record.timedOut);
    const shouldStopRound = config.mode !== 'timeAttack' && nextRecords.length >= config.questionCount;

    setTimeout(() => {
      if (shouldStopTimeAttack || shouldStopRound) {
        finishRound(nextRecords).catch(() => undefined);
        return;
      }
      startQuestion(nextRecords.length);
    }, 620);
  }, [config.mode, config.questionCount, finishRound, startQuestion]);

  const resolveCurrentQuestion = useCallback((selectedAnswer: number | boolean | null, timedOut = false) => {
    const currentOperation = operationRef.current;
    if (!currentOperation || lockedRef.current || phase !== 'playing') return;

    lockedRef.current = true;
    Keyboard.dismiss();

    const now = Date.now();
    const elapsedQuestionMs = Math.max(0, now - questionStartedAtRef.current);
    const elapsedRoundMs = Math.max(0, now - totalStartedAtRef.current);
    const didTimeOut =
      timedOut ||
      elapsedQuestionMs >= questionLimitMsRef.current ||
      (currentOperation.mode === 'timeAttack' && elapsedRoundMs >= totalLimitMsRef.current);
    const responseTimeMs = didTimeOut
      ? Math.min(questionLimitMsRef.current, elapsedQuestionMs)
      : elapsedQuestionMs;

    const correct =
      !didTimeOut &&
      (currentOperation.mode === 'trueFalse'
        ? selectedAnswer === currentOperation.isStatementTrue
        : selectedAnswer === currentOperation.correctAnswer);

    const scoreDelta = scoreAnswer(correct, didTimeOut, responseTimeMs, questionLimitMsRef.current);
    const record: QuestionRecord = {
      operation: currentOperation,
      selectedAnswer,
      correct,
      timedOut: didTimeOut,
      responseTimeMs,
      scoreDelta,
    };

    const nextRecords = [...recordsRef.current, record];
    setRecords(nextRecords);
    setFeedback({
      type: didTimeOut ? 'timeout' : correct ? 'correct' : 'incorrect',
      message: didTimeOut ? 'Tiempo agotado' : correct ? `+${scoreDelta}` : `${scoreDelta}`,
    });
    continueOrFinish(nextRecords, record);
  }, [continueOrFinish, phase]);

  useEffect(() => {
    if (phase !== 'playing' || !operation) return undefined;

    const timerId = setInterval(() => {
      const now = Date.now();
      const nextRemaining = Math.max(0, questionLimitMsRef.current - (now - questionStartedAtRef.current));
      setRemainingMs(nextRemaining);

      if (config.mode === 'timeAttack') {
        const nextTotalRemaining = Math.max(0, totalLimitMsRef.current - (now - totalStartedAtRef.current));
        setTotalRemainingMs(nextTotalRemaining);
        if (nextTotalRemaining <= 0) {
          resolveCurrentQuestion(null, true);
          return;
        }
      }

      if (nextRemaining <= 0) resolveCurrentQuestion(null, true);
    }, 120);

    return () => clearInterval(timerId);
  }, [config.mode, operation, phase, resolveCurrentQuestion]);

  const startRound = () => {
    const totalLimit = getTotalTimeLimit(config);
    const now = Date.now();

    saveSettings(config).catch(() => undefined);
    recordsRef.current = [];
    totalStartedAtRef.current = now;
    totalLimitMsRef.current = totalLimit;
    setRecords([]);
    setLastSession(null);
    setPhase('playing');
    setTotalRemainingMs(totalLimit);
    setTimeout(() => startQuestion(0), 0);
  };

  const submitNumericAnswer = () => {
    const parsed = normalizeNumericAnswer(answer);
    if (parsed === null) {
      setInputError('Ingresá un número válido.');
      return;
    }
    setInputError('');
    resolveCurrentQuestion(parsed);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View>
            <Text style={styles.kicker}>Desarrollo de Aplicaciones I</Text>
            <Text style={styles.title}>Desafío Cálculo Mental</Text>
          </View>
          <View style={styles.mathTiles} accessibilityLabel="Operadores matemáticos">
            {['+', '-', 'x', '/'].map((symbol) => (
              <View key={symbol} style={styles.mathTile}>
                <Text style={styles.mathTileText}>{symbol}</Text>
              </View>
            ))}
          </View>
        </View>

        {phase === 'setup' && (
          <SetupView config={config} onChange={patchConfig} onStart={startRound} />
        )}

        {phase === 'playing' && operation && (
          <PlayingView
            answer={answer}
            config={config}
            currentScore={currentScore}
            feedback={feedback}
            feedbackScale={feedbackScale}
            inputError={inputError}
            operation={operation}
            questionLimitMs={questionLimitMs}
            questionProgress={questionProgress}
            records={records}
            remainingMs={remainingMs}
            totalProgress={totalProgress}
            totalRemainingMs={totalRemainingMs}
            onAnswerChange={setAnswer}
            onNumericSubmit={submitNumericAnswer}
            onResolve={resolveCurrentQuestion}
          />
        )}

        {phase === 'result' && (
          <ResultView
            result={lastSession?.result ?? roundResult}
            records={records}
            onConfigure={() => setPhase('setup')}
            onRestart={startRound}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SetupView({
  config,
  onChange,
  onStart,
}: {
  config: RoundConfig;
  onChange: (changes: Partial<RoundConfig>) => void;
  onStart: () => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader icon="tune" title="Configuración" />

      <Text style={styles.label}>Dificultad</Text>
      <SegmentedControl
        options={DIFFICULTIES}
        value={config.difficulty}
        getLabel={(difficulty) => DIFFICULTY_META[difficulty].label}
        onChange={(difficulty) => onChange({ difficulty })}
      />

      <Text style={styles.label}>Modo</Text>
      <View style={styles.modeGrid}>
        {MODES.map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="button"
            onPress={() => onChange({ mode })}
            style={[styles.modeButton, config.mode === mode && styles.modeButtonActive]}>
            <Text style={[styles.modeButtonText, config.mode === mode && styles.modeButtonTextActive]}>
              {MODE_META[mode].label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.settingRow}>
        <View>
          <Text style={styles.label}>Iteraciones</Text>
          <Text style={styles.mutedText}>{config.mode === 'timeAttack' ? 'Ronda continua' : 'Preguntas por ronda'}</Text>
        </View>
        <View style={styles.stepper}>
          <IconButton
            icon="remove"
            disabled={config.mode === 'timeAttack' || config.questionCount <= 5}
            onPress={() => onChange({ questionCount: Math.max(5, config.questionCount - 1) })}
          />
          <Text style={styles.stepperValue}>{config.mode === 'timeAttack' ? '∞' : config.questionCount}</Text>
          <IconButton
            icon="add"
            disabled={config.mode === 'timeAttack' || config.questionCount >= 25}
            onPress={() => onChange({ questionCount: Math.min(25, config.questionCount + 1) })}
          />
        </View>
      </View>

      <View style={styles.settingRow}>
        <View>
          <Text style={styles.label}>Dificultad dinámica</Text>
          <Text style={styles.mutedText}>Reduce el tiempo disponible</Text>
        </View>
        <Switch
          value={config.dynamicDifficulty}
          onValueChange={(dynamicDifficulty) => onChange({ dynamicDifficulty })}
          trackColor={{ false: '#CBD5E1', true: '#98D8CF' }}
          thumbColor={config.dynamicDifficulty ? '#0E7C7B' : '#F8FAFC'}
        />
      </View>

      <View style={styles.configSummary}>
        <StatPill label="Tiempo por operación" value={formatSeconds(DIFFICULTY_META[config.difficulty].timeLimitMs)} />
        <StatPill label="Tiempo contra reloj" value={formatSeconds(getTotalTimeLimit(config))} />
        <StatPill label="Modo activo" value={MODE_META[config.mode].label} />
      </View>

      <Pressable style={styles.primaryButton} onPress={onStart} accessibilityRole="button">
        <MaterialIcons name="play-arrow" size={22} color="#FFFFFF" />
        <Text style={styles.primaryButtonText}>Iniciar ronda</Text>
      </Pressable>
    </View>
  );
}

function PlayingView({
  answer,
  config,
  currentScore,
  feedback,
  feedbackScale,
  inputError,
  operation,
  questionLimitMs,
  questionProgress,
  records,
  remainingMs,
  totalProgress,
  totalRemainingMs,
  onAnswerChange,
  onNumericSubmit,
  onResolve,
}: {
  answer: string;
  config: RoundConfig;
  currentScore: number;
  feedback: FeedbackState | null;
  feedbackScale: Animated.Value;
  inputError: string;
  operation: Operation;
  questionLimitMs: number;
  questionProgress: number;
  records: QuestionRecord[];
  remainingMs: number;
  totalProgress: number;
  totalRemainingMs: number;
  onAnswerChange: (value: string) => void;
  onNumericSubmit: () => void;
  onResolve: (selectedAnswer: number | boolean | null, timedOut?: boolean) => void;
}) {
  const progressLabel =
    config.mode === 'timeAttack' ? `${records.length + 1}` : `${records.length + 1}/${config.questionCount}`;

  return (
    <View style={styles.section}>
      <View style={styles.gameTopBar}>
        <StatPill label="Pregunta" value={progressLabel} />
        <StatPill label="Puntaje" value={String(currentScore)} />
        <StatPill label="Tiempo" value={formatTime(remainingMs)} tone={questionProgress <= 0.25 ? 'danger' : 'default'} />
      </View>

      <ProgressBar progress={questionProgress} tone={questionProgress <= 0.25 ? 'danger' : 'primary'} />
      {config.mode === 'timeAttack' && (
        <View style={styles.totalTimer}>
          <Text style={styles.totalTimerText}>Total {formatTime(totalRemainingMs)}</Text>
          <ProgressBar progress={totalProgress} tone="secondary" compact />
        </View>
      )}

      <View style={styles.operationPanel}>
        <Text style={styles.operationLabel}>{MODE_META[config.mode].label}</Text>
        <Text style={styles.operationText}>
          {operation.mode === 'trueFalse'
            ? `${operation.expression} = ${operation.proposedAnswer}`
            : operation.expression}
        </Text>
        <Text style={styles.operationMeta}>Límite actual {formatTime(questionLimitMs)}</Text>
      </View>

      {operation.mode === 'trueFalse' && (
        <View style={styles.answerGrid}>
          <AnswerButton label="Verdadero" icon="check" onPress={() => onResolve(true)} />
          <AnswerButton label="Falso" icon="close" variant="danger" onPress={() => onResolve(false)} />
        </View>
      )}

      {operation.mode === 'multipleChoice' && (
        <View style={styles.choiceGrid}>
          {operation.options?.map((option) => (
            <Pressable key={option} style={styles.choiceButton} onPress={() => onResolve(option)}>
              <Text style={styles.choiceText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {(operation.mode === 'classic' || operation.mode === 'timeAttack') && (
        <View style={styles.inputRow}>
          <TextInput
            value={answer}
            onChangeText={onAnswerChange}
            keyboardType="numeric"
            placeholder="Resultado"
            placeholderTextColor="#7B8794"
            style={styles.answerInput}
            onSubmitEditing={onNumericSubmit}
            returnKeyType="done"
          />
          <Pressable style={styles.submitButton} onPress={onNumericSubmit}>
            <MaterialIcons name="send" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

      {!!inputError && <Text style={styles.errorText}>{inputError}</Text>}

      {feedback && (
        <Animated.View
          style={[
            styles.feedback,
            feedback.type === 'correct' && styles.feedbackCorrect,
            feedback.type === 'incorrect' && styles.feedbackIncorrect,
            feedback.type === 'timeout' && styles.feedbackTimeout,
            { transform: [{ scale: feedbackScale }] },
          ]}>
          <MaterialIcons
            name={feedback.type === 'correct' ? 'check-circle' : feedback.type === 'timeout' ? 'timer-off' : 'cancel'}
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.feedbackText}>{feedback.message}</Text>
        </Animated.View>
      )}

      <View style={styles.miniHistory}>
        {records.slice(-5).map((record, index) => (
          <View
            key={`${record.operation.id}-${index}`}
            style={[styles.historyDot, record.correct ? styles.historyDotCorrect : styles.historyDotMiss]}
          />
        ))}
      </View>
    </View>
  );
}

function ResultView({
  result,
  records,
  onConfigure,
  onRestart,
}: {
  result: ReturnType<typeof summarizeRound>;
  records: QuestionRecord[];
  onConfigure: () => void;
  onRestart: () => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader icon="workspace-premium" title="Resultado" />
      <View style={styles.resultScore}>
        <Text style={styles.resultScoreLabel}>Puntaje final</Text>
        <Text style={styles.resultScoreValue}>{result.score}</Text>
      </View>

      <View style={styles.configSummary}>
        <StatPill label="Precisión" value={`${result.accuracy}%`} />
        <StatPill label="Correctas" value={String(result.correct)} tone="success" />
        <StatPill label="Incorrectas" value={String(result.incorrect)} tone="danger" />
        <StatPill label="Timeout" value={String(result.timedOut)} tone="warning" />
        <StatPill label="Tiempo promedio" value={formatTime(result.averageResponseTimeMs)} />
      </View>

      <View style={styles.chartBlock}>
        <Text style={styles.chartTitle}>Evolución de la ronda</Text>
        <View style={styles.scoreBars}>
          {records.map((record, index) => (
            <View key={`${record.operation.id}-${index}`} style={styles.scoreBarSlot}>
              <View
                style={[
                  styles.scoreBar,
                  {
                    height: Math.max(12, Math.min(72, Math.abs(record.scoreDelta) * 0.7)),
                    backgroundColor: record.scoreDelta > 0 ? '#0E7C7B' : '#E4572E',
                  },
                ]}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={onConfigure}>
          <MaterialIcons name="settings" size={20} color="#0E7C7B" />
          <Text style={styles.secondaryButtonText}>Configurar</Text>
        </Pressable>
        <Pressable style={styles.primaryButtonSmall} onPress={onRestart}>
          <MaterialIcons name="replay" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Otra ronda</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: keyof typeof MaterialIcons.glyphMap; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <MaterialIcons name={icon} size={22} color="#E4572E" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  getLabel,
  onChange,
}: {
  options: T[];
  value: T;
  getLabel: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            onPress={() => onChange(option)}
            style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{getLabel(option)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatPill({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger' | 'warning';
}) {
  return (
    <View style={[styles.statPill, tone === 'danger' && styles.statDanger, tone === 'warning' && styles.statWarning]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone === 'success' && styles.statValueSuccess, tone === 'danger' && styles.statValueDanger]}>
        {value}
      </Text>
    </View>
  );
}

function IconButton({
  disabled,
  icon,
  onPress,
}: {
  disabled?: boolean;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.iconButton, disabled && styles.iconButtonDisabled]}>
      <MaterialIcons name={icon} size={20} color={disabled ? '#94A3B8' : '#17212B'} />
    </Pressable>
  );
}

function AnswerButton({
  icon,
  label,
  onPress,
  variant = 'primary',
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger';
}) {
  return (
    <Pressable
      style={[styles.answerButton, variant === 'danger' && styles.answerButtonDanger]}
      onPress={onPress}>
      <MaterialIcons name={icon} size={22} color="#FFFFFF" />
      <Text style={styles.answerButtonText}>{label}</Text>
    </Pressable>
  );
}

function ProgressBar({
  compact,
  progress,
  tone,
}: {
  compact?: boolean;
  progress: number;
  tone: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <View style={[styles.progressTrack, compact && styles.progressTrackCompact]}>
      <View
        style={[
          styles.progressFill,
          tone === 'secondary' && styles.progressSecondary,
          tone === 'danger' && styles.progressDanger,
          { width: `${Math.max(2, progress * 100)}%` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  page: {
    gap: 18,
    paddingTop: 18,
    paddingBottom: 32,
  },
  hero: {
    alignItems: 'flex-start',
    alignSelf: 'center',
    flexDirection: 'column',
    gap: 18,
    paddingTop: 6,
    width: '90%',
  },
  kicker: {
    color: '#607080',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#17212B',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 36,
  },
  mathTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    maxWidth: 190,
  },
  mathTile: {
    alignItems: 'center',
    backgroundColor: '#17212B',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  mathTileText: {
    color: '#F5B841',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E0E8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    alignSelf: 'center',
    padding: 16,
    width: '90%',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sectionTitle: {
    color: '#17212B',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0,
  },
  label: {
    color: '#17212B',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  mutedText: {
    color: '#607080',
    fontSize: 13,
    letterSpacing: 0,
    marginTop: 3,
  },
  segmented: {
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 4,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentActive: {
    backgroundColor: '#0E7C7B',
  },
  segmentText: {
    color: '#4A5564',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modeButton: {
    alignItems: 'center',
    borderColor: '#CBD5E1',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 0,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 10,
  },
  modeButtonActive: {
    backgroundColor: '#17212B',
    borderColor: '#17212B',
  },
  modeButtonText: {
    color: '#17212B',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
    textAlign: 'center',
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  settingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  stepperValue: {
    color: '#17212B',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
    minWidth: 34,
    textAlign: 'center',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#E8EEF4',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  iconButtonDisabled: {
    opacity: 0.45,
  },
  configSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statPill: {
    backgroundColor: '#F5F7FA',
    borderColor: '#D8E0E8',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 132,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statDanger: {
    backgroundColor: '#FFF1EC',
    borderColor: '#FFD0BF',
  },
  statWarning: {
    backgroundColor: '#FFF8E8',
    borderColor: '#FFE2A7',
  },
  statLabel: {
    color: '#607080',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 4,
  },
  statValue: {
    color: '#17212B',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  statValueSuccess: {
    color: '#0E7C7B',
  },
  statValueDanger: {
    color: '#C94323',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0E7C7B',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
  },
  primaryButtonSmall: {
    alignItems: 'center',
    backgroundColor: '#0E7C7B',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#E8F6F3',
    borderColor: '#98D8CF',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#0E7C7B',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  gameTopBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  progressTrack: {
    backgroundColor: '#E8EEF4',
    borderRadius: 8,
    height: 12,
    overflow: 'hidden',
  },
  progressTrackCompact: {
    flex: 1,
    height: 8,
  },
  progressFill: {
    backgroundColor: '#0E7C7B',
    borderRadius: 8,
    height: '100%',
  },
  progressSecondary: {
    backgroundColor: '#F5B841',
  },
  progressDanger: {
    backgroundColor: '#E4572E',
  },
  totalTimer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  totalTimerText: {
    color: '#607080',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    minWidth: 82,
  },
  operationPanel: {
    alignItems: 'center',
    backgroundColor: '#17212B',
    borderRadius: 8,
    gap: 8,
    minHeight: 168,
    justifyContent: 'center',
    padding: 20,
  },
  operationLabel: {
    color: '#98D8CF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  operationText: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 50,
    textAlign: 'center',
  },
  operationMeta: {
    color: '#D8E0E8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  answerGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  answerButton: {
    alignItems: 'center',
    backgroundColor: '#0E7C7B',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 54,
  },
  answerButtonDanger: {
    backgroundColor: '#E4572E',
  },
  answerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  choiceButton: {
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderColor: '#B8C5D3',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 62,
  },
  choiceText: {
    color: '#17212B',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  answerInput: {
    backgroundColor: '#F8FAFC',
    borderColor: '#B8C5D3',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17212B',
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#0E7C7B',
    borderRadius: 8,
    justifyContent: 'center',
    width: 56,
  },
  errorText: {
    color: '#C94323',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  feedback: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  feedbackCorrect: {
    backgroundColor: '#0E7C7B',
  },
  feedbackIncorrect: {
    backgroundColor: '#E4572E',
  },
  feedbackTimeout: {
    backgroundColor: '#945E00',
  },
  feedbackText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  miniHistory: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 16,
  },
  historyDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  historyDotCorrect: {
    backgroundColor: '#0E7C7B',
  },
  historyDotMiss: {
    backgroundColor: '#E4572E',
  },
  resultScore: {
    alignItems: 'center',
    backgroundColor: '#17212B',
    borderRadius: 8,
    padding: 18,
  },
  resultScoreLabel: {
    color: '#98D8CF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  resultScoreValue: {
    color: '#FFFFFF',
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 0,
  },
  chartBlock: {
    gap: 12,
  },
  chartTitle: {
    color: '#17212B',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  scoreBars: {
    alignItems: 'flex-end',
    backgroundColor: '#F5F7FA',
    borderColor: '#D8E0E8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 102,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  scoreBarSlot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    minWidth: 8,
  },
  scoreBar: {
    borderRadius: 4,
    width: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
});

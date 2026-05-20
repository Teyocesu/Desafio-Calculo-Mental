import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DIFFICULTY_META, MODE_META } from '@/src/game/engine';
import { clearSessions, loadSessions } from '@/src/game/storage';
import { StoredSession } from '@/src/game/types';

const formatTime = (ms: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : '0s');

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [pendingClear, setPendingClear] = useState(false);

  const refresh = useCallback(() => {
    loadSessions().then((storedSessions) => {
      setSessions(storedSessions);
      if (storedSessions.length === 0) setPendingClear(false);
    });
  }, []);

  useFocusEffect(refresh);

  const stats = useMemo(() => {
    const best = sessions.reduce<StoredSession | null>(
      (currentBest, session) =>
        !currentBest || session.result.score > currentBest.result.score ? session : currentBest,
      null,
    );
    const totalQuestions = sessions.reduce((total, session) => total + session.result.totalQuestions, 0);
    const totalCorrect = sessions.reduce((total, session) => total + session.result.correct, 0);
    const totalAnsweredTime = sessions.reduce(
      (total, session) =>
        total +
        session.result.averageResponseTimeMs *
          (session.result.correct + session.result.incorrect),
      0,
    );
    const totalAnswered = sessions.reduce(
      (total, session) => total + session.result.correct + session.result.incorrect,
      0,
    );
    const averageAccuracy = totalQuestions
      ? Math.round((totalCorrect / totalQuestions) * 100)
      : 0;
    const averageTime = totalAnswered
      ? Math.round(totalAnsweredTime / totalAnswered)
      : 0;
    const longestStreak = sessions.reduce(
      (bestStreak, session) => Math.max(bestStreak, getLongestStreak(session.records)),
      0,
    );
    const modeRows = buildCountRows(
      sessions.map((session) => session.config.mode),
      (mode) => MODE_META[mode].label,
    );
    const difficultyRows = buildCountRows(
      sessions.map((session) => session.config.difficulty),
      (difficulty) => DIFFICULTY_META[difficulty].label,
    );

    return {
      averageAccuracy,
      averageTime,
      best,
      difficultyRows,
      longestStreak,
      modeRows,
      totalQuestions,
    };
  }, [sessions]);

  const clearHistory = () => {
    clearSessions().then(() => {
      setSessions([]);
      setPendingClear(false);
    });
  };

  const topScores = useMemo(
    () => [...sessions].sort((a, b) => b.result.score - a.result.score).slice(0, 5),
    [sessions],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          <View>
            <Text style={styles.kicker}>Persistencia local</Text>
            <Text style={styles.title}>Historial y estadísticas</Text>
          </View>
          <View style={styles.heroIcon}>
            <MaterialIcons name="leaderboard" size={34} color="#F5B841" />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="analytics" size={22} color="#E4572E" />
            <Text style={styles.sectionTitle}>Resumen</Text>
          </View>
          <View style={styles.summaryGrid}>
            <StatBlock label="Rondas" value={String(sessions.length)} />
            <StatBlock label="Preguntas" value={String(stats.totalQuestions)} />
            <StatBlock label="Precisión prom." value={`${stats.averageAccuracy}%`} />
            <StatBlock label="Tiempo prom." value={formatTime(stats.averageTime)} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="bar-chart" size={22} color="#E4572E" />
            <Text style={styles.sectionTitle}>Visualización</Text>
          </View>
          {sessions.length === 0 ? (
            <EmptyState />
          ) : (
            <View style={styles.visualGrid}>
              <TrendChart title="Puntaje por ronda" sessions={sessions.slice(0, 8)} metric="score" />
              <TrendChart title="Precisión por ronda" sessions={sessions.slice(0, 8)} metric="accuracy" />
              <TrendChart title="Tiempo promedio" sessions={sessions.slice(0, 8)} metric="time" />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="insights" size={22} color="#E4572E" />
            <Text style={styles.sectionTitle}>Estadísticas avanzadas</Text>
          </View>
          {sessions.length === 0 ? (
            <EmptyState compact />
          ) : (
            <>
              <View style={styles.summaryGrid}>
                <StatBlock label="Mejor puntaje" value={String(stats.best?.result.score ?? 0)} />
                <StatBlock label="Modo más jugado" value={stats.modeRows[0]?.label ?? '-'} />
                <StatBlock label="Dificultad frecuente" value={stats.difficultyRows[0]?.label ?? '-'} />
                <StatBlock label="Racha correcta" value={String(stats.longestStreak)} />
              </View>
              <DistributionChart title="Partidas por modo" rows={stats.modeRows} />
              <DistributionChart title="Partidas por dificultad" rows={stats.difficultyRows} />
            </>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="military-tech" size={22} color="#E4572E" />
            <Text style={styles.sectionTitle}>Mejores puntajes</Text>
          </View>
          {topScores.length === 0 ? (
            <EmptyState compact />
          ) : (
            topScores.map((session, index) => (
              <View key={session.id} style={styles.scoreRow}>
                <Text style={styles.rank}>{index + 1}</Text>
                <View style={styles.scoreInfo}>
                  <Text style={styles.scoreTitle}>
                    {MODE_META[session.config.mode].label} · {DIFFICULTY_META[session.config.difficulty].label}
                  </Text>
                  <Text style={styles.scoreMeta}>{formatDate(session.dateIso)}</Text>
                </View>
                <Text style={styles.scoreValue}>{session.result.score}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="history" size={22} color="#E4572E" />
            <Text style={styles.sectionTitle}>Rondas guardadas</Text>
          </View>
          {sessions.length === 0 ? (
            <EmptyState compact />
          ) : (
            sessions.map((session) => <SessionCard key={session.id} session={session} />)
          )}
        </View>

        {sessions.length > 0 && !pendingClear && (
          <Pressable style={styles.clearButton} onPress={() => setPendingClear(true)}>
            <MaterialIcons name="delete-outline" size={20} color="#C94323" />
            <Text style={styles.clearButtonText}>Borrar historial</Text>
          </Pressable>
        )}

        {sessions.length > 0 && pendingClear && (
          <View style={styles.confirmClearBox}>
            <Text style={styles.confirmClearTitle}>¿Borrar historial?</Text>
            <Text style={styles.confirmClearText}>Se eliminarán las rondas guardadas en este dispositivo.</Text>
            <View style={styles.confirmClearActions}>
              <Pressable style={styles.cancelButton} onPress={() => setPendingClear(false)}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.confirmDeleteButton} onPress={clearHistory}>
                <MaterialIcons name="delete-outline" size={19} color="#FFFFFF" />
                <Text style={styles.confirmDeleteText}>Borrar</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DistributionChart({ rows, title }: { rows: { label: string; value: number }[]; title: string }) {
  const total = Math.max(rows.reduce((sum, row) => sum + row.value, 0), 1);
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <View style={styles.distributionBlock}>
      <Text style={styles.chartTitle}>{title}</Text>
      <View style={styles.distributionBars}>
        {rows.map((row) => {
          const height = `${Math.max(12, (row.value / max) * 100)}%` as const;

          return (
            <View key={row.label} style={styles.distributionBarItem}>
              <View style={styles.distributionBarFrame}>
                <View style={[styles.distributionBarFill, { height }]} />
              </View>
              <Text style={styles.distributionValue}>{row.value}</Text>
              <Text style={styles.distributionPercent}>{Math.round((row.value / total) * 100)}%</Text>
              <Text style={styles.distributionLabel} numberOfLines={2}>
                {row.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TrendChart({
  metric,
  sessions,
  title,
}: {
  metric: 'score' | 'accuracy' | 'time';
  sessions: StoredSession[];
  title: string;
}) {
  const chronological = [...sessions].reverse();
  const rows = chronological.map((session, index) => {
    const value =
      metric === 'score'
        ? Math.max(0, session.result.score)
        : metric === 'accuracy'
          ? session.result.accuracy
          : session.result.averageResponseTimeMs / 1000;
    return {
      label: `Ronda ${index + 1}`,
      value,
      display:
        metric === 'accuracy'
          ? `${Math.round(value)}%`
          : metric === 'time'
            ? `${value.toFixed(1)}s`
            : `${Math.round(value)} pts`,
    };
  });
  const average = rows.reduce((sum, row) => sum + row.value, 0) / Math.max(1, rows.length);
  const best = rows.reduce(
    (currentBest, row) =>
      metric === 'time'
        ? row.value < currentBest.value
          ? row
          : currentBest
        : row.value > currentBest.value
          ? row
          : currentBest,
    rows[0],
  );
  const last = rows[rows.length - 1];
  const formatMetric = (value: number) =>
    metric === 'accuracy' ? `${Math.round(value)}%` : metric === 'time' ? `${value.toFixed(1)}s` : `${Math.round(value)} pts`;
  const dotStyle =
    metric === 'accuracy' ? styles.trendDotAccuracy : metric === 'time' ? styles.trendDotTime : styles.trendDotScore;

  return (
    <View style={styles.chartBlock}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        <Text style={styles.chartHint}>{metric === 'accuracy' ? '%' : metric === 'time' ? 's' : 'pts'}</Text>
      </View>
      <View style={styles.trendCard}>
        <View style={styles.trendDots}>
          {rows.map((row) => (
            <View key={`${metric}-${row.label}`} style={[styles.trendDot, dotStyle]} />
          ))}
        </View>
        <View style={styles.trendStatsRow}>
          <View style={styles.trendStat}>
            <Text style={styles.trendStatLabel}>Última</Text>
            <Text style={styles.trendStatValue}>{last?.display ?? '-'}</Text>
          </View>
          <View style={styles.trendStat}>
            <Text style={styles.trendStatLabel}>{metric === 'time' ? 'Menor' : 'Mejor'}</Text>
            <Text style={styles.trendStatValue}>{best ? best.display : '-'}</Text>
          </View>
          <View style={styles.trendStat}>
            <Text style={styles.trendStatLabel}>Promedio</Text>
            <Text style={styles.trendStatValue}>{formatMetric(average)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function SessionCard({ session }: { session: StoredSession }) {
  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionTop}>
        <View>
          <Text style={styles.sessionTitle}>{MODE_META[session.config.mode].label}</Text>
          <Text style={styles.scoreMeta}>
            {DIFFICULTY_META[session.config.difficulty].label} · {formatDate(session.dateIso)}
          </Text>
        </View>
        <Text style={styles.sessionScore}>{session.result.score}</Text>
      </View>
      <View style={styles.sessionStats}>
        <MiniStat label="Precisión" value={`${session.result.accuracy}%`} />
        <MiniStat label="Correctas" value={String(session.result.correct)} />
        <MiniStat label="Timeout" value={String(session.result.timedOut)} />
        <MiniStat label="Promedio" value={formatTime(session.result.averageResponseTimeMs)} />
      </View>
    </View>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

function EmptyState({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.emptyState, compact && styles.emptyStateCompact]}>
      <MaterialIcons name="inbox" size={24} color="#607080" />
      <Text style={styles.emptyText}>Sin rondas guardadas</Text>
    </View>
  );
}

function formatDate(dateIso: string) {
  return new Date(dateIso).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function buildCountRows<T extends string>(items: T[], getLabel: (item: T) => string) {
  const counts = items.reduce<Record<T, number>>((accumulator, item) => {
    accumulator[item] = (accumulator[item] ?? 0) + 1;
    return accumulator;
  }, {} as Record<T, number>);

  return Object.entries(counts)
    .map(([key, value]) => ({ label: getLabel(key as T), value: Number(value) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function getLongestStreak(records: StoredSession['records']) {
  let current = 0;
  let best = 0;

  for (const record of records) {
    if (record.correct) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
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
  heroIcon: {
    alignItems: 'center',
    backgroundColor: '#17212B',
    borderRadius: 8,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E0E8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBlock: {
    backgroundColor: '#F5F7FA',
    borderColor: '#D8E0E8',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    padding: 12,
  },
  statLabel: {
    color: '#607080',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 5,
  },
  statValue: {
    color: '#17212B',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  visualGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chartBlock: {
    flexBasis: '31%',
    flexGrow: 1,
    gap: 8,
    minWidth: 150,
  },
  chartHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartTitle: {
    color: '#17212B',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  chartHint: {
    color: '#607080',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  trendCard: {
    backgroundColor: '#F5F7FA',
    borderColor: '#D8E0E8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  trendDots: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    minHeight: 16,
  },
  trendDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  trendDotScore: {
    backgroundColor: '#0E7C7B',
  },
  trendDotAccuracy: {
    backgroundColor: '#F5B841',
  },
  trendDotTime: {
    backgroundColor: '#E4572E',
  },
  trendStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  trendStat: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E8EF',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 68,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  trendStatLabel: {
    color: '#607080',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  trendStatValue: {
    color: '#17212B',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 3,
  },
  distributionBlock: {
    gap: 10,
  },
  distributionBars: {
    alignItems: 'flex-end',
    backgroundColor: '#F5F7FA',
    borderColor: '#D8E0E8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-around',
    minHeight: 160,
    padding: 12,
  },
  distributionBarItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'flex-end',
    minWidth: 72,
  },
  distributionBarFrame: {
    alignItems: 'center',
    height: 74,
    justifyContent: 'flex-end',
    width: '100%',
  },
  distributionBarFill: {
    backgroundColor: '#0E7C7B',
    borderRadius: 8,
    maxWidth: 34,
    minHeight: 10,
    width: '58%',
  },
  distributionLabel: {
    color: '#17212B',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    minHeight: 28,
    textAlign: 'center',
  },
  distributionValue: {
    color: '#0E7C7B',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  distributionPercent: {
    color: '#607080',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textAlign: 'center',
  },
  scoreRow: {
    alignItems: 'center',
    borderColor: '#E1E8EF',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  rank: {
    backgroundColor: '#17212B',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  scoreInfo: {
    flex: 1,
    gap: 3,
  },
  scoreTitle: {
    color: '#17212B',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  scoreMeta: {
    color: '#607080',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  scoreValue: {
    color: '#0E7C7B',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sessionCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#D8E0E8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  sessionTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sessionTitle: {
    color: '#17212B',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sessionScore: {
    color: '#0E7C7B',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sessionStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miniStat: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E8EF',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 88,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  miniLabel: {
    color: '#607080',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  miniValue: {
    color: '#17212B',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 3,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderColor: '#D8E0E8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    minHeight: 118,
    justifyContent: 'center',
    padding: 18,
  },
  emptyStateCompact: {
    minHeight: 72,
  },
  emptyText: {
    color: '#607080',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  clearButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFF1EC',
    borderColor: '#FFD0BF',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 16,
  },
  clearButtonText: {
    color: '#C94323',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  confirmClearBox: {
    alignSelf: 'center',
    backgroundColor: '#FFF1EC',
    borderColor: '#FFD0BF',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
    width: '90%',
  },
  confirmClearTitle: {
    color: '#8F2D12',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  confirmClearText: {
    color: '#7B4A3A',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  confirmClearActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#FFD0BF',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButtonText: {
    color: '#8F2D12',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  confirmDeleteButton: {
    alignItems: 'center',
    backgroundColor: '#C94323',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmDeleteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
});

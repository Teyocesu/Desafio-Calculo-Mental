import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DIFFICULTY_META, MODE_META } from '@/src/game/engine';
import { clearSessions, loadSessions } from '@/src/game/storage';
import { StoredSession } from '@/src/game/types';

const formatTime = (ms: number) => (ms ? `${(ms / 1000).toFixed(1)}s` : '0s');

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);

  const refresh = useCallback(() => {
    loadSessions().then(setSessions);
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

    return {
      averageAccuracy,
      averageTime,
      best,
      totalQuestions,
    };
  }, [sessions]);

  const confirmClear = () => {
    Alert.alert('Borrar historial', 'Se eliminarán las rondas guardadas en este dispositivo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          clearSessions().then(() => setSessions([]));
        },
      },
    ]);
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
            <>
              <TrendChart title="Puntaje por ronda" sessions={sessions.slice(0, 8)} metric="score" />
              <TrendChart title="Precisión por ronda" sessions={sessions.slice(0, 8)} metric="accuracy" />
              <TrendChart title="Tiempo promedio" sessions={sessions.slice(0, 8)} metric="time" />
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

        {sessions.length > 0 && (
          <Pressable style={styles.clearButton} onPress={confirmClear}>
            <MaterialIcons name="delete-outline" size={20} color="#C94323" />
            <Text style={styles.clearButtonText}>Borrar historial</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
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
  const values = chronological.map((session) => {
    if (metric === 'score') return Math.max(0, session.result.score);
    if (metric === 'accuracy') return session.result.accuracy;
    return session.result.averageResponseTimeMs / 1000;
  });
  const max = Math.max(...values, metric === 'accuracy' ? 100 : 1);

  return (
    <View style={styles.chartBlock}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        <Text style={styles.chartHint}>{metric === 'accuracy' ? '%' : metric === 'time' ? 's' : 'pts'}</Text>
      </View>
      <View style={styles.chartBars}>
        {values.map((value, index) => (
          <View key={`${metric}-${index}`} style={styles.barSlot}>
            <View
              style={[
                styles.barFill,
                metric === 'accuracy' && styles.barFillAccuracy,
                metric === 'time' && styles.barFillTime,
                { height: `${Math.max(8, (value / max) * 100)}%` },
              ]}
            />
          </View>
        ))}
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
  chartBlock: {
    gap: 8,
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
  chartBars: {
    alignItems: 'flex-end',
    backgroundColor: '#F5F7FA',
    borderColor: '#D8E0E8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    height: 104,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  barSlot: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barFill: {
    backgroundColor: '#0E7C7B',
    borderRadius: 5,
    width: '100%',
  },
  barFillAccuracy: {
    backgroundColor: '#F5B841',
  },
  barFillTime: {
    backgroundColor: '#E4572E',
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
});

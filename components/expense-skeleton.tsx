import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from 'react-native-paper';

export function ExpenseSkeleton() {
  const theme = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const skeletonColor = theme.dark ? '#333' : '#E0E0E0';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <Animated.View style={[styles.indicator, { backgroundColor: skeletonColor, opacity }]} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Animated.View style={[styles.category, { backgroundColor: skeletonColor, opacity }]} />
          <Animated.View style={[styles.amount, { backgroundColor: skeletonColor, opacity }]} />
        </View>
        <Animated.View style={[styles.date, { backgroundColor: skeletonColor, opacity }]} />
      </View>
    </View>
  );
}

export function ExpenseListSkeleton({ count = 5 }: { count?: number }) {
  const theme = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const skeletonColor = theme.dark ? '#333' : '#E0E0E0';

  return (
    <View style={styles.listContainer}>
      {/* Section header skeleton */}
      <View style={styles.sectionHeader}>
        <Animated.View style={[styles.sectionTitle, { backgroundColor: skeletonColor, opacity }]} />
      </View>
      
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={[styles.container, { backgroundColor: theme.colors.surface }]}>
          <Animated.View style={[styles.indicator, { backgroundColor: skeletonColor, opacity }]} />
          <View style={styles.content}>
            <View style={styles.topRow}>
              <Animated.View 
                style={[
                  styles.category, 
                  { backgroundColor: skeletonColor, opacity, width: 80 + (index % 3) * 20 }
                ]} 
              />
              <Animated.View 
                style={[
                  styles.amount, 
                  { backgroundColor: skeletonColor, opacity, width: 60 + (index % 2) * 15 }
                ]} 
              />
            </View>
            <Animated.View 
              style={[
                styles.date, 
                { backgroundColor: skeletonColor, opacity, width: 100 + (index % 4) * 10 }
              ]} 
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    paddingTop: 8,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    height: 16,
    width: 100,
    borderRadius: 4,
  },
  container: {
    flexDirection: 'row',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  indicator: {
    width: 4,
    height: '100%',
  },
  content: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  category: {
    height: 18,
    width: 100,
    borderRadius: 4,
  },
  amount: {
    height: 18,
    width: 70,
    borderRadius: 4,
  },
  date: {
    height: 14,
    width: 120,
    borderRadius: 4,
  },
});

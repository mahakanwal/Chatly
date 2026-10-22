import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import RoundButton from './RoundButton';

export default function ScreenHeader({ title, onBack, right }) {
  return (
    <View style={styles.header}>
      {onBack ? <RoundButton icon="arrow-back" onPress={onBack} size={42} accessibilityLabel="Back" /> : null}
      <Text style={[styles.title, !onBack && { marginLeft: 0 }]} numberOfLines={1}>
        {title}
      </Text>
      {right || null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginLeft: 14,
  },
});

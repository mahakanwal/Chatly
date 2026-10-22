import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';

/** Rounded text field used by the login / signup screens. `secure` adds a show/hide eye. */
export default function AuthInput({ icon, secure = false, right, style, inputRef, ...rest }) {
  const [hidden, setHidden] = useState(secure);
  return (
    <View style={[styles.field, raised, style]}>
      {icon ? <Ionicons name={icon} size={19} color={colors.textMuted} /> : null}
      <TextInput
        ref={inputRef}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        {...rest}
        secureTextEntry={hidden}
        style={styles.input}
      />
      {secure ? (
        <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
          <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
        </Pressable>
      ) : (
        right || null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.input,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  input: { flex: 1, color: colors.text, fontSize: 16, marginLeft: 10, paddingVertical: 0 },
});
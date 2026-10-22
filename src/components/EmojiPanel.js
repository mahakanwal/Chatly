import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

const EMOJIS = (
  '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥳 ' +
  '😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 ' +
  '🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 💩 👻 ' +
  '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🙏 🤝 💪 ' +
  '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ ⭐ 🌟 🔥 💯 ✅ ❌ ⚡ 🎉 🎊 🎂 🎁 ' +
  '☕ 🍵 🍕 🍔 🍟 🌭 🍿 🥤 🍩 🍪 🍫 🍰 🍎 🍌 🍉 🍇 🍓 🥭 ⚽ 🏏 🏆 🎮 🎧 📱 💻 📷 🚗 ✈️ 🏠 🌙 ☀️ 🌧️ 🌈'
).split(' ');

export default function EmojiPanel({ onSelect, height = 260 }) {
  return (
    <View style={[styles.wrap, { height }]}>
      <ScrollView contentContainerStyle={styles.grid} keyboardShouldPersistTaps="always">
        {EMOJIS.map((e, i) => (
          <Pressable
            key={`${e}-${i}`}
            onPress={() => onSelect(e)}
            style={({ pressed }) => [styles.cell, pressed && { backgroundColor: colors.raisedHigh }]}
            accessibilityLabel={`Insert ${e}`}
          >
            <Text style={styles.emoji}>{e}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  cell: {
    width: '12.5%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  emoji: {
    fontSize: 26,
  },
});

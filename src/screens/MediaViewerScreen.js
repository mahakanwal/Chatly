import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import RoundButton from '../components/RoundButton';

function VideoPlayer({ url }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls allowsFullscreen />;
}

export default function MediaViewerScreen({ route, navigation }) {
  const { type, url } = route.params;
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {type === 'video' ? (
        <VideoPlayer url={url} />
      ) : (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" />
      )}
      <SafeAreaView style={styles.top} pointerEvents="box-none">
        <RoundButton icon="close" onPress={() => navigation.goBack()} size={42} iconColor="#FFFFFF" accessibilityLabel="Close" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 16 },
});

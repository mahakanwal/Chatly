import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

function guessMime(asset) {
  if (asset.mimeType) return asset.mimeType;
  const ext = (asset.fileName || asset.uri || '').split('.').pop().toLowerCase();
  if (asset.type === 'video') return ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

/** Normalizes an image-picker asset to the shape the chat uses. */
export function assetToFile(asset) {
  const isVideo = asset.type === 'video' || (asset.mimeType || '').startsWith('video/');
  const type = guessMime({ ...asset, type: isVideo ? 'video' : 'image' });
  const ext = type.split('/')[1] === 'quicktime' ? 'mov' : type.split('/')[1] || 'jpg';
  return {
    uri: asset.uri,
    name: asset.fileName || `${isVideo ? 'video' : 'photo'}_${Date.now()}.${ext}`,
    type,
    kind: isVideo ? 'video' : 'image',
    size: asset.fileSize,
    width: asset.width,
    height: asset.height,
    // image-picker returns milliseconds
    duration: asset.duration ? Math.round(asset.duration / 1000) : undefined,
  };
}

export async function pickFromLibrary({ allowVideo = true, square = false } = {}) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Photos access needed', 'Allow photo library access in Settings to share photos.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: allowVideo ? ['images', 'videos'] : ['images'],
    quality: 0.8,
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    videoMaxDuration: 300,
  });
  if (result.canceled || !result.assets?.length) return null;
  return assetToFile(result.assets[0]);
}

export async function captureFromCamera({ allowVideo = true, square = false } = {}) {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Camera access needed', 'Allow camera access in Settings to take photos.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: allowVideo ? ['images', 'videos'] : ['images'],
    quality: 0.8,
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    videoMaxDuration: 120,
  });
  if (result.canceled || !result.assets?.length) return null;
  return assetToFile(result.assets[0]);
}

export async function pickDocument() {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  const type = a.mimeType || 'application/octet-stream';
  let kind = 'document';
  if (type.startsWith('image/')) kind = 'image';
  else if (type.startsWith('video/')) kind = 'video';
  return { uri: a.uri, name: a.name, type, kind, size: a.size };
}

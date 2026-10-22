import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { DarkTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { colors } from './src/theme';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SocketProvider } from './src/context/SocketContext';
import { CallProvider, useCall } from './src/context/CallContext';
import CallScreen from './src/screens/CallScreen';
import PrimaryButton from './src/components/PrimaryButton';
import TabBar from './src/components/TabBar';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import VerifyEmailScreen from './src/screens/VerifyEmailScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import CallsScreen from './src/screens/CallsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ChatScreen from './src/screens/ChatScreen';
import NewChatScreen from './src/screens/NewChatScreen';
import ContactInfoScreen from './src/screens/ContactInfoScreen';
import MediaViewerScreen from './src/screens/MediaViewerScreen';
import SendToScreen from './src/screens/SendToScreen';
import BlockedContactsScreen from './src/screens/BlockedContactsScreen';
import WallpaperScreen from './src/screens/WallpaperScreen';
import MomentsScreen from './src/screens/MomentsScreen';
import MomentComposerScreen from './src/screens/MomentComposerScreen';
import MomentViewerScreen from './src/screens/MomentViewerScreen';
import NewGroupScreen from './src/screens/NewGroupScreen';
import GroupInfoScreen from './src/screens/GroupInfoScreen';
import HubScreen from './src/screens/HubScreen';
import ChannelDetailScreen from './src/screens/ChannelDetailScreen';
import CommunityDetailScreen from './src/screens/CommunityDetailScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.divider,
    primary: colors.accent,
  },
};

function MainTabs() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="Chats" component={ChatsScreen} />
      <Tabs.Screen name="Moments" component={MomentsScreen} />
      <Tabs.Screen name="Calls" component={CallsScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

function OfflineScreen() {
  const { retry } = useAuth();
  return (
    <View style={styles.center}>
      <Text style={styles.offlineTitle}>Can't reach the server</Text>
      <Text style={styles.offlineText}>Check your internet connection and try again.</Text>
      <PrimaryButton title="Try again" onPress={retry} style={{ marginTop: 24, minWidth: 180 }} />
    </View>
  );
}

/** Opens the right chat when a push notification is tapped. */
function useNotificationNavigation(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const open = (response, attempt = 0) => {
      const conversationId = response?.notification?.request?.content?.data?.conversationId;
      if (!conversationId) return;
      if (navigationRef.isReady()) navigationRef.navigate('Chat', { conversationId });
      else if (attempt < 10) setTimeout(() => open(response, attempt + 1), 300);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [enabled]);
}

/** Full-screen call UI rendered above everything while a call is active. */
function CallOverlay() {
  const { call } = useCall();
  return call ? <CallScreen /> : null;
}

function RootNavigator() {
  const { status } = useAuth();
  useNotificationNavigation(status === 'signedIn');

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (status === 'offline') return <OfflineScreen />;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      {status === 'signedOut' ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </>
      ) : status === 'needsProfile' ? (
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Chat" component={ChatScreen} getId={({ params }) => (params?.ai ? 'ai' : params?.conversationId)} />
          <Stack.Screen name="NewChat" component={NewChatScreen} />
          <Stack.Screen name="ContactInfo" component={ContactInfoScreen} />
          <Stack.Screen name="SendTo" component={SendToScreen} />
          <Stack.Screen name="BlockedContacts" component={BlockedContactsScreen} />
          <Stack.Screen name="Wallpaper" component={WallpaperScreen} />
          <Stack.Screen name="NewGroup" component={NewGroupScreen} />
          <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
          <Stack.Screen name="Hub" component={HubScreen} />
          <Stack.Screen name="ChannelDetail" component={ChannelDetailScreen} />
          <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
          <Stack.Screen name="MomentComposer" component={MomentComposerScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="MomentViewer" component={MomentViewerScreen} options={{ animation: 'fade', presentation: 'fullScreenModal' }} />
          <Stack.Screen name="MediaViewer" component={MediaViewerScreen} options={{ animation: 'fade', presentation: 'fullScreenModal' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SocketProvider>
          <CallProvider>
            <NavigationContainer ref={navigationRef} theme={navTheme}>
              <StatusBar style="light" />
              <RootNavigator />
            </NavigationContainer>
            <CallOverlay />
          </CallProvider>
        </SocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  offlineTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  offlineText: { color: colors.textMuted, fontSize: 15, marginTop: 8, textAlign: 'center' },
});
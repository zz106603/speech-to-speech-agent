import { useState } from 'react';
import {
  Button,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { maskToken, requestRealtimeToken } from './src/api/realtimeTokenApi';

type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [tokenPreview, setTokenPreview] = useState<string | null>(null);

  const handleRequestToken = async () => {
    setStatus('loading');
    setTokenPreview(null);

    try {
      const token = await requestRealtimeToken();
      setTokenPreview(maskToken(token));
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: safeAreaInsets.top + 24,
          paddingBottom: safeAreaInsets.bottom + 24,
        },
      ]}>
      <Text style={styles.title}>Speech to Speech Agent</Text>
      <Text style={styles.label}>Realtime token request status</Text>
      <Text style={styles.status}>{status}</Text>
      {tokenPreview ? (
        <Text style={styles.preview}>Token: {tokenPreview}</Text>
      ) : null}
      <View style={styles.button}>
        <Button
          title={status === 'loading' ? 'Requesting...' : 'Request token'}
          onPress={handleRequestToken}
          disabled={status === 'loading'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#ffffff',
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
  },
  label: {
    color: '#4b5563',
    fontSize: 16,
    marginBottom: 8,
  },
  status: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  preview: {
    color: '#374151',
    fontSize: 14,
    marginBottom: 20,
  },
  button: {
    alignSelf: 'flex-start',
  },
});

export default App;

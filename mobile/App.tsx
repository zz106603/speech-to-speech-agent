import { useEffect, useRef, useState } from 'react';
import {
  Button,
  PermissionsAndroid,
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
import {
  connectToOpenAIRealtime,
  type RealtimeConnection,
} from './src/realtime/realtimeConnection';

type RequestStatus = 'idle' | 'loading' | 'success' | 'error';
type ConnectionStatus =
  | 'idle'
  | 'requesting-permission'
  | 'requesting-token'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

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
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [tokenPreview, setTokenPreview] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('idle');
  const [peerConnectionState, setPeerConnectionState] = useState('new');
  const [dataChannelState, setDataChannelState] = useState('closed');
  const [hasRemoteAudio, setHasRemoteAudio] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      connectionRef.current?.close();
      connectionRef.current = null;
    };
  }, []);

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

  const cleanupConnection = () => {
    connectionRef.current?.close();
    connectionRef.current = null;
    setPeerConnectionState('closed');
    setDataChannelState('closed');
    setHasRemoteAudio(false);
  };

  const handleStartConnection = async () => {
    setConnectionStatus('requesting-permission');
    setErrorMessage(null);
    setHasRemoteAudio(false);

    try {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        setConnectionStatus('error');
        setErrorMessage('Microphone permission was denied.');
        return;
      }

      setConnectionStatus('requesting-token');
      setStatus('loading');
      const token = await requestRealtimeToken();
      setTokenPreview(maskToken(token));
      setStatus('success');

      setConnectionStatus('connecting');
      const connection = await connectToOpenAIRealtime(token, {
        onConnectionStateChange: state => {
          setPeerConnectionState(state);
          if (state === 'connected') {
            setConnectionStatus('connected');
          }
          if (
            state === 'closed' ||
            state === 'failed' ||
            state === 'disconnected'
          ) {
            setConnectionStatus('disconnected');
            cleanupConnection();
          }
        },
        onDataChannelStateChange: state => {
          setDataChannelState(state);
        },
        onRemoteStream: stream => {
          setHasRemoteAudio(stream.getAudioTracks().length > 0);
        },
      });

      connectionRef.current = connection;
      setDataChannelState(connection.dataChannel.readyState);
      setPeerConnectionState(connection.peerConnection.connectionState);
    } catch {
      cleanupConnection();
      setStatus(current => (current === 'loading' ? 'error' : current));
      setConnectionStatus('error');
      setErrorMessage('Failed to connect to OpenAI Realtime.');
    }
  };

  const handleStopConnection = () => {
    cleanupConnection();
    setConnectionStatus('disconnected');
  };

  const isConnecting =
    connectionStatus === 'requesting-permission' ||
    connectionStatus === 'requesting-token' ||
    connectionStatus === 'connecting';
  const isConnected = connectionStatus === 'connected';

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
      <View style={styles.section}>
        <Text style={styles.label}>Realtime connection status</Text>
        <Text style={styles.status}>{connectionStatus}</Text>
        <Text style={styles.detail}>PeerConnection: {peerConnectionState}</Text>
        <Text style={styles.detail}>DataChannel: {dataChannelState}</Text>
        <Text style={styles.detail}>
          Remote audio: {hasRemoteAudio ? 'received' : 'waiting'}
        </Text>
        {errorMessage ? (
          <Text style={styles.error}>{errorMessage}</Text>
        ) : null}
        <View style={styles.buttonRow}>
          <View style={styles.button}>
            <Button
              title={isConnecting ? 'Starting...' : 'Start connection'}
              onPress={handleStartConnection}
              disabled={isConnecting || isConnected}
            />
          </View>
          <View style={styles.button}>
            <Button
              title="Stop connection"
              onPress={handleStopConnection}
              disabled={!isConnecting && !isConnected}
            />
          </View>
        </View>
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
  section: {
    marginTop: 28,
  },
  detail: {
    color: '#374151',
    fontSize: 14,
    marginBottom: 6,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  button: {
    alignSelf: 'flex-start',
  },
});

async function requestMicrophonePermission(): Promise<boolean> {
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export default App;

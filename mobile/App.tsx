import { useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Pressable,
  ScrollView,
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
  sendRealtimeEvent,
  type RealtimeConnection,
  type RealtimeServerEvent,
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

const requestStatusText: Record<RequestStatus, string> = {
  idle: '대기 중',
  loading: '요청 중',
  success: '성공',
  error: '오류',
};

const connectionStatusText: Record<ConnectionStatus, string> = {
  idle: '대기 중',
  'requesting-permission': '마이크 권한 확인 중',
  'requesting-token': '토큰 요청 중',
  connecting: '연결 중',
  connected: '연결됨',
  disconnected: '연결 종료됨',
  error: '오류',
};

function dataChannelStatusText(status: string): string {
  switch (status) {
    case 'connecting':
      return '연결 중';
    case 'open':
      return '열림';
    case 'closing':
      return '닫는 중';
    case 'closed':
      return '닫힘';
    default:
      return status;
  }
}

function peerConnectionStatusText(status: string): string {
  switch (status) {
    case 'new':
      return '준비 중';
    case 'connecting':
      return '연결 중';
    case 'connected':
      return '연결됨';
    case 'disconnected':
      return '연결 끊김';
    case 'failed':
      return '연결 실패';
    case 'closed':
      return '닫힘';
    default:
      return status;
  }
}

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
  const [tasks, setTasks] = useState<string[]>([]);
  const handledToolCallsRef = useRef<Set<string>>(new Set());

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
        setErrorMessage('마이크 권한이 거부되었습니다.');
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
        onDataChannelMessage: (event, dataChannel) => {
          handleRealtimeEvent(event, dataChannel, task => {
            setTasks(currentTasks => [...currentTasks, task]);
          });
        },
      });

      connectionRef.current = connection;
      setDataChannelState(connection.dataChannel.readyState);
      setPeerConnectionState(connection.peerConnection.connectionState);
    } catch {
      cleanupConnection();
      setStatus(current => (current === 'loading' ? 'error' : current));
      setConnectionStatus('error');
      setErrorMessage('루코와 연결하지 못했습니다.');
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
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: safeAreaInsets.top + 24,
          paddingBottom: safeAreaInsets.bottom + 24,
        },
      ]}>
      <View style={styles.container}>
        <Text style={styles.title}>루코</Text>
        <Text style={styles.subtitle}>말로 정리하는 루틴 코치</Text>
        <Text style={styles.guide}>
          대화 시작을 누르고 루코에게 할 일을 말해보세요.
        </Text>

        <View style={styles.statusCard}>
          <Text style={styles.cardTitle}>대화 상태</Text>
          <Text style={[styles.connectionStatus, styles[connectionStatus]]}>
            {connectionStatusText[connectionStatus]}
          </Text>
          <Text style={styles.detail}>
            연결: {peerConnectionStatusText(peerConnectionState)}
          </Text>
          <Text style={styles.detail}>
            데이터 채널: {dataChannelStatusText(dataChannelState)}
          </Text>
          <Text style={styles.detail}>
            음성 응답: {hasRemoteAudio ? '수신 중' : '대기 중'}
          </Text>
          {errorMessage ? (
            <Text style={styles.errorMessage}>{errorMessage}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>토큰 요청 상태</Text>
          <Text style={styles.status}>{requestStatusText[status]}</Text>
          {tokenPreview ? (
            <Text style={styles.preview}>토큰 미리보기: {tokenPreview}</Text>
          ) : null}
          <Pressable
            style={({pressed}) => [
              styles.secondaryButton,
              status === 'loading' && styles.disabledButton,
              pressed && styles.pressedButton,
            ]}
            onPress={handleRequestToken}
            disabled={status === 'loading'}>
            <Text style={styles.secondaryButtonText}>
              {status === 'loading' ? '토큰 요청 중' : '토큰 요청'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            style={({pressed}) => [
              styles.primaryButton,
              (isConnecting || isConnected) && styles.disabledButton,
              pressed && styles.pressedButton,
            ]}
            onPress={handleStartConnection}
            disabled={isConnecting || isConnected}>
            <Text style={styles.primaryButtonText}>
              {isConnecting ? '대화 준비 중' : '대화 시작'}
            </Text>
          </Pressable>
          <Pressable
            style={({pressed}) => [
              styles.stopButton,
              !isConnecting && !isConnected && styles.disabledButton,
              pressed && styles.pressedButton,
            ]}
            onPress={handleStopConnection}
            disabled={!isConnecting && !isConnected}>
            <Text style={styles.stopButtonText}>대화 종료</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>저장된 할 일</Text>
          {tasks.length === 0 ? (
            <Text style={styles.emptyText}>아직 저장된 할 일이 없습니다.</Text>
          ) : (
            <View style={styles.taskList}>
              {tasks.map((task, index) => (
                <View key={`${task}-${index}`} style={styles.taskCard}>
                  <Text style={styles.taskIndex}>{index + 1}</Text>
                  <Text style={styles.taskText}>{task}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );

  function handleRealtimeEvent(
    event: RealtimeServerEvent,
    dataChannel: RealtimeConnection['dataChannel'],
    onTaskSaved: (task: string) => void,
  ) {
    const functionCall = getSaveTaskFunctionCall(event);
    if (!functionCall) {
      return;
    }

    const callId = functionCall.callId;
    if (handledToolCallsRef.current.has(callId)) {
      return;
    }
    handledToolCallsRef.current.add(callId);

    const task = parseSaveTask(functionCall.arguments);
    if (!task) {
      return;
    }

    onTaskSaved(task);
    sendRealtimeEvent(dataChannel, {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify({
          ok: true,
          task,
        }),
      },
    });
    sendRealtimeEvent(dataChannel, {
      type: 'response.create',
    });
  }
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    color: '#111827',
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    color: '#475569',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 14,
  },
  guide: {
    color: '#64748b',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  statusCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  cardTitle: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  connectionStatus: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
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
    marginTop: 16,
  },
  detail: {
    color: '#374151',
    fontSize: 14,
    marginBottom: 6,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
  },
  taskList: {
    gap: 10,
  },
  taskCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  taskIndex: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
    height: 24,
    lineHeight: 24,
    marginRight: 10,
    textAlign: 'center',
    width: 24,
  },
  taskText: {
    color: '#111827',
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  errorMessage: {
    color: '#b91c1c',
    fontSize: 14,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 22,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  stopButton: {
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  stopButtonText: {
    color: '#991b1b',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#0369a1',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.45,
  },
  pressedButton: {
    opacity: 0.75,
  },
  idle: {
    color: '#64748b',
  },
  'requesting-permission': {
    color: '#0369a1',
  },
  'requesting-token': {
    color: '#0369a1',
  },
  connecting: {
    color: '#ca8a04',
  },
  connected: {
    color: '#15803d',
  },
  disconnected: {
    color: '#64748b',
  },
  error: {
    color: '#b91c1c',
  },
});

async function requestMicrophonePermission(): Promise<boolean> {
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function getSaveTaskFunctionCall(event: RealtimeServerEvent):
  | {
      callId: string;
      arguments: string;
    }
  | null {
  const item = event.item;
  if (
    event.type === 'response.output_item.done' &&
    item?.type === 'function_call' &&
    item.name === 'save_task' &&
    item.call_id &&
    item.arguments
  ) {
    return {
      callId: item.call_id,
      arguments: item.arguments,
    };
  }

  if (
    event.type === 'response.function_call_arguments.done' &&
    event.name === 'save_task' &&
    event.call_id &&
    event.arguments
  ) {
    return {
      callId: event.call_id,
      arguments: event.arguments,
    };
  }

  return null;
}

function parseSaveTask(argumentsJson: string): string | null {
  try {
    const args = JSON.parse(argumentsJson) as { task?: unknown };
    if (typeof args.task === 'string' && args.task.trim()) {
      return args.task.trim();
    }
  } catch {
    return null;
  }

  return null;
}

export default App;

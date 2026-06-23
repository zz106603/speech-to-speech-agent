import { useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { maskToken, requestRealtimeToken } from './src/api/realtimeTokenApi';
import {
  requestSessionSummary,
  type SessionSummary,
} from './src/api/sessionSummaryApi';
import {
  connectToOpenAIRealtime,
  sendRealtimeEvent,
  type RealtimeConnection,
  type RealtimeServerEvent,
} from './src/realtime/realtimeConnection';

type RequestStatus = 'idle' | 'loading' | 'success' | 'error';
type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};
type ThemeMode = 'light' | 'dark';
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

const appThemes = {
  light: {
    background: '#f8fafc',
    surface: '#ffffff',
    softSurface: '#eef2ff',
    border: '#e2e8f0',
    primary: '#2563eb',
    primaryText: '#ffffff',
    title: '#111827',
    text: '#374151',
    muted: '#64748b',
    assistantBubble: '#ffffff',
    assistantText: '#111827',
    taskBadge: '#dbeafe',
    taskBadgeText: '#1d4ed8',
    stopBackground: '#fee2e2',
    stopText: '#991b1b',
    summaryBorder: '#bfdbfe',
    error: '#b91c1c',
  },
  dark: {
    background: '#0f172a',
    surface: '#1e293b',
    softSurface: '#111827',
    border: '#334155',
    primary: '#60a5fa',
    primaryText: '#0f172a',
    title: '#f8fafc',
    text: '#cbd5e1',
    muted: '#94a3b8',
    assistantBubble: '#1e293b',
    assistantText: '#f8fafc',
    taskBadge: '#1d4ed8',
    taskBadgeText: '#dbeafe',
    stopBackground: '#7f1d1d',
    stopText: '#fee2e2',
    summaryBorder: '#2563eb',
    error: '#fca5a5',
  },
} as const;

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

function connectionStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return '#16a34a';
    case 'connecting':
    case 'requesting-permission':
    case 'requesting-token':
      return '#ca8a04';
    case 'error':
      return '#dc2626';
    default:
      return '#94a3b8';
  }
}

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
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
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [sessionSummary, setSessionSummary] =
    useState<SessionSummary | null>(null);
  const handledToolCallsRef = useRef<Set<string>>(new Set());
  const handledTranscriptItemsRef = useRef<Set<string>>(new Set());
  const isEndingSessionRef = useRef(false);
  const isRealtimeSessionConfiguredRef = useRef(false);
  const tasksRef = useRef<string[]>([]);
  const messagesRef = useRef<ConversationMessage[]>([]);

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
    setSessionSummary(null);
    setTasks([]);
    tasksRef.current = [];
    setMessages([]);
    messagesRef.current = [];
    handledToolCallsRef.current.clear();
    handledTranscriptItemsRef.current.clear();
    isEndingSessionRef.current = false;
    isRealtimeSessionConfiguredRef.current = false;

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
        onDataChannelStateChange: (state, dataChannel) => {
          setDataChannelState(state);
          if (state === 'open' && !isRealtimeSessionConfiguredRef.current) {
            isRealtimeSessionConfiguredRef.current = true;
            configureRealtimeResponseLoop(dataChannel);
          }
        },
        onRemoteStream: stream => {
          setHasRemoteAudio(stream.getAudioTracks().length > 0);
        },
        onDataChannelMessage: (event, dataChannel) => {
          handleRealtimeEvent(
            event,
            dataChannel,
            task => {
              const nextTasks = [...tasksRef.current, task];
              tasksRef.current = nextTasks;
              setTasks(nextTasks);
            },
            message => {
              const nextMessages = [...messagesRef.current, message];
              messagesRef.current = nextMessages;
              setMessages(nextMessages);
              return nextMessages;
            },
          );
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

  const handleSessionEndIntent = async (
    messagesForSummary: ConversationMessage[],
  ) => {
    if (isEndingSessionRef.current) {
      return;
    }

    isEndingSessionRef.current = true;

    try {
      const summary = await requestSessionSummary(
        messagesForSummary,
        tasksRef.current,
      );
      setSessionSummary(summary);
    } catch {
      setErrorMessage('세션 요약을 생성하지 못했습니다.');
    } finally {
      cleanupConnection();
      setConnectionStatus('disconnected');
    }
  };

  const isConnecting =
    connectionStatus === 'requesting-permission' ||
    connectionStatus === 'requesting-token' ||
    connectionStatus === 'connecting';
  const isConnected = connectionStatus === 'connected';
  const theme = appThemes[themeMode];

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        {
          backgroundColor: theme.background,
          paddingTop: safeAreaInsets.top + 24,
          paddingBottom: safeAreaInsets.bottom + 24,
        },
      ]}>
      <StatusBar
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTextGroup}>
            <Text style={[styles.title, {color: theme.title}]}>루코</Text>
            <Text style={[styles.subtitle, {color: theme.muted}]}>
              말로 정리하는 루틴 코치
            </Text>
            <View
              style={[
                styles.statusPill,
                {backgroundColor: theme.surface, borderColor: theme.border},
              ]}>
              <View
                style={[
                  styles.statusDot,
                  {backgroundColor: connectionStatusColor(connectionStatus)},
                ]}
              />
              <Text style={[styles.statusPillText, {color: theme.muted}]}>
                {connectionStatusText[connectionStatus]}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={({pressed}) => [
                styles.themeButton,
                {backgroundColor: theme.surface, borderColor: theme.border},
                pressed && styles.pressedButton,
              ]}
              onPress={() =>
                setThemeMode(current => (current === 'light' ? 'dark' : 'light'))
              }>
              <Text style={[styles.themeButtonText, {color: theme.text}]}>
                {themeMode === 'light' ? 'Dark' : 'Light'}
              </Text>
            </Pressable>
            {isConnecting || isConnected ? (
              <Pressable
                style={({pressed}) => [
                  styles.headerStopButton,
                  {backgroundColor: theme.stopBackground},
                  pressed && styles.pressedButton,
                ]}
              onPress={handleStopConnection}>
                <Text style={[styles.headerStopButtonText, {color: theme.stopText}]}>
                  종료
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={({pressed}) => [
                  styles.headerStartButton,
                  {backgroundColor: theme.primary},
                  pressed && styles.pressedButton,
                ]}
                onPress={handleStartConnection}>
                <Text
                  style={[
                    styles.headerStartButtonText,
                    {color: theme.primaryText},
                  ]}>
                  시작
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {errorMessage ? (
          <Text style={[styles.errorMessage, {color: theme.error}]}>
            {errorMessage}
          </Text>
        ) : null}

        <View
          style={[
            styles.chatSection,
            {backgroundColor: theme.softSurface, borderColor: theme.border},
          ]}>
          {messages.length === 0 ? (
            <View style={styles.emptyChat}>
              <Text style={[styles.emptyChatTitle, {color: theme.title}]}>
                대화를 시작해보세요
              </Text>
              <Text style={[styles.emptyChatText, {color: theme.muted}]}>
                할 일이나 루틴을 말하면 루코가 짧게 정리해줍니다.
              </Text>
            </View>
          ) : (
            <View style={styles.chatList}>
              {messages.map((message, index) => {
                const isUser = message.role === 'user';
                return (
                  <View
                    key={`${message.role}-${index}`}
                    style={[
                      styles.bubbleRow,
                      isUser ? styles.userBubbleRow : styles.assistantBubbleRow,
                    ]}>
                    {!isUser ? (
                      <Text style={[styles.avatarLabel, {color: theme.muted}]}>
                        루코
                      </Text>
                    ) : null}
                    <View
                      style={[
                        styles.chatBubble,
                        isUser
                          ? [
                              styles.userBubble,
                              {backgroundColor: theme.primary},
                            ]
                          : [
                              styles.assistantBubble,
                              {
                                backgroundColor: theme.assistantBubble,
                                borderColor: theme.border,
                              },
                            ],
                      ]}>
                      <Text
                        style={[
                          styles.chatBubbleText,
                          isUser
                            ? [
                                styles.userBubbleText,
                                {color: theme.primaryText},
                              ]
                            : [
                                styles.assistantBubbleText,
                                {color: theme.assistantText},
                              ],
                        ]}>
                        {message.content}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {sessionSummary ? (
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.summaryBorder,
              },
            ]}>
            <Text style={[styles.summaryTitle, {color: theme.title}]}>
              {sessionSummary.title}
            </Text>
            <Text style={[styles.summaryText, {color: theme.text}]}>
              {sessionSummary.summary}
            </Text>
            <Text style={[styles.summaryTaskTitle, {color: theme.muted}]}>
              저장된 할 일
            </Text>
            {sessionSummary.tasks.length === 0 ? (
              <Text style={[styles.emptyText, {color: theme.muted}]}>
                저장된 할 일이 없습니다.
              </Text>
            ) : (
              <View style={styles.summaryTaskList}>
                {sessionSummary.tasks.map((task, index) => (
                  <Text
                    key={`${task}-${index}`}
                    style={[styles.summaryTask, {color: theme.text}]}>
                    {index + 1}. {task}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.label, {color: theme.text}]}>저장된 할 일</Text>
          {tasks.length === 0 ? (
            <Text style={[styles.emptyText, {color: theme.muted}]}>
              아직 저장된 할 일이 없습니다.
            </Text>
          ) : (
            <View style={styles.taskList}>
              {tasks.map((task, index) => (
                <View
                  key={`${task}-${index}`}
                  style={[
                    styles.taskCard,
                    {backgroundColor: theme.surface, borderColor: theme.border},
                  ]}>
                  <Text
                    style={[
                      styles.taskIndex,
                      {
                        backgroundColor: theme.taskBadge,
                        color: theme.taskBadgeText,
                      },
                    ]}>
                    {index + 1}
                  </Text>
                  <Text style={[styles.taskText, {color: theme.title}]}>
                    {task}
                  </Text>
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
    onMessageSaved: (message: ConversationMessage) => ConversationMessage[],
  ) {
    const transcriptMessage = getTranscriptMessage(event);
    if (transcriptMessage) {
      const transcriptKey = `${transcriptMessage.role}:${transcriptMessage.itemId}`;
      if (!handledTranscriptItemsRef.current.has(transcriptKey)) {
        handledTranscriptItemsRef.current.add(transcriptKey);
        const nextMessages = onMessageSaved({
          role: transcriptMessage.role,
          content: transcriptMessage.content,
        });

        if (isSessionEndIntent(transcriptMessage)) {
          void handleSessionEndIntent(nextMessages);
        }
      }
    }

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
    paddingHorizontal: 18,
    justifyContent: 'flex-start',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  title: {
    color: '#111827',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 6,
    width: 8,
  },
  statusPillText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  headerStartButton: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 999,
    minWidth: 72,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerStartButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  headerStopButton: {
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    minWidth: 72,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerStopButtonText: {
    color: '#991b1b',
    fontSize: 15,
    fontWeight: '800',
  },
  themeButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  themeButtonText: {
    fontSize: 12,
    fontWeight: '800',
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
  chatSection: {
    backgroundColor: '#eef2ff',
    borderColor: '#dbeafe',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 260,
    padding: 14,
  },
  emptyChat: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 230,
    paddingHorizontal: 16,
  },
  emptyChatTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyChatText: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  chatList: {
    gap: 12,
  },
  bubbleRow: {
    maxWidth: '100%',
  },
  userBubbleRow: {
    alignItems: 'flex-end',
  },
  assistantBubbleRow: {
    alignItems: 'flex-start',
  },
  avatarLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
    marginLeft: 2,
  },
  chatBubble: {
    borderRadius: 8,
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#2563eb',
    borderTopRightRadius: 2,
  },
  assistantBubble: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderTopLeftRadius: 2,
    borderWidth: 1,
  },
  chatBubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  userBubbleText: {
    color: '#ffffff',
  },
  assistantBubbleText: {
    color: '#111827',
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
  summaryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#bfdbfe',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 20,
    padding: 16,
  },
  summaryTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  summaryText: {
    color: '#374151',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  summaryTaskTitle: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  summaryTaskList: {
    gap: 4,
  },
  summaryTask: {
    color: '#111827',
    fontSize: 14,
    lineHeight: 20,
  },
  messageList: {
    gap: 8,
  },
  messageRow: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageRole: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  messageText: {
    color: '#111827',
    fontSize: 14,
    lineHeight: 20,
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

function getTranscriptMessage(event: RealtimeServerEvent):
  | {
      itemId: string;
      role: ConversationMessage['role'];
      content: string;
    }
  | null {
  if (
    event.type === 'conversation.item.input_audio_transcription.completed' &&
    event.item_id &&
    event.transcript?.trim()
  ) {
    return {
      itemId: event.item_id,
      role: 'user',
      content: event.transcript.trim(),
    };
  }

  if (
    event.type === 'response.output_audio_transcript.done' &&
    event.item_id &&
    event.transcript?.trim()
  ) {
    return {
      itemId: event.item_id,
      role: 'assistant',
      content: event.transcript.trim(),
    };
  }

  return null;
}

function isSessionEndIntent(message: {
  role: ConversationMessage['role'];
  content: string;
}): boolean {
  if (message.role !== 'user') {
    return false;
  }

  const content = message.content.trim();
  return (
    content.includes('끝') ||
    content.includes('그만') ||
    content.includes('마무리')
  );
}

function configureRealtimeResponseLoop(
  dataChannel: RealtimeConnection['dataChannel'],
) {
  sendRealtimeEvent(dataChannel, {
    type: 'session.update',
    session: {
      type: 'realtime',
      audio: {
        input: {
          transcription: {
            model: 'gpt-realtime-whisper',
            language: 'ko',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true,
            interrupt_response: true,
          },
        },
      },
    },
  });
}

export default App;

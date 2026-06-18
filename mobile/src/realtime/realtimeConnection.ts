import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';

type RealtimeDataChannel = ReturnType<RTCPeerConnection['createDataChannel']>;
type RealtimePeerConnectionState = RTCPeerConnection['connectionState'];

export type RealtimeConnection = {
  peerConnection: RTCPeerConnection;
  dataChannel: RealtimeDataChannel;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  close: () => void;
};

export type RealtimeConnectionCallbacks = {
  onConnectionStateChange?: (state: RealtimePeerConnectionState) => void;
  onDataChannelStateChange?: (state: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
};

const OPENAI_REALTIME_WEBRTC_URL =
  'https://api.openai.com/v1/realtime/calls';

export function createRealtimePeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection();
}

export function createRealtimeDataChannel(
  peerConnection: RTCPeerConnection,
  callbacks: RealtimeConnectionCallbacks = {},
): RealtimeDataChannel {
  const dataChannel = peerConnection.createDataChannel('oai-events');

  addWebRTCEventListener(dataChannel, 'open', () => {
    callbacks.onDataChannelStateChange?.(dataChannel.readyState);
  });
  addWebRTCEventListener(dataChannel, 'close', () => {
    callbacks.onDataChannelStateChange?.(dataChannel.readyState);
  });
  addWebRTCEventListener(dataChannel, 'error', () => {
    callbacks.onDataChannelStateChange?.(dataChannel.readyState);
  });

  return dataChannel;
}

export async function addLocalAudioTrack(
  peerConnection: RTCPeerConnection,
): Promise<MediaStream> {
  const stream = await mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });

  stream.getAudioTracks().forEach(track => {
    peerConnection.addTrack(track, stream);
  });

  return stream;
}

export async function connectToOpenAIRealtime(
  ephemeralToken: string,
  callbacks: RealtimeConnectionCallbacks = {},
): Promise<RealtimeConnection> {
  const peerConnection = createRealtimePeerConnection();
  let localStream: MediaStream | null = null;
  let remoteStream: MediaStream | null = null;

  addWebRTCEventListener(peerConnection, 'connectionstatechange', () => {
    callbacks.onConnectionStateChange?.(peerConnection.connectionState);
  });
  addWebRTCEventListener(peerConnection, 'track', event => {
    const stream = event.streams[0];
    if (stream) {
      remoteStream = stream;
      callbacks.onRemoteStream?.(stream);
    }
  });

  const dataChannel = createRealtimeDataChannel(peerConnection, callbacks);

  try {
    localStream = await addLocalAudioTrack(peerConnection);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const answerSdp = await requestOpenAIRealtimeAnswer(
      ephemeralToken,
      offer.sdp,
    );

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription({
        type: 'answer',
        sdp: answerSdp,
      }),
    );
  } catch (error) {
    closeRealtimeConnection(peerConnection, localStream, dataChannel);
    throw error;
  }

  return {
    peerConnection,
    dataChannel,
    localStream,
    remoteStream,
    close: () => closeRealtimeConnection(peerConnection, localStream, dataChannel),
  };
}

export function closeRealtimeConnection(
  peerConnection: RTCPeerConnection,
  localStream: MediaStream | null = null,
  dataChannel: RealtimeDataChannel | null = null,
) {
  if (dataChannel?.readyState !== 'closed') {
    dataChannel?.close();
  }

  localStream?.getTracks().forEach(track => {
    track.stop();
  });
  localStream?.release();

  peerConnection.close();
}

async function requestOpenAIRealtimeAnswer(
  ephemeralToken: string,
  offerSdp?: string,
): Promise<string> {
  if (!offerSdp) {
    throw new Error('Realtime offer SDP is missing');
  }

  const response = await fetch(OPENAI_REALTIME_WEBRTC_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ephemeralToken}`,
      'Content-Type': 'application/sdp',
    },
    body: offerSdp,
  });

  if (!response.ok) {
    throw new Error('OpenAI Realtime SDP exchange failed');
  }

  return response.text();
}

function addWebRTCEventListener(
  target: unknown,
  eventName: string,
  listener: (event: any) => void,
) {
  (target as { addEventListener: (name: string, handler: unknown) => void })
    .addEventListener(eventName, listener);
}

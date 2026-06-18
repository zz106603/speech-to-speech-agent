import {
  mediaDevices,
  RTCPeerConnection,
  type MediaStream,
} from 'react-native-webrtc';

type RealtimeDataChannel = ReturnType<RTCPeerConnection['createDataChannel']>;

export type RealtimeConnection = {
  peerConnection: RTCPeerConnection;
  dataChannel: RealtimeDataChannel;
  localStream: MediaStream | null;
  close: () => void;
};

export function createRealtimePeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection();
}

export function createRealtimeDataChannel(
  peerConnection: RTCPeerConnection,
): RealtimeDataChannel {
  return peerConnection.createDataChannel('oai-events');
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

export async function prepareRealtimeConnection(): Promise<RealtimeConnection> {
  const peerConnection = createRealtimePeerConnection();
  const dataChannel = createRealtimeDataChannel(peerConnection);
  const localStream = await addLocalAudioTrack(peerConnection);

  return {
    peerConnection,
    dataChannel,
    localStream,
    close: () => closeRealtimeConnection(peerConnection, localStream),
  };
}

export function closeRealtimeConnection(
  peerConnection: RTCPeerConnection,
  localStream: MediaStream | null = null,
) {
  localStream?.getTracks().forEach(track => {
    track.stop();
  });
  peerConnection.close();
}

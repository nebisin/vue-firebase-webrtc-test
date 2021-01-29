<template>
  <div class="container">
    <h1>Firebase WebRTC</h1>
    <div class="buttons">
      <button @click="openUserMedia">Open cam and mic</button>
      <button @click="createRoom">Create room</button>
      <button @click="dialogOpen = true">Join Room</button>
      <button @click="hangUp">Hangup</button>
    </div>
    <div v-if="currentRoom">
      <span class="current-room">Current room is {{ currentRoom }}</span>
    </div>
    <div class="videos">
      <video
        id="local-video"
        muted
        autoplay
        playsinline
        ref="localVideo"
      ></video>
      <video id="remote-video" autoplay playsinline ref="remoteVideo"></video>
    </div>
    <div class="join-room-dialog" v-if="dialogOpen">
      <div class="jr-dialog-container">
        <div class="jr-dialog-inner">
          <h2 class="jr-dialog-title">Join Room</h2>
          <label for="room-id">Enter room ID:</label>
          <input type="text" id="room-id" v-model="roomId" />
          <div class="jr-dialog-actions">
            <button @click="dialogOpen = false">Cancel</button>
            <button @click="joinRoomById">Join</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref } from "vue";

import { firestore } from "./firebase/config";

export default {
  name: "App",
  components: {},
  setup() {
    const configuration = {
      iceServers: [
        {
          urls: [
            "stun:stun3.l.google.com:19302",
            "stun:stun4.l.google.com:19302",
          ],
        },
      ],
      iceCandidatePoolSize: 10,
    };

    const peerConnection = ref(null);
    const dialogOpen = ref(false);
    const localVideo = ref(null);
    const remoteVideo = ref(null);

    const localStream = ref(null);
    const remoteStream = ref(null);

    const currentRoom = ref(null);

    const roomId = ref(null);

    const openUserMedia = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { max: 600 },
          height: { max: 300 },
        },
        audio: true,
      });
      localVideo.value.srcObject = stream;
      localStream.value = stream;
      remoteStream.value = new MediaStream();
      remoteVideo.value.srcObject = remoteStream.value;
    };

    const hangUp = async () => {
      localVideo.value.srcObject.getTracks().forEach((track) => track.stop());

      if (remoteStream.value) {
        remoteStream.value.getTracks().forEach((track) => track.stop());
      }

      if (peerConnection.value) {
        peerConnection.value.close();
      }

      if (currentRoom.value || roomId.value) {
        const roomRef = firestore
          .collection("rooms")
          .doc(currentRoom.value || roomId.value);
        const calleeCandidates = await roomRef
          .collection("calleeCandidates")
          .get();
        calleeCandidates.forEach(async (candidate) => {
          await candidate.delete();
        });
        const callerCandidates = await roomRef
          .collection("callerCandidates")
          .get();
        callerCandidates.forEach(async (candidate) => {
          await candidate.delete();
        });
        await roomRef.delete();
      }
    };

    const createRoom = async () => {
      peerConnection.value = new RTCPeerConnection(configuration);

      localStream.value.getTracks().forEach((track) => {
        peerConnection.value.addTrack(track, localStream.value);
      });

      // Code for creating a room below

      const offer = await peerConnection.value.createOffer();
      await peerConnection.value.setLocalDescription(offer);

      const roomWithOffer = {
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
      };

      const roomRef = await firestore.collection("rooms").add(roomWithOffer);
      currentRoom.value = roomRef.id;

      roomRef.onSnapshot(async (snapshot) => {
        const data = snapshot.data();
        if (!peerConnection.value.currentRemoteDescription && data.answer) {
          const answer = new RTCSessionDescription(data.answer);
          await peerConnection.value.setRemoteDescription(answer);
        }
      });

      // Code for creating a room above

      // Code for collecting ICE candidates below

      const callerCandidatesCollection = roomRef.collection("callerCandidates");

      peerConnection.value.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          console.log("Got final candidate!");
          return;
        }
        console.log("Got candidate: ", event.candidate);
        callerCandidatesCollection.add(event.candidate.toJSON());
      });

      // Code for collecting ICE candidates above

      peerConnection.value.addEventListener("track", (event) => {
        event.streams[0].getTracks().forEach((track) => {
          console.log(track);
          remoteStream.value.addTrack(track);
        });
      });

      // Listening for remote session description below

      roomRef.onSnapshot(async (snapshot) => {
        const data = snapshot.data();
        if (
          !peerConnection.value.currentRemoteDescription &&
          data &&
          data.answer
        ) {
          console.log("Got remote description: ", data.answer);
          const rtcSessionDescription = new RTCSessionDescription(data.answer);
          await peerConnection.value.setRemoteDescription(
            rtcSessionDescription
          );
        }
      });

      // Listening for remote session description above

      // Listen for remote ICE candidates below

      roomRef.collection("calleeCandidates").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            let data = change.doc.data();
            console.log(
              `Got new remote ICE candidate: ${JSON.stringify(data)}`
            );
            await peerConnection.value.addIceCandidate(
              new RTCIceCandidate(data)
            );
          }
        });
      });

      // Listen for remote ICE candidates above
    };

    const joinRoomById = async () => {
      const roomRef = firestore.collection("rooms").doc(`${roomId.value}`);
      const roomSnapshot = await roomRef.get();

      if (roomSnapshot.exists) {
        peerConnection.value = new RTCPeerConnection(configuration);

        localStream.value.getTracks().forEach((track) => {
          peerConnection.value.addTrack(track, localStream.value);
        });

        // Code for collecting ICE candidates below

        const calleeCandidatesCollection = roomRef.collection(
          "calleeCandidates"
        );
        peerConnection.value.addEventListener("icecandidate", (event) => {
          if (!event.candidate) {
            console.log("Got final candidate!");
            return;
          }
          console.log("Got candidate: ", event.candidate);
          calleeCandidatesCollection.add(event.candidate.toJSON());
        });

        // Code for collecting ICE candidates above

        peerConnection.value.addEventListener("track", (event) => {
          event.streams[0].getTracks().forEach((track) => {
            remoteStream.value.addTrack(track);
          });
        });

        // Code for creating SDP answer below

        const offer = roomSnapshot.data().offer;
        console.log("Got offer:", offer);
        await peerConnection.value.setRemoteDescription(
          new RTCSessionDescription(offer)
        );
        const answer = await peerConnection.value.createAnswer();
        console.log("Created answer:", answer);
        await peerConnection.value.setLocalDescription(answer);

        const roomWithAnswer = {
          answer: {
            type: answer.type,
            sdp: answer.sdp,
          },
        };
        await roomRef.update(roomWithAnswer);

        // Code for creating SDP answer above

        // Listening for remote ICE candidates below

        roomRef.collection("callerCandidates").onSnapshot((snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
              let data = change.doc.data();
              console.log(
                `Got new remote ICE candidate: ${JSON.stringify(data)}`
              );
              await peerConnection.addIceCandidate(new RTCIceCandidate(data));
            }
          });
        });

        // Listening for remote ICE candidates above
      }
    };

    return {
      dialogOpen,
      localVideo,
      remoteVideo,
      openUserMedia,
      hangUp,
      createRoom,
      joinRoomById,
      currentRoom,
      roomId,
    };
  },
};
</script>

<style>
body,
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  margin-top: 60px;
}
.container {
  max-width: 1200px;
  padding: 10px;
  margin: 0 auto;
}
.videos video {
  max-width: 600px;
}
</style>

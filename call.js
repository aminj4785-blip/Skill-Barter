// call.js — WebRTC video calls signalled through Firestore. startCallUI() creates
// the call doc + notifies the callee; joinCall() answers; showVideoCallModal() runs
// the peer connection (offer/answer + ICE candidates) and the call UI.
//
// The UI is a full-bleed stage: the remote video fills it, your own camera sits
// in a mirrored picture-in-picture tile, a status pill floats top-left, and a
// dock of round controls (mute, camera, hang up) sits at the bottom. All the
// original element IDs and signalling logic are preserved.

import { state } from './state.js';
import { db, appId, doc, collection, addDoc, setDoc, onSnapshot, serverTimestamp } from './firebase.js';
import { defaultAvatarFor, pushNotification } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { requireAuth } from './auth.js';
import { finalizeSwap } from './swaps.js';

export async function startCallUI(remoteUserId, swapId = null) {
  if (!requireAuth()) return;
  if (!remoteUserId) return;
  const callId = [state.currentUser.uid, remoteUserId, Date.now()].join('_');
  const callRef = doc(db, `/artifacts/${appId}/calls/${callId}`);
  await setDoc(callRef, {
    caller: state.currentUser.uid,
    callee: remoteUserId,
    status: 'initiated',
    startedAt: serverTimestamp(),
    swapId: swapId || null
  });

  await pushNotification(remoteUserId, {
    type: 'incoming_call',
    callId,
    fromUserId: state.currentUser.uid,
    fromUserName: state.currentUser.displayName || state.currentUser.email?.split('@')[0] || 'User',
    fromUserAvatar: state.currentUser.avatarUrl || defaultAvatarFor(),
    textPreview: 'Incoming video call!'
  });

  showVideoCallModal(callId, true, remoteUserId, swapId);
}

export async function joinCall(callId) {
  if (!requireAuth()) return;
  showVideoCallModal(callId, false);
}

function showVideoCallModal(callId, isCaller, remoteUserIdParam = null, swapId = null) {
  renderModal(`
    <div class="call-stage">
      <video id="remoteVideo" autoplay playsinline class="call-remote waiting"></video>
      <video id="localVideo" autoplay playsinline muted class="call-local"></video>

      <div class="call-topbar">
        <span class="call-status">
          <span class="live-dot" id="live-dot"></span>
          <span id="call-status">Connecting…</span>
        </span>
      </div>

      ${swapId ? `<button id="end-swap-btn" class="swap-complete-pill"><i class="fas fa-check"></i> Complete swap</button>` : ""}

      <div class="call-dock">
        <button id="toggle-mic-btn" class="ctrl-btn" aria-label="Mute microphone" title="Mute"><i class="fas fa-microphone"></i></button>
        <button id="toggle-cam-btn" class="ctrl-btn" aria-label="Turn camera off" title="Camera"><i class="fas fa-video"></i></button>
        <button id="hangup-btn" class="ctrl-btn hangup" aria-label="Hang up" title="Hang up"><i class="fas fa-phone-slash"></i></button>
      </div>
    </div>
  `, { variant: 'call' });

  let pc = null, localStream = null, unsubSignal = null;
  const callRef = doc(db, `/artifacts/${appId}/calls/${callId}`);
  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');
  const callStatus = document.getElementById('call-status');
  const liveDot = document.getElementById('live-dot');
  const hangupBtn = document.getElementById('hangup-btn');
  const endSwapBtn = document.getElementById('end-swap-btn');
  const micBtn = document.getElementById('toggle-mic-btn');
  const camBtn = document.getElementById('toggle-cam-btn');
  const closeBtn = document.querySelector('[data-action="close-modal"]');

  async function cleanup(reason) {
    if (unsubSignal) unsubSignal();
    if (pc) { pc.close(); pc = null; }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    callStatus.textContent = reason || 'Call ended';
    if (liveDot) liveDot.classList.add('ended');
    setTimeout(closeModal, 1500);
    await setDoc(callRef, { status: 'ended', endedAt: serverTimestamp() }, { merge: true });
    if (state.activeCallCleanup) state.activeCallCleanup = null;
  }

  hangupBtn.onclick = () => cleanup('You hung up.');
  // The call owns a media stream + listeners, so the × must clean up too
  // (modal.js leaves close-wiring to us for the 'call' variant).
  if (closeBtn) closeBtn.onclick = () => cleanup('Call ended.');
  if (endSwapBtn) endSwapBtn.onclick = async () => {
    if (swapId) await finalizeSwap(swapId);
    await cleanup('Swap completed!');
  };

  // Mute / unmute the outgoing audio track.
  micBtn.onclick = () => {
    const track = localStream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    micBtn.classList.toggle('off', !track.enabled);
    micBtn.querySelector('i').className = track.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
    micBtn.title = track.enabled ? 'Mute' : 'Unmute';
  };
  // Turn the outgoing camera track on / off.
  camBtn.onclick = () => {
    const track = localStream?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    camBtn.classList.toggle('off', !track.enabled);
    camBtn.querySelector('i').className = track.enabled ? 'fas fa-video' : 'fas fa-video-slash';
    camBtn.title = track.enabled ? 'Turn camera off' : 'Turn camera on';
  };

  async function setupPeerConnection() {
    pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        const candidatesCol = collection(callRef, isCaller ? 'callerCandidates' : 'calleeCandidates');
        await addDoc(candidatesCol, JSON.parse(JSON.stringify(event.candidate)));
      }
    };
    pc.ontrack = (event) => {
      if (remoteVideo.srcObject !== event.streams[0]) remoteVideo.srcObject = event.streams[0];
      remoteVideo.classList.remove('waiting');
      callStatus.textContent = 'Connected';
    };
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      localVideo.srcObject = localStream;
      callStatus.textContent = isCaller ? 'Ringing…' : 'Joining…';
    } catch (e) {
      callStatus.textContent = 'Could not get camera/mic: ' + e.message;
      return;
    }
  }

  (async () => {
    await setupPeerConnection();
    if (isCaller) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await setDoc(callRef, { offer: { type: offer.type, sdp: offer.sdp } }, { merge: true });
    }

    unsubSignal = onSnapshot(callRef, async (snap) => {
      const data = snap.data();
      if (!data) return;
      if (!isCaller && data.offer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await setDoc(callRef, { answer: { type: answer.type, sdp: answer.sdp } }, { merge: true });
      }
      if (data.answer && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
      if (data.status === 'ended') cleanup('Remote hung up.');
    });

    const callerCandidatesCol = collection(callRef, 'callerCandidates');
    const calleeCandidatesCol = collection(callRef, 'calleeCandidates');
    onSnapshot(isCaller ? calleeCandidatesCol : callerCandidatesCol, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate).catch(() => {});
        }
      });
    });
  })();

  state.activeCallCleanup = cleanup;
}

// chat.js — 1:1 realtime chat between the current user and another user.
// Messages live in the top-level `chats/{chatId}/messages` collection.
// The UI is a focused messenger: a header identifying who you're talking to,
// a scrolling transcript of grouped bubbles, and a single-line composer.

import { state } from './state.js';
import { db, appId, collection, doc, getDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp } from './firebase.js';
import { escapeHtml, defaultAvatarFor, pushNotification } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { requireAuth } from './auth.js';
import { startCallUI } from './call.js';

export async function openChatModal(targetUserId) {
  if (!requireAuth()) return;
  const chatId = [state.currentUser.uid, targetUserId].sort().join('_');

  let otherName = 'Chat', otherAvatar = defaultAvatarFor(), otherSub = 'Swap partner';
  try {
    const otherDoc = await getDoc(doc(db, `/artifacts/${appId}/users/${targetUserId}`));
    if (otherDoc.exists()) {
      const d = otherDoc.data();
      otherName = d.displayName || d.email?.split('@')[0] || 'User';
      otherAvatar = d.avatarUrl || defaultAvatarFor();
      otherSub = d.email || 'Swap partner';
    }
  } catch (err) {
    console.warn('other user fetch err', err);
  }

  const firstName = escapeHtml(otherName.split(' ')[0]);

  renderModal(`
    <div class="chat-head">
      <img src="${otherAvatar}" class="avatar-inline" alt="">
      <div class="who">
        <div class="name">${escapeHtml(otherName)}</div>
        <div class="sub">${escapeHtml(otherSub)}</div>
      </div>
      <button id="start-video-btn" class="icon-btn" aria-label="Start video call" title="Start a video call">
        <i class="fas fa-video"></i>
      </button>
    </div>

    <div id="chat-history" class="chat-body" aria-live="polite"></div>

    <form id="chat-form" class="composer">
      <input id="chat-input" class="field" placeholder="Message ${firstName}…" autocomplete="off" required>
      <button type="submit" class="send-btn" aria-label="Send message"><i class="fas fa-paper-plane"></i></button>
    </form>
  `, { variant: 'chat' });

  document.getElementById('start-video-btn')?.addEventListener('click', () => startCallUI(targetUserId, null));

  const chatRef = collection(db, "chats", chatId, "messages");
  const chatHistory = document.getElementById('chat-history');
  const q = query(chatRef, orderBy('timestamp'));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      chatHistory.innerHTML = `<p class="chat-empty">No messages yet — say hello and start the conversation.</p>`;
      return;
    }
    chatHistory.innerHTML = snapshot.docs.map(docSnap => {
      const m = docSnap.data();
      const isMine = m.senderId === state.currentUser.uid;
      const timeText = m.timestamp?.toDate ? new Date(m.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="msg-row ${isMine ? 'me' : 'them'}">
          <div class="bubble ${isMine ? 'me' : 'them'}">${escapeHtml(m.text)}</div>
          <div class="msg-meta">${timeText}</div>
        </div>`;
    }).join('');
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }, (err) => console.error('chat snap err', err));

  document.getElementById('chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const t = input.value.trim();
    if (!t) return;
    const senderNameToStore = state.currentUser.displayName || state.currentUser.email.split('@')[0] || 'User';
    const senderAvatarToStore = state.currentUser.avatarUrl || defaultAvatarFor();
    input.value = '';
    try {
      await addDoc(chatRef, { text: t, senderId: state.currentUser.uid, senderName: senderNameToStore, senderAvatar: senderAvatarToStore, timestamp: serverTimestamp() });
      if (targetUserId && targetUserId !== state.currentUser.uid) {
        await pushNotification(targetUserId, {
          type: 'message',
          chatId,
          fromUserId: state.currentUser.uid,
          fromUserName: senderNameToStore,
          fromUserAvatar: senderAvatarToStore,
          textPreview: t.substring(0, 200)
        });
      }
    } catch (err) {
      console.error('send msg err', err);
    }
  };

  // The chat owns a realtime listener, so it wires its own close: unsubscribe
  // first, then clear the modal. (modal.js leaves close-wiring to us for the
  // 'chat' variant, and won't close on backdrop click.)
  const closeBtn = document.querySelector('[data-action="close-modal"]');
  if (closeBtn) closeBtn.onclick = () => { unsubscribe(); closeModal(); };
}

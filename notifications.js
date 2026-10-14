// notifications.js — the notifications bell modal. Renders each notification and
// wires its action button (open chat, view/accept/decline swap, start/join call,
// leave rating, mark read). All "mark as read" writes go through markNotifRead().

import { state } from './state.js';
import { db, appId, doc, getDoc } from './firebase.js';
import { escapeHtml, defaultAvatarFor, markNotifRead } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { requireAuth } from './auth.js';
import { acceptSwap, declineSwap } from './swaps.js';
import { showLeaveRatingModal } from './ratings.js';
import { openChatModal } from './chat.js';
import { startCallUI, joinCall } from './call.js';

// Maps a notification type to the action button shown for it.
function actionButtonFor(n) {
  switch (n.type) {
    case 'message':
      return `<button class="open-chat-btn btn btn-primary btn-sm" data-from="${n.fromUserId || ''}" data-id="${n.id}"><i class="fas fa-comment"></i> Open Chat</button>`;
    case 'swap_request':
      return `<button class="view-swap-btn btn btn-primary btn-sm" data-swap="${n.swapId}" data-id="${n.id}"><i class="fas fa-right-left"></i> View Proposal</button>`;
    case 'swap_accepted':
      return `<button class="start-swap-call-btn btn btn-gold btn-sm" data-swap="${n.swapId}" data-user="${n.fromUserId || ''}" data-id="${n.id}"><i class="fas fa-video"></i> Start Video Call</button>`;
    case 'swap_completed':
      return `<button class="leave-rating-btn btn btn-primary btn-sm" data-target="${n.fromUserId}" data-id="${n.id}"><i class="fas fa-star"></i> Leave Rating</button>`;
    case 'incoming_call':
      return `<button class="join-call-btn btn btn-gold btn-sm" data-call="${n.callId}" data-id="${n.id}"><i class="fas fa-video"></i> Join Call</button>`;
    default:
      return '';
  }
}

export function openNotificationsModal() {
  if (!requireAuth()) return;

  renderModal(`
    <div class="modal-body">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
        <h2 class="modal-title" style="margin:0;"><i class="fas fa-bell" style="color:var(--teal);margin-right:.4rem;"></i> Notifications</h2>
        <button id="mark-all-read-btn" class="btn btn-quiet btn-sm">Mark all read</button>
      </div>
      <div id="notifs-list" style="display:flex;flex-direction:column;gap:.75rem;max-height:22rem;overflow-y:auto;padding-right:.25rem;">
        ${state.notifications.length === 0 ? '<div class="empty-note">No notifications yet.</div>' : ''}
        ${state.notifications.map(n => {
          const when = n.timestamp?.toDate ? new Date(n.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          return `
          <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:.85rem;display:flex;align-items:flex-start;gap:.75rem;${n.read ? 'opacity:.65;' : 'border-left:3px solid var(--teal);'}" data-id="${n.id}">
            <img src="${n.fromUserAvatar || defaultAvatarFor()}" class="avatar-inline" alt="avatar">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:600;font-size:.88rem;color:var(--text);">${escapeHtml(n.fromUserName || 'Neighbor')}</div>
                <div style="font-size:.75rem;color:var(--muted);">${when}</div>
              </div>
              <div style="font-size:.84rem;color:var(--text-soft);margin-top:.3rem;line-height:1.4;">${escapeHtml(n.textPreview || '')}</div>
              <div style="display:flex;align-items:center;gap:.6rem;margin-top:.6rem;">
                ${actionButtonFor(n)}
                <button class="mark-read-btn btn btn-ghost btn-sm" data-id="${n.id}">${n.read ? 'Read' : 'Mark read'}</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `);

  document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
    await Promise.all(state.notifications.filter(n => !n.read).map(n => markNotifRead(n.id)));
  });

  const list = document.getElementById('notifs-list');

  list.querySelectorAll('.open-chat-btn').forEach(btn => btn.addEventListener('click', () => {
    const fromId = btn.dataset.from;
    if (!fromId) return;
    markNotifRead(btn.dataset.id);
    closeModal();
    openChatModal(fromId);
  }));

  list.querySelectorAll('.view-swap-btn').forEach(btn => btn.addEventListener('click', () => showSwapProposalModal(btn.dataset.swap, btn.dataset.id)));

  list.querySelectorAll('.start-swap-call-btn').forEach(btn => btn.addEventListener('click', () => {
    const swapId = btn.dataset.swap, otherUserId = btn.dataset.user;
    if (!swapId || !otherUserId) return;
    markNotifRead(btn.dataset.id);
    closeModal();
    startCallUI(otherUserId, swapId);
  }));

  list.querySelectorAll('.leave-rating-btn').forEach(btn => btn.addEventListener('click', () => {
    closeModal();
    showLeaveRatingModal(btn.dataset.target);
  }));

  list.querySelectorAll('.join-call-btn').forEach(btn => btn.addEventListener('click', () => {
    const callId = btn.dataset.call;
    if (!callId) return;
    markNotifRead(btn.dataset.id);
    closeModal();
    joinCall(callId);
  }));

  list.querySelectorAll('.mark-read-btn').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.id) markNotifRead(btn.dataset.id);
  }));
}

// Nested modal opened from a "View Proposal" notification: shows the two skills
// and lets the responder accept or decline the swap.
async function showSwapProposalModal(swapId, notifId) {
  if (!swapId) return;
  const swapSnap = await getDoc(doc(db, `/artifacts/${appId}/public/data/swaps/${swapId}`));
  if (!swapSnap.exists()) { alert('Swap not found'); return; }
  const swap = swapSnap.data();
  const [reqSkillSnap, offSkillSnap] = await Promise.all([
    getDoc(doc(db, `/artifacts/${appId}/public/data/skills/${swap.skillRequestedId}`)),
    getDoc(doc(db, `/artifacts/${appId}/public/data/skills/${swap.skillOfferedId}`))
  ]);
  const reqTitle = reqSkillSnap.exists() ? reqSkillSnap.data().title : 'N/A';
  const offTitle = offSkillSnap.exists() ? offSkillSnap.data().title : 'N/A';

  renderModal(`
    <div class="modal-body">
      <h3 class="modal-title" style="margin-bottom:1rem;">Swap Proposal Received</h3>
      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1.25rem;">
        <div style="margin-bottom:.75rem;">
          <span style="font-size:.78rem;color:var(--muted);text-transform:uppercase;">They Offer:</span>
          <div style="font-weight:600;color:var(--teal);font-size:1.05rem;"><i class="fas fa-arrow-up"></i> ${escapeHtml(offTitle)}</div>
        </div>
        <div>
          <span style="font-size:.78rem;color:var(--muted);text-transform:uppercase;">In Return For:</span>
          <div style="font-weight:600;color:var(--gold);font-size:1.05rem;"><i class="fas fa-arrow-down"></i> ${escapeHtml(reqTitle)}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:.6rem;">
        <button id="decline-swap-btn" class="btn btn-ghost btn-sm">Decline</button>
        <button id="accept-swap-btn" class="btn btn-primary btn-sm"><i class="fas fa-check"></i> Accept Swap</button>
      </div>
    </div>
  `);

  document.getElementById('accept-swap-btn')?.addEventListener('click', async () => {
    try {
      await acceptSwap(swapId);
      await markNotifRead(notifId);
      closeModal();
      alert('Swap accepted! Both parties can now start a live video swap session.');
    } catch (err) { console.error(err); alert('Error accepting swap'); }
  });

  document.getElementById('decline-swap-btn')?.addEventListener('click', async () => {
    await declineSwap(swapId);
    await markNotifRead(notifId);
    closeModal();
  });
}

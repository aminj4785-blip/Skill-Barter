// community.js — the Community Q&A section: ask a question, list questions,
// and open a question to read/post answers in the unified dark design system.

import { state } from './state.js';
import { db, appId, collection, addDoc, getDoc, getDocs, doc, query, orderBy, serverTimestamp } from './firebase.js';
import { escapeHtml, defaultAvatarFor } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { requireAuth } from './auth.js';

export async function renderCommunity() {
  const container = document.getElementById('community-container');
  if (!container) return;

  container.innerHTML = `
    <div class="panel" style="margin-bottom:1.5rem;">
      <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:1rem;color:var(--text);display:flex;align-items:center;gap:.5rem;">
        <i class="fas fa-circle-question" style="color:var(--teal);"></i> Ask the Community
      </h3>
      <form id="ask-form" style="display:flex;flex-direction:column;gap:.85rem;">
        <div>
          <label class="label">Question title</label>
          <input name="title" placeholder="e.g. Best resources to practice conversational Spanish?" class="field" required>
        </div>
        <div>
          <label class="label">Details &amp; context</label>
          <textarea name="details" placeholder="Give more context on what you're trying to achieve or learn..." rows="3" class="field" required></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-paper-plane"></i> Post Question</button>
        </div>
      </form>
    </div>
    <div id="questions-list" style="display:flex;flex-direction:column;gap:1rem;">
      <div style="text-align:center;padding:1.5rem;color:var(--muted);"><i class="fas fa-spinner fa-spin"></i> Loading discussions...</div>
    </div>
  `;

  document.getElementById('ask-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      await addDoc(collection(db, `/artifacts/${appId}/public/community/questions`), {
        title: fd.title.trim(),
        details: fd.details.trim(),
        userId: state.currentUser.uid,
        userName: state.currentUser.displayName || state.currentUser.email.split('@')[0],
        userAvatar: state.currentUser.avatarUrl || defaultAvatarFor(),
        createdAt: serverTimestamp()
      });
      e.target.reset();
      loadCommunityQuestions();
    } catch (err) {
      console.error('post question err', err);
      alert('Failed to post question');
    }
  });

  loadCommunityQuestions();
}

export async function loadCommunityQuestions() {
  const qSnap = await getDocs(query(collection(db, `/artifacts/${appId}/public/community/questions`), orderBy('createdAt', 'desc')));
  const list = document.getElementById('questions-list');
  if (!list) return;

  if (qSnap.docs.length === 0) {
    list.innerHTML = `<p class="empty-note">No questions posted yet. Be the first to start a conversation!</p>`;
    return;
  }

  list.innerHTML = qSnap.docs.map(docSnap => {
    const d = docSnap.data();
    const when = d.createdAt?.toDate ? new Date(d.createdAt.toDate()).toLocaleDateString() : 'Recently';
    return `
      <div class="panel" style="padding:1.15rem;display:flex;flex-direction:column;gap:.6rem;" data-qid="${docSnap.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;">
          <div>
            <h4 style="font-size:1.05rem;font-weight:700;color:var(--text);margin:0 0 .25rem 0;">${escapeHtml(d.title)}</h4>
            <div style="font-size:.8rem;color:var(--muted);display:flex;align-items:center;gap:.4rem;">
              <span>by <strong>${escapeHtml(d.userName || 'Anonymous')}</strong></span>
              <span>•</span>
              <span>${when}</span>
            </div>
          </div>
          <button class="view-answers-btn btn btn-ghost btn-sm" data-qid="${docSnap.id}"><i class="fas fa-comments"></i> Answers</button>
        </div>
        <p style="font-size:.9rem;color:var(--text-soft);margin:0;line-height:1.5;">${escapeHtml(d.details)}</p>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.view-answers-btn').forEach(btn =>
    btn.addEventListener('click', () => showQuestionModal(btn.dataset.qid))
  );
}

export async function showQuestionModal(questionId) {
  if (!requireAuth()) return;
  const qSnap = await getDoc(doc(db, `/artifacts/${appId}/public/community/questions/${questionId}`));
  if (!qSnap.exists()) { alert('Question not found'); return; }
  const data = qSnap.data();
  const answersSnap = await getDocs(collection(db, `/artifacts/${appId}/public/community/questions/${questionId}/answers`));
  const when = data.createdAt?.toDate ? new Date(data.createdAt.toDate()).toLocaleString() : 'Recently';

  renderModal(`
    <div class="modal-body">
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;">
        <img src="${data.userAvatar || defaultAvatarFor()}" class="avatar-inline" alt="avatar">
        <div>
          <div style="font-weight:600;font-size:.92rem;color:var(--text);">${escapeHtml(data.userName || 'Anonymous')}</div>
          <div style="font-size:.78rem;color:var(--muted);">${when}</div>
        </div>
      </div>

      <h3 class="modal-title" style="margin-bottom:.5rem;">${escapeHtml(data.title)}</h3>
      <p style="color:var(--text-soft);font-size:.92rem;line-height:1.5;margin-bottom:1.25rem;">${escapeHtml(data.details)}</p>

      <div style="border-top:1px solid var(--line);padding-top:1rem;margin-bottom:1.25rem;">
        <h4 style="font-size:.95rem;font-weight:700;color:var(--text);margin-bottom:.75rem;">Community Answers (${answersSnap.docs.length})</h4>
        <div id="answers-list" style="display:flex;flex-direction:column;gap:.75rem;max-height:14rem;overflow-y:auto;padding-right:.25rem;">
          ${answersSnap.docs.length === 0 ? '<div style="font-size:.85rem;color:var(--muted);font-style:italic;">No answers yet. Share your thoughts below!</div>' : ''}
          ${answersSnap.docs.map(a => `
            <div style="background:var(--surface-2);border:1px solid var(--line-soft);border-radius:var(--radius-sm);padding:.75rem;">
              <div style="font-size:.82rem;font-weight:600;color:var(--teal);">${escapeHtml(a.data().userName || 'Anonymous')}</div>
              <div style="font-size:.88rem;color:var(--text);margin-top:.25rem;line-height:1.45;">${escapeHtml(a.data().text)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <form id="answer-form" style="display:flex;flex-direction:column;gap:.75rem;">
        <div>
          <label class="label">Your answer</label>
          <textarea name="answer" rows="2" class="field" placeholder="Share your knowledge or tip..." required></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-reply"></i> Submit Answer</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('answer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const d = Object.fromEntries(new FormData(e.target));
    try {
      await addDoc(collection(db, `/artifacts/${appId}/public/community/questions/${questionId}/answers`), {
        text: d.answer.trim(),
        userId: state.currentUser.uid,
        userName: state.currentUser.displayName || state.currentUser.email.split('@')[0],
        userAvatar: state.currentUser.avatarUrl || defaultAvatarFor(),
        timestamp: serverTimestamp()
      });
      closeModal();
      showQuestionModal(questionId);
    } catch (err) {
      console.error('answer error', err);
      alert('Failed to post answer');
    }
  });
}

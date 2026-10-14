// ratings.js — leaving a rating and computing a user's average rating (cached).

import { db, appId, collection, addDoc, getDocs, serverTimestamp } from './firebase.js';
import { state } from './state.js';
import { renderModal, closeModal } from './modal.js';
import { requireAuth } from './auth.js';

export async function showLeaveRatingModal(targetUserId) {
  if (!requireAuth()) return;
  if (!targetUserId) return;

  renderModal(`
    <div class="modal-body">
      <h3 class="modal-title" style="margin-bottom:.5rem;"><i class="fas fa-star" style="color:var(--gold);margin-right:.4rem;"></i> Rate Your Swap Experience</h3>
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:1.25rem;">
        Your feedback helps build trust in the skill-sharing community.
      </p>

      <form id="rating-form" style="display:flex;flex-direction:column;gap:1rem;">
        <div>
          <label class="label">How was your session?</label>
          <select name="score" class="field" required>
            <option value="5">★★★★★ (5 - Excellent mentor / swap)</option>
            <option value="4">★★★★☆ (4 - Very good session)</option>
            <option value="3">★★★☆☆ (3 - Okay / Average)</option>
            <option value="2">★★☆☆☆ (2 - Needs improvement)</option>
            <option value="1">★☆☆☆☆ (1 - Poor experience)</option>
          </select>
        </div>
        <div>
          <label class="label">Feedback or comments (optional)</label>
          <textarea name="comment" rows="3" class="field" placeholder="Tell neighbours about their teaching style, punctuality, or knowledge..."></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.6rem;margin-top:.5rem;">
          <button data-action="close-modal" type="button" class="btn btn-ghost btn-sm">Cancel</button>
          <button type="submit" id="submit-rating-btn" class="btn btn-primary btn-sm"><i class="fas fa-check"></i> Submit Rating</button>
        </div>
        <p id="rating-status" style="font-size:.85rem;margin:0;min-height:1rem;"></p>
      </form>
    </div>
  `);

  document.getElementById('rating-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-rating-btn');
    const statusEl = document.getElementById('rating-status');
    const d = Object.fromEntries(new FormData(e.target));

    try {
      btn.disabled = true;
      statusEl.textContent = 'Submitting rating...';
      statusEl.className = 'status-ok';

      await addDoc(collection(db, `/artifacts/${appId}/users/${targetUserId}/ratings`), {
        fromUserId: state.currentUser.uid,
        score: Number(d.score),
        comment: (d.comment || '').trim(),
        timestamp: serverTimestamp()
      });

      delete state.ratingCache[targetUserId];

      statusEl.textContent = 'Rating submitted! Thank you.';
      setTimeout(() => closeModal(), 700);
    } catch (err) {
      console.error('rating error', err);
      statusEl.textContent = 'Could not save rating. Please try again.';
      statusEl.className = 'status-err';
      btn.disabled = false;
    }
  });
}

export async function fetchAverageRating(userId) {
  if (!userId) return null;
  const cached = state.ratingCache[userId];
  if (cached && Date.now() - cached.ts < 60 * 1000) return cached.avg;
  try {
    const snaps = await getDocs(collection(db, `/artifacts/${appId}/users/${userId}/ratings`));
    const arr = snaps.docs.map(d => d.data().score).filter(s => typeof s === 'number');
    if (arr.length === 0) {
      state.ratingCache[userId] = { avg: null, ts: Date.now() };
      return null;
    }
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    state.ratingCache[userId] = { avg, ts: Date.now() };
    return avg;
  } catch (e) {
    console.error('avg rating error', e);
    return null;
  }
}

export function getCachedAverageRating(userId) {
  const c = state.ratingCache[userId];
  return c ? c.avg : null;
}

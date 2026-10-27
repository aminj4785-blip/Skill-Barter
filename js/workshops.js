// workshops.js — rendering the workshops grid and the workshop details modal
// in the unified dark design system.

import { escapeHtml, defaultAvatarFor } from './utils.js';
import { renderModal } from './modal.js';
import { requireAuth } from './auth.js';

export function renderWorkshops(ws) {
  const grid = document.getElementById('workshops-grid');
  if (!grid) return;

  if (!ws || ws.length === 0) {
    grid.innerHTML = `<p class="col-span-full empty-note">No upcoming workshops scheduled yet.</p>`;
    return;
  }

  grid.innerHTML = ws.map(w => {
    const avatar = w.organizerAvatar || defaultAvatarFor();
    const dateText = w.date?.toDate ? new Date(w.date.toDate()).toLocaleDateString() : 'Upcoming';
    return `
      <div class="workshop-card" data-id="${w.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.85rem;">
          <span style="font-size:.78rem;font-weight:700;color:var(--teal);letter-spacing:.05em;text-transform:uppercase;"><i class="fas fa-calendar-days"></i> ${dateText}</span>
          <span class="chip" style="font-size:.72rem;">Workshop</span>
        </div>
        <h3>${escapeHtml(w.title)}</h3>
        <p class="skill-desc">${escapeHtml(w.description || '')}</p>
        <div class="card-foot" style="margin-top:auto;">
          <img src="${avatar}" class="avatar-inline" alt="avatar">
          <div class="who">
            <div class="name">${escapeHtml(w.organizerName || w.organizerEmail || 'Organizer')}</div>
            <span class="skill-email">${escapeHtml(w.organizerEmail || '')}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function showWorkshopDetailsModal(w) {
  if (!requireAuth()) return;
  if (!w) return;
  const avatar = w.organizerAvatar || defaultAvatarFor();
  const dateText = w.date?.toDate ? new Date(w.date.toDate()).toLocaleString() : 'Date TBD';

  renderModal(`
    <div class="modal-body">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;">
        <span style="color:var(--teal);font-size:.85rem;font-weight:600;"><i class="fas fa-calendar-days"></i> ${dateText}</span>
        <span class="chip">Community Event</span>
      </div>

      <h2 class="modal-title" style="margin-bottom:.75rem;">${escapeHtml(w.title)}</h2>
      <p style="color:var(--text-soft);font-size:.95rem;line-height:1.55;margin-bottom:1.5rem;white-space:pre-wrap;">${escapeHtml(w.description || 'No description provided.')}</p>

      <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--line);padding-top:1rem;">
        <div style="display:flex;align-items:center;gap:.75rem;">
          <img src="${avatar}" class="avatar-inline" alt="avatar">
          <div>
            <div style="font-weight:600;font-size:.88rem;color:var(--text);">${escapeHtml(w.organizerName || w.organizerEmail || 'Organizer')}</div>
            <div style="font-size:.78rem;color:var(--muted);">${escapeHtml(w.organizerEmail || '')}</div>
          </div>
        </div>
        ${w.organizerEmail ? `<a href="mailto:${escapeHtml(w.organizerEmail)}" class="btn btn-primary btn-sm"><i class="fas fa-envelope"></i> Contact Host</a>` : ''}
      </div>
    </div>
  `);
}

// profile.js — the "My Profile" view: profile header + avatar upload (resumable,
// with progress and stall watchdog), public info, the user's posted skills grid, and edit-profile modal.

import { state } from './state.js';
import { db, storage, appId, doc, setDoc, sRef, uploadBytesResumable, getDownloadURL } from './firebase.js';
import { escapeHtml, defaultAvatarFor } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { renderSkills, showSkillDetailsModal } from './skills.js';
import { requireAuth } from './auth.js';
import { renderApp } from './layout.js';

export function getProfileHTML(mySkills) {
  const u = state.currentUser || {};
  return `
    <div class="section">
      <div class="wrap" style="max-width:56rem;">
        <div class="panel" style="margin-bottom:2rem;text-align:center;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:1.25rem;">
            <img id="profile-avatar" src="${u.avatarUrl || defaultAvatarFor()}" class="avatar-lg" alt="Profile avatar" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid var(--teal);box-shadow:0 0 20px rgba(45,212,191,0.25);">
            <div>
              <h1 style="font-size:1.85rem;font-weight:700;margin:0;color:var(--text);">${escapeHtml(u.displayName || u.email || 'User Profile')}</h1>
              <p style="color:var(--muted);font-size:.92rem;margin-top:.25rem;">${escapeHtml(u.email || '')}</p>
              ${u.bio ? `<p style="color:var(--text-soft);font-size:.95rem;margin-top:.75rem;max-width:32rem;line-height:1.5;">${escapeHtml(u.bio)}</p>` : ''}

              <div style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:.6rem;margin-top:1.25rem;">
                <button id="edit-profile-btn" class="btn btn-primary btn-sm"><i class="fas fa-pen"></i> Edit Profile</button>
                <input id="avatar-file-input" type="file" accept="image/*" style="display:none;">
                <button id="choose-avatar-btn" class="btn btn-ghost btn-sm"><i class="fas fa-image"></i> Change Avatar</button>
                <button id="upload-avatar-btn" class="btn btn-gold btn-sm"><i class="fas fa-cloud-arrow-up"></i> Upload</button>
              </div>

              <div id="avatar-status" style="margin-top:.6rem;font-size:.84rem;min-height:1.2rem;"></div>

              <div id="avatar-progress-container" class="hidden" style="width:100%;max-width:18rem;margin:0.75rem auto 0;background:var(--surface-2);border-radius:999px;height:8px;overflow:hidden;border:1px solid var(--line);">
                <div id="avatar-progress" style="background:var(--teal);height:100%;width:0%;transition:width .2s;"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel" style="margin-bottom:2rem;">
          <h2 style="font-size:1.25rem;font-weight:700;margin-bottom:1rem;color:var(--text);">Public Details</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:1rem;">
            <div style="background:var(--surface-2);padding:.85rem 1rem;border-radius:var(--radius-sm);border:1px solid var(--line);">
              <div style="font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Display Name</div>
              <div style="font-weight:600;color:var(--text);margin-top:.2rem;">${escapeHtml(u.displayName || 'Not set')}</div>
            </div>
            <div style="background:var(--surface-2);padding:.85rem 1rem;border-radius:var(--radius-sm);border:1px solid var(--line);">
              <div style="font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Location</div>
              <div style="font-weight:600;color:var(--text);margin-top:.2rem;">${escapeHtml(u.location || 'Local / Remote')}</div>
            </div>
            <div style="background:var(--surface-2);padding:.85rem 1rem;border-radius:var(--radius-sm);border:1px solid var(--line);">
              <div style="font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Phone</div>
              <div style="font-weight:600;color:var(--text);margin-top:.2rem;">${escapeHtml(u.phone || 'Not shared')}</div>
            </div>
          </div>
        </div>

        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
            <h2 style="font-size:1.35rem;font-weight:700;color:var(--text);margin:0;">My Posted Skills &amp; Requests</h2>
            <a href="#post-skill" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> Post New</a>
          </div>
          <div id="my-skills-grid" class="grid-cards">
            ${mySkills.length === 0 ? '<p class="col-span-full empty-note">You have not posted any skills or learning requests yet.</p>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function attachProfileEventListeners(mySkills) {
  renderSkills(mySkills, 'my-skills-grid');
  document.getElementById('my-skills-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.skill-card');
    if (card) showSkillDetailsModal(mySkills.find(s => s.id === card.dataset.id));
  });

  const chooseBtn = document.getElementById('choose-avatar-btn');
  const fileInput = document.getElementById('avatar-file-input');
  const uploadBtn = document.getElementById('upload-avatar-btn');
  const statusEl = document.getElementById('avatar-status');
  const profileAvatarImg = document.getElementById('profile-avatar');
  const progressContainer = document.getElementById('avatar-progress-container');
  const progressBar = document.getElementById('avatar-progress');

  if (chooseBtn && fileInput) chooseBtn.onclick = () => fileInput.click();
  if (fileInput) fileInput.onchange = (e) => {
    const f = e.target.files[0];
    if (f && profileAvatarImg) profileAvatarImg.src = URL.createObjectURL(f);
    if (statusEl) {
      statusEl.textContent = `Selected: ${f.name} (ready to upload)`;
      statusEl.className = 'status-ok';
    }
  };

  if (uploadBtn) uploadBtn.onclick = async () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      if (statusEl) { statusEl.textContent = 'Please choose an image file first.'; statusEl.className = 'status-err'; }
      return;
    }
    if (!state.currentUser?.uid) {
      if (statusEl) { statusEl.textContent = 'Not authenticated.'; statusEl.className = 'status-err'; }
      return;
    }

    uploadBtn.disabled = true;
    chooseBtn.disabled = true;
    if (statusEl) { statusEl.textContent = 'Starting upload...'; statusEl.className = 'status-ok'; }
    if (progressContainer) progressContainer.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '0%';

    try {
      const safeName = file.name.replace(/[^\w.-]/g, '_');
      const avatarPath = `artifacts/${appId}/users/${state.currentUser.uid}/avatar-${Date.now()}-${safeName}`;
      const uploadTask = uploadBytesResumable(sRef(storage, avatarPath), file, { contentType: file.type || 'image/*' });

      // 20-second stall watchdog timer
      let settled = false;
      const stallTimer = setTimeout(() => {
        if (settled) return;
        console.warn('avatar upload stalled — no progress in 20s');
        if (statusEl) {
          statusEl.textContent = 'Upload stalled. Check that Firebase Storage is enabled in console.';
          statusEl.className = 'status-err';
        }
        uploadBtn.disabled = false;
        chooseBtn.disabled = false;
      }, 20000);

      uploadTask.on('state_changed',
        (snapshot) => {
          const percent = snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
          if (progressBar) progressBar.style.width = percent + '%';
          if (statusEl) {
            statusEl.textContent = `Uploading... ${percent}%`;
            statusEl.className = 'status-ok';
          }
        },
        (err) => {
          settled = true;
          clearTimeout(stallTimer);
          console.error('upload error', err);
          if (statusEl) {
            statusEl.textContent = `Upload failed (${err.code || 'error'}): ${err.message || ''}`;
            statusEl.className = 'status-err';
          }
          uploadBtn.disabled = false;
          chooseBtn.disabled = false;
        },
        async () => {
          settled = true;
          clearTimeout(stallTimer);
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            await setDoc(doc(db, `/artifacts/${appId}/users/${state.currentUser.uid}`), { avatarUrl: url }, { merge: true });
            state.currentUser.avatarUrl = url;
            renderApp();
            if (statusEl) {
              statusEl.textContent = 'Avatar uploaded successfully!';
              statusEl.className = 'status-ok';
            }
          } catch (err) {
            console.error('post upload error', err);
            if (statusEl) {
              statusEl.textContent = 'Upload succeeded but profile update failed.';
              statusEl.className = 'status-err';
            }
          } finally {
            uploadBtn.disabled = false;
            chooseBtn.disabled = false;
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
          }
        }
      );
    } catch (err) {
      console.error('unexpected upload error', err);
      if (statusEl) {
        statusEl.textContent = 'Unexpected upload error.';
        statusEl.className = 'status-err';
      }
      uploadBtn.disabled = false;
      chooseBtn.disabled = false;
      if (progressContainer) progressContainer.classList.add('hidden');
    }
  };

  const editBtn = document.getElementById('edit-profile-btn');
  if (editBtn) editBtn.onclick = () => showEditProfileModal();
}

export function showEditProfileModal() {
  if (!requireAuth()) return;
  const u = state.currentUser || {};

  renderModal(`
    <div class="modal-body">
      <h2 class="modal-title" style="margin-bottom:1.25rem;">Edit Profile</h2>
      <form id="edit-profile-form" style="display:flex;flex-direction:column;gap:1rem;">
        <div>
          <label class="label">Display name</label>
          <input name="displayName" type="text" value="${escapeHtml(u.displayName || '')}" class="field" />
        </div>
        <div>
          <label class="label">Bio</label>
          <textarea name="bio" rows="3" class="field" placeholder="Tell the community about what you love doing or learning...">${escapeHtml(u.bio || '')}</textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <div>
            <label class="label">Location</label>
            <input name="location" value="${escapeHtml(u.location || '')}" class="field" placeholder="e.g. Downtown, Remote"/>
          </div>
          <div>
            <label class="label">Phone (optional)</label>
            <input name="phone" value="${escapeHtml(u.phone || '')}" class="field" placeholder="e.g. +1 555-0199"/>
          </div>
        </div>
        <div>
          <label class="label">Email (read-only)</label>
          <input name="email" type="email" value="${escapeHtml(u.email || '')}" class="field" style="opacity:.6;cursor:not-allowed;" readonly/>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.6rem;margin-top:.5rem;">
          <button type="button" data-action="close-modal" class="btn btn-ghost btn-sm">Cancel</button>
          <button id="save-profile-btn" type="submit" class="btn btn-primary btn-sm">Save Changes</button>
        </div>
        <p id="edit-profile-status" style="font-size:.85rem;margin:0;min-height:1rem;"></p>
      </form>
    </div>
  `);

  document.querySelector('[data-action="close-modal"]')?.addEventListener('click', closeModal);

  document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('edit-profile-status');
    const btn = document.getElementById('save-profile-btn');
    const fd = Object.fromEntries(new FormData(e.target));
    const updates = {
      displayName: (fd.displayName || '').trim(),
      bio: (fd.bio || '').trim(),
      location: (fd.location || '').trim(),
      phone: (fd.phone || '').trim()
    };
    try {
      btn.disabled = true;
      statusEl.textContent = 'Saving...';
      statusEl.className = 'status-ok';
      await setDoc(doc(db, `/artifacts/${appId}/users/${state.currentUser.uid}`), updates, { merge: true });
      state.currentUser = { ...state.currentUser, ...updates };
      renderApp();
      statusEl.textContent = 'Profile updated!';
      setTimeout(() => closeModal(), 600);
    } catch (err) {
      console.error('edit profile err', err);
      statusEl.textContent = 'Failed to save changes.';
      statusEl.className = 'status-err';
    } finally {
      btn.disabled = false;
    }
  });
}

// skills.js — skill cards, filters, posting form (Barter vs. Teach-Only vs. Learn-Only),
// and skill-details modal.

import { state } from './state.js';
import { db, appId, collection, addDoc, serverTimestamp } from './firebase.js';
import { escapeHtml, defaultAvatarFor, iconMap, isValidEmail } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { showAuthModal, requireAuth } from './auth.js';
import { getCachedAverageRating, fetchAverageRating } from './ratings.js';
import { showProposeSwapModal } from './swaps.js';
import { showToast } from './toast.js';
import { openChatModal } from './chat.js';

// A pre-decided list of common skills, grouped by category, so neighbours
// don't have to retype the same thing. Selecting one fills the field; choosing
// "Type your own skill…" opens a free-text input so nothing is ever lost.
// Each group maps to one of the four stored categories, so the Category
// dropdown stays in sync with the skill list the neighbour picked.
const CATEGORY_BY_GROUP = {
  'Music & Instruments': 'Creative',
  'Languages': 'Lifestyle',
  'Tech & Coding': 'Tech',
  'Creative & Arts': 'Creative',
  'Lifestyle & Cooking': 'Lifestyle',
  'Business & Marketing': 'Business'
};

const COMMON_SKILLS = [
  { label: 'Music & Instruments', skills: ['Acoustic Guitar', 'Electric Guitar', 'Piano', 'Violin', 'Drums', 'Ukulele', 'Singing', 'DJ / Mixing'] },
  { label: 'Languages', skills: ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Mandarin', 'Hindi', 'Arabic', 'Russian', 'English Tutoring'] },
  { label: 'Tech & Coding', skills: ['Python', 'JavaScript', 'Web Design', 'React', 'HTML/CSS', 'Data Analysis', 'Excel', 'SQL', 'Game Development', 'Photo/Film Editing', 'CLI / Linux'] },
  { label: 'Creative & Arts', skills: ['Drawing & Sketching', 'Painting', 'Photography', 'Graphic Design', 'Figma', '3D Modelling', 'Video Editing', 'Creative Writing', 'Poetry'] },
  { label: 'Lifestyle & Cooking', skills: ['Cooking', 'Baking', 'Yoga', 'Meditation', 'Fitness Training', 'Dance', 'Gardening', 'Knitting', 'Car Repair', 'Home Improvement'] },
  { label: 'Business & Marketing', skills: ['Public Speaking', 'Resume Writing', 'Marketing', 'Social Media Management', 'Sales Training', 'Budgeting', 'Pitch Deck Design'] },
];

// The four categories that actually get stored, in a fixed order.
const CATEGORIES = ['Tech', 'Creative', 'Lifestyle', 'Business'];

export function renderSkills(skillsToRender, containerId = 'skills-grid') {
  const grid = document.getElementById(containerId);
  if (!grid) return;

  if (!skillsToRender || skillsToRender.length === 0) {
    grid.innerHTML = `<p class="col-span-full empty-note">No matching skills found.</p>`;
    return;
  }

  grid.innerHTML = skillsToRender.map(skill => {
    const avatar = skill.userAvatar || skill.avatarUrl || defaultAvatarFor();
    const avgRating = skill.userId ? (getCachedAverageRating(skill.userId) || '') : '';
    const ratingHTML = avgRating ? `<span class="rating"><i class="fas fa-star"></i> ${avgRating.toFixed(1)}</span>` : '';
    const iconClass = iconMap[skill.category] || iconMap.Default || 'fa-graduation-cap';
    const intent = skill.intent || 'barter';

    let intentBadge = '';
    let swapDuality = '';

    if (intent === 'teach_only') {
      intentBadge = `<span class="swap-tag teach-only"><i class="fas fa-chalkboard-user"></i> Teaching Only</span>`;
      swapDuality = `
        <div class="swap-line">
          <span class="swap-tag offer"><i class="fas fa-hand-holding-heart"></i> Free / Volunteer</span>
        </div>`;
    } else if (intent === 'learn_only') {
      intentBadge = `<span class="swap-tag learn-only"><i class="fas fa-graduation-cap"></i> Wants to Learn</span>`;
      swapDuality = `
        <div class="swap-line">
          <span class="swap-tag want"><i class="fas fa-magnifying-glass"></i> Seeking Tutor/Mentor</span>
        </div>`;
    } else {
      intentBadge = `<span class="swap-tag barter-tag"><i class="fas fa-right-left"></i> Barter</span>`;
      const wantedText = skill.wanted ? escapeHtml(skill.wanted) : 'Open to offers';
      swapDuality = `
        <div class="swap-line">
          <span class="swap-tag offer" title="Skill offered"><i class="fas fa-arrow-up"></i> ${escapeHtml(skill.title)}</span>
          <span class="sep"><i class="fas fa-right-left"></i></span>
          <span class="swap-tag want" title="Skill wanted"><i class="fas fa-arrow-down"></i> ${wantedText}</span>
        </div>`;
    }

    return `
      <div class="skill-card" data-id="${skill.id}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;margin-bottom:.85rem;">
          <div class="skill-cat"><i class="fas ${iconClass}"></i></div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.35rem;">
            ${intentBadge}
            ${ratingHTML}
          </div>
        </div>

        <h3>${escapeHtml(skill.title)}</h3>
        <p class="skill-desc">${escapeHtml(skill.description || '')}</p>

        ${swapDuality}

        <div class="card-foot">
          <img src="${avatar}" class="avatar-inline" alt="">
          <div class="who">
            <div class="name">${escapeHtml(skill.displayName || 'Neighbor')}</div>
            <span class="skill-email">${escapeHtml(skill.userEmail || '')}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function renderPostSkillForm() {
  const formContainer = document.getElementById('post-skill-form');
  if (!formContainer) return;

  formContainer.innerHTML = `
    <div style="margin-bottom:1.25rem;">
      <label class="label">What is your intention?</label>
      <div class="intent-selector">
        <label class="intent-card selected" data-intent="barter">
          <input type="radio" name="intent" value="barter" checked>
          <span class="intent-icon"><i class="fas fa-right-left"></i></span>
          <span class="intent-title">Skill Barter</span>
          <span class="intent-desc">Trade what you know for what you want to learn</span>
        </label>
        <label class="intent-card" data-intent="teach_only">
          <input type="radio" name="intent" value="teach_only">
          <span class="intent-icon"><i class="fas fa-chalkboard-user"></i></span>
          <span class="intent-title">Offer to Teach</span>
          <span class="intent-desc">Volunteer/mentor others (no trade required)</span>
        </label>
        <label class="intent-card" data-intent="learn_only">
          <input type="radio" name="intent" value="learn_only">
          <span class="intent-icon"><i class="fas fa-graduation-cap"></i></span>
          <span class="intent-title">Request to Learn</span>
          <span class="intent-desc">Looking for someone to teach you a skill</span>
        </label>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;margin-bottom:1rem;">
      <div>
        <label class="label" id="title-label" for="post-skill-title">Skill you offer to teach</label>
        <select id="post-skill-title" name="title" class="field" required>
          <option value="">Choose a common skill…</option>
          ${COMMON_SKILLS.map((g, i) => `
            <option value="__grp_${i}" disabled>── ${g.label} ──</option>
            ${g.skills.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
          `).join('')}
          <option value="__other__" disabled>── Other ──</option>
          <option value="__other__">Type your own skill…</option>
        </select>
        <div id="custom-title-wrap" style="display:none;margin-top:.5rem;">
          <input id="post-skill-title-custom" name="title_custom" placeholder="Type your own skill, e.g. Kitesurfing" class="field">
        </div>
      </div>
      <div>
        <label class="label" for="post-skill-cat">Category</label>
        <select id="post-skill-cat" name="category" class="field" required>
          <option value="">Choose a category…</option>
          <option value="Music & Instruments">Music &amp; Instruments</option>
          <option value="Languages">Languages</option>
          <option value="Tech & Coding">Tech &amp; Coding</option>
          <option value="Creative & Arts">Creative &amp; Arts</option>
          <option value="Lifestyle & Cooking">Lifestyle &amp; Cooking</option>
          <option value="Business & Marketing">Business &amp; Marketing</option>
        </select>
      </div>
    </div>

    <div style="margin-bottom:1rem;">
      <label class="label" id="desc-label" for="post-skill-desc">Description</label>
      <textarea id="post-skill-desc" name="description" rows="3" placeholder="Tell neighbours what you'll cover or what level you're teaching..." class="field" required></textarea>
    </div>

    <div id="wanted-group" style="margin-bottom:1rem;">
      <label class="label" for="post-skill-wanted">What skill would you like in return?</label>
      <input id="post-skill-wanted" name="wanted" placeholder="e.g. Conversational French, Web Design (or leave blank for open offers)" class="field">
    </div>

    <div style="margin-bottom:1.5rem;">
      <label class="label" for="post-skill-tags">Tags (optional, comma-separated)</label>
      <input id="post-skill-tags" name="tags" placeholder="e.g. beginner, remote, evenings" class="field">
    </div>

    <button type="submit" id="post-skill-btn" class="btn btn-primary btn-block"><i class="fas fa-plus"></i> Post to Community</button>
    <p id="post-skill-status" style="text-align:center;margin-top:.75rem;min-height:1.2rem;font-size:.88rem;"></p>
  `;

  // Dynamically adapt form copy when user switches intent
  const intentCards = formContainer.querySelectorAll('.intent-card');
  const titleSelect = document.getElementById('post-skill-title');
  const customTitleWrap = document.getElementById('custom-title-wrap');
  const customTitleInput = document.getElementById('post-skill-title-custom');
  const descLabel = document.getElementById('desc-label');
  const descInput = document.getElementById('post-skill-desc');
  const wantedGroup = document.getElementById('wanted-group');
  const submitBtn = document.getElementById('post-skill-btn');

  // Switching between the pre-decided list and a custom skill
  titleSelect.addEventListener('change', () => {
    if (titleSelect.value === '__other__') {
      customTitleWrap.style.display = 'block';
      customTitleInput.required = true;
      titleSelect.required = false;
    } else {
      customTitleWrap.style.display = 'none';
      customTitleInput.required = false;
      titleSelect.required = true;
    }
  });

  intentCards.forEach(card => {
    card.addEventListener('click', () => {
      intentCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const val = card.dataset.intent;

      if (val === 'teach_only') {
        descLabel.textContent = 'What will you teach?';
        descInput.placeholder = 'Describe your lesson, background, or mentoring sessions...';
        wantedGroup.style.display = 'none';
        submitBtn.innerHTML = '<i class="fas fa-chalkboard-user"></i> Post Teaching Offer';
      } else if (val === 'learn_only') {
        descLabel.textContent = 'What specific topics do you need help with?';
        descInput.placeholder = 'Describe your learning goals, current level, and availability...';
        wantedGroup.style.display = 'none';
        submitBtn.innerHTML = '<i class="fas fa-graduation-cap"></i> Post Learning Request';
      } else {
        descLabel.textContent = 'Description';
        descInput.placeholder = 'Tell neighbours what you will cover or what level you are teaching...';
        wantedGroup.style.display = 'block';
        submitBtn.innerHTML = '<i class="fas fa-right-left"></i> Post Skill Barter';
      }
    });
  });

  formContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const statusEl = document.getElementById('post-skill-status');
    const formData = Object.fromEntries(new FormData(e.target));
    const selectedIntent = formContainer.querySelector('input[name="intent"]:checked')?.value || 'barter';

    // Resolve the final skill name: a picked common skill wins, otherwise the
    // custom text the neighbour typed in. Nothing is ever lost this way.
    let title = (formData.title || '').trim();
    if (title === '__other__') {
      title = (formData.title_custom || '').trim();
    }
    if (!title) {
      statusEl.textContent = 'Please pick a skill or type your own.';
      statusEl.className = 'status-err';
      showToast('Please pick a skill or type your own.', { type: 'error', title: 'Missing skill' });
      return;
    }

    const userEmail = state.currentUser.email || '';
    if (!isValidEmail(userEmail)) {
      statusEl.textContent = 'Your account does not have a valid email.';
      statusEl.className = 'status-err';
      showToast('Your account does not have a valid email.', { type: 'error', title: 'Invalid account' });
      return;
    }

    try {
      statusEl.textContent = 'Posting listing...';
      statusEl.className = 'status-ok';
      // Pop-up notification confirming the listing is live.
      const intentLabel = selectedIntent === 'teach_only' ? 'teaching offer'
        : selectedIntent === 'learn_only' ? 'learning request'
        : 'skill barter';
      showToast(`Your ${intentLabel} "${title}" is now live in the community.`, {
        type: 'success',
        title: 'Skill posted!',
        duration: 4500
      });

      await addDoc(collection(db, `/artifacts/${appId}/public/data/skills`), {
        title,
        category: formData.category,
        description: formData.description.trim(),
        wanted: selectedIntent === 'barter' ? (formData.wanted || '').trim() : '',
        intent: selectedIntent,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        userId: state.currentUser.uid,
        userEmail: userEmail,
        displayName: state.currentUser.displayName || userEmail.split('@')[0],
        userAvatar: state.currentUser.avatarUrl || defaultAvatarFor(),
        createdAt: serverTimestamp()
      });

      statusEl.textContent = 'Skill posted to community!';
      statusEl.className = 'status-ok';
      e.target.reset();
      // reset intent card and the custom-title toggle
      formContainer.querySelector('.intent-card[data-intent="barter"]')?.click();
      titleSelect.value = '';
      customTitleWrap.style.display = 'none';
      customTitleInput.required = false;
      titleSelect.required = true;
    } catch (err) {
      console.error('post skill error', err);
      statusEl.textContent = 'Error posting skill.';
      statusEl.className = 'status-err';
      showToast('Something went wrong while posting your skill. Please try again.', {
        type: 'error',
        title: 'Post failed'
      });
    }
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3500);
  });
}

export async function showSkillDetailsModal(skill) {
  if (!requireAuth()) return;
  if (!skill) return;
  const isOwn = state.currentUser && skill.userId === state.currentUser.uid;
  const avatar = skill.userAvatar || skill.avatarUrl || defaultAvatarFor();
  const avgRating = await fetchAverageRating(skill.userId);
  const intent = skill.intent || 'barter';

  let intentInfo = '';
  let mainActionBtn = '';

  if (intent === 'teach_only') {
    intentInfo = `
      <div class="swap-line" style="margin-top:.75rem;">
        <span class="swap-tag teach-only"><i class="fas fa-chalkboard-user"></i> Teaching Only</span>
        <span class="text-sm" style="color:var(--muted);">No return barter requested (Free/Volunteer lesson)</span>
      </div>`;
    if (!isOwn) {
      mainActionBtn = `<button class="chat-btn btn btn-primary btn-sm" data-uid="${skill.userId}"><i class="fas fa-comment"></i> Request Lesson</button>`;
    }
  } else if (intent === 'learn_only') {
    intentInfo = `
      <div class="swap-line" style="margin-top:.75rem;">
        <span class="swap-tag learn-only"><i class="fas fa-graduation-cap"></i> Seeking to Learn</span>
        <span class="text-sm" style="color:var(--muted);">Looking for a mentor or teacher</span>
      </div>`;
    if (!isOwn) {
      mainActionBtn = `<button class="chat-btn btn btn-gold btn-sm" data-uid="${skill.userId}"><i class="fas fa-chalkboard-user"></i> Offer to Teach</button>`;
    }
  } else {
    intentInfo = `
      <div class="swap-line" style="margin-top:.75rem;">
        <span class="swap-tag offer"><i class="fas fa-arrow-up"></i> Offers: ${escapeHtml(skill.title)}</span>
        <span class="sep"><i class="fas fa-right-left"></i></span>
        <span class="swap-tag want"><i class="fas fa-arrow-down"></i> Wants: ${escapeHtml(skill.wanted || 'Open to offers')}</span>
      </div>`;
    if (!isOwn) {
      mainActionBtn = `<button id="propose-swap-btn" class="btn btn-primary btn-sm"><i class="fas fa-right-left"></i> Propose Swap</button>`;
    }
  }

  renderModal(`
    <div class="modal-body">
      <div style="display:flex;align-items:center;gap:.9rem;margin-bottom:1rem;">
        <img src="${avatar}" class="avatar-inline" alt="">
        <div style="flex:1;min-width:0;">
          <h2 class="modal-title" style="margin:0;">${escapeHtml(skill.title)}</h2>
          <div style="font-size:.84rem;color:var(--muted);display:flex;align-items:center;gap:.5rem;margin-top:.2rem;">
            <span>by <strong>${escapeHtml(skill.displayName || skill.userEmail)}</strong></span>
            ${avgRating ? `<span class="rating"><i class="fas fa-star"></i> ${avgRating.toFixed(1)}</span>` : ''}
          </div>
        </div>
      </div>

      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1.25rem;">
        <p style="color:var(--text);font-size:.95rem;line-height:1.55;white-space:pre-wrap;">${escapeHtml(skill.description || 'No description provided.')}</p>
        ${intentInfo}
      </div>

      ${skill.tags && skill.tags.length > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.5rem;">
          ${skill.tags.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
        </div>` : ''}

      <div style="display:flex;align-items:center;justify-content:flex-end;gap:.6rem;border-top:1px solid var(--line-soft);padding-top:1rem;">
        ${mainActionBtn}
        ${!isOwn ? `<button class="chat-btn btn btn-ghost btn-sm" data-uid="${skill.userId}"><i class="fas fa-comment"></i> Chat</button>` : ''}
        ${!isOwn && skill.userEmail ? `<button class="email-btn btn btn-quiet btn-sm" data-email="${escapeHtml(skill.userEmail)}"><i class="fas fa-envelope"></i> Email</button>` : ''}
      </div>
    </div>
  `);

  document.querySelectorAll('.chat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal();
      openChatModal(skill.userId);
    });
  });

  document.querySelector('.email-btn')?.addEventListener('click', (e) => {
    const em = e.currentTarget.getAttribute('data-email');
    if (em) window.location.href = `mailto:${em}`;
  });

  document.getElementById('propose-swap-btn')?.addEventListener('click', async () => {
    closeModal();
    await showProposeSwapModal(skill);
  });
}

// layout.js — the app "shell": renders the navbar, routes between the home and
// profile views, builds the home page markup, and wires up the home-page events.

import { state } from './state.js';
import { auth, signOut } from './firebase.js';
import { defaultAvatarFor } from './utils.js';
import { renderSkills, renderPostSkillForm, showSkillDetailsModal } from './skills.js';
import { renderWorkshops, showWorkshopDetailsModal } from './workshops.js';
import { renderCommunity } from './community.js';
import { getProfileHTML, attachProfileEventListeners } from './profile.js';
import { openNotificationsModal } from './notifications.js';
import { showAuthModal, requireAuth } from './auth.js';
import { openChatModal } from './chat.js';
import { handleFindMatch } from './matcher.js';

function getNavbar() {
  return document.getElementById('navbar');
}

function getMainContent() {
  return document.getElementById('main-content');
}

// Active filter state
let currentIntentFilter = 'all';
let currentCategoryFilter = 'all';
let currentSearchTerm = '';

export function renderApp() {
  renderNavbar();
  attachNavbarEventListeners();
  renderView();
}

export function renderNavbar() {
  const navbar = getNavbar();
  if (!navbar) return;

  const signedIn = state.currentUser && !state.currentUser.isAnonymous;
  const unreadCount = state.notifications.filter(n => !n.read).length;

  const authButtons = (mobile = false) => {
    const size = mobile ? '' : 'btn-sm';
    if (signedIn) {
      return `
        <a href="#post-skill" class="btn btn-primary ${size} ${mobile ? 'btn-block' : ''}">Post a skill</a>
        <button data-action="logout" class="btn btn-ghost ${size} ${mobile ? 'btn-block' : ''}">Log out</button>
      `;
    }
    return `
      <button data-action="login" class="btn btn-quiet ${size} ${mobile ? 'btn-block' : ''}">Log in</button>
      <button data-action="signup" class="btn btn-primary ${size} ${mobile ? 'btn-block' : ''}">Sign up</button>
    `;
  };

  const bell = signedIn ? `
    <button data-action="open-notifs-modal" class="icon-btn" aria-label="Notifications">
      <i class="fas fa-bell"></i>
      ${unreadCount > 0 ? `<span class="badge-count">${unreadCount}</span>` : ''}
    </button>` : '';

  const avatarBtn = signedIn ? `
    <button data-action="profile" class="icon-btn" aria-label="Your profile" style="width:auto;padding:0;">
      <img src="${state.currentUser.avatarUrl || defaultAvatarFor()}" class="avatar-inline" alt="Your avatar">
    </button>` : '';

  navbar.innerHTML = `
    <div class="wrap nav-inner">
      <a href="#" data-action="home" class="brand">
        <span class="brand-mark"><i class="fas fa-right-left"></i></span>SkillBarter
      </a>

      <nav class="nav-links" aria-label="Primary">
        <a href="#browse" class="nav-link">Browse</a>
        <a href="#workshops" class="nav-link">Workshops</a>
        <a href="#matcher" class="nav-link">Matcher</a>
        <a href="#community" class="nav-link">Community</a>
      </nav>

      <div class="nav-right">
        ${bell}
        ${avatarBtn}
        ${!signedIn ? authButtons(false) : `<a href="#post-skill" class="btn btn-primary btn-sm">Post a skill</a><button data-action="logout" class="btn btn-ghost btn-sm">Log out</button>`}
        <button data-action="toggle-menu" class="icon-btn nav-toggle" aria-label="Menu"><i class="fas fa-bars"></i></button>
      </div>
    </div>

    <div id="mobile-menu" class="${state.isMenuOpen ? 'open' : ''} wrap">
      <a href="#browse">Browse</a>
      <a href="#workshops">Workshops</a>
      <a href="#matcher">Matcher</a>
      <a href="#community">Community</a>
      ${signedIn ? `<a href="#" data-action="profile">Your profile</a>` : ''}
      <div style="display:flex;flex-direction:column;gap:.5rem;padding:.75rem 1.5rem;">${authButtons(true)}</div>
    </div>
  `;
}

export function attachNavbarEventListeners() {
  const navbar = getNavbar();
  if (!navbar) return;

  if (state.navClickHandler) navbar.removeEventListener('click', state.navClickHandler);

  state.navClickHandler = async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action) {
      switch (action) {
        case 'home': state.currentView = 'home'; state.isMenuOpen = false; renderApp(); break;
        case 'profile':
          if (!requireAuth()) return;
          state.currentView = 'profile'; state.isMenuOpen = false; renderApp(); break;
        case 'logout': signOut(auth); break;
        case 'login': showAuthModal('login'); break;
        case 'signup': showAuthModal('signup'); break;
        case 'toggle-menu': state.isMenuOpen = !state.isMenuOpen; renderNavbar(); attachNavbarEventListeners(); break;
        case 'open-notifs-modal': openNotificationsModal(); break;
      }
      return;
    }
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      const id = link.getAttribute('href').replace('#', '');
      const internalSections = ['workshops', 'matcher', 'community', 'post-skill'];
      if (internalSections.includes(id)) {
        if (!requireAuth()) {
          e.preventDefault();
          return;
        }
      }
      state.currentView = 'home';
      state.isMenuOpen = false;
      renderApp();
      setTimeout(() => { const t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: 'smooth' }); }, 80);
      e.preventDefault();
      return;
    }
  };

  navbar.addEventListener('click', state.navClickHandler);
}

export function renderView() {
  const mainContent = getMainContent();
  if (!mainContent) return;

  const signedIn = state.currentUser && !state.currentUser.isAnonymous;
  if (state.currentView === 'profile') {
    if (!signedIn) {
      state.currentView = 'home';
      showAuthModal('login');
      return;
    }
    const mySkills = state.allSkills.filter(s => s.userId === state.currentUser.uid);
    mainContent.innerHTML = getProfileHTML(mySkills);
    attachProfileEventListeners(mySkills);
    return;
  }

  state.currentView = 'home';
  mainContent.innerHTML = getHomeHTML();
  applySkillFilters();
  if (signedIn) {
    renderWorkshops(state.allWorkshops);
  }
  attachHomeEventListeners();
}

export function getHomeHTML() {
  const count = state.allSkills.length;
  const signedIn = state.currentUser && !state.currentUser.isAnonymous;
  const statLine = count > 0
    ? `<strong>${count}</strong> ${count === 1 ? 'skill' : 'skills'} shared by the community so far`
    : `Be the first to share a skill with your community`;

  return `
    <header class="hero">
      <div class="wrap">
        <p class="hero-eyebrow">A neighbourhood skill exchange</p>
        <h1 class="hero-title">Trade what you know for what you want to learn.</h1>
        <p class="hero-lead">Here, skills are the currency. Offer something you're good at, find someone who needs it, and swap for a skill you want in return — no money changes hands.</p>

        <div class="hero-search">
          <input id="search-bar" type="text" class="field" placeholder="Search skills, e.g. &quot;guitar&quot; or &quot;spanish&quot;" aria-label="Search skills">
          <a href="#browse" class="btn btn-primary"><i class="fas fa-magnifying-glass"></i> Browse</a>
        </div>

        <div class="swap-viz" aria-hidden="true">
          <div class="swap-chip offer">
            <span class="chip-role">You offer</span>
            <span class="chip-value"><i class="fas fa-guitar"></i> Guitar lessons</span>
          </div>
          <div class="swap-arrow"><i class="fas fa-right-left"></i></div>
          <div class="swap-chip get">
            <span class="chip-role">You get</span>
            <span class="chip-value"><i class="fas fa-language"></i> Spanish</span>
          </div>
        </div>

        <p class="hero-stat">${statLine}</p>
      </div>
    </header>

    <section id="how-it-works" class="section">
      <div class="wrap">
        <div class="section-head">
          <h2 class="section-title">How a swap works</h2>
          <p class="section-sub">Three steps from stranger to skill shared.</p>
        </div>
        <div class="steps">
          <div class="step">
            <div class="step-num">1</div>
            <h3>Find a skill</h3>
            <p>Browse what people nearby can teach, want to learn, or trade.</p>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <h3>Propose or connect</h3>
            <p>Propose a 2-way barter swap or reach out directly to volunteer mentors and learners.</p>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <h3>Learn and rate</h3>
            <p>Swap over live video call or chat, then leave each other a rating.</p>
          </div>
        </div>
      </div>
    </section>

    <section id="browse" class="section section-alt">
      <div class="wrap">
        <div class="section-head">
          <h2 class="section-title">Browse skills &amp; requests</h2>
          <p class="section-sub">Filter by intention (Barter, Teaching Only, Learning Only) or category.</p>
        </div>

        <div class="filter-bar" id="intent-filter-bar">
          <div class="filter-pill ${currentIntentFilter === 'all' ? 'active' : ''}" data-intent-filter="all">
            <i class="fas fa-layer-group"></i> All Listings
          </div>
          <div class="filter-pill ${currentIntentFilter === 'barter' ? 'active' : ''}" data-intent-filter="barter">
            <i class="fas fa-right-left"></i> Barter Swaps
          </div>
          <div class="filter-pill ${currentIntentFilter === 'teach_only' ? 'active' : ''}" data-intent-filter="teach_only">
            <i class="fas fa-chalkboard-user"></i> Offering to Teach
          </div>
          <div class="filter-pill ${currentIntentFilter === 'learn_only' ? 'active' : ''}" data-intent-filter="learn_only">
            <i class="fas fa-graduation-cap"></i> Seeking to Learn
          </div>
        </div>

        <div class="filter-bar" id="cat-filter-bar" style="margin-top:-.5rem;margin-bottom:1.75rem;">
          <div class="filter-pill ${currentCategoryFilter === 'all' ? 'active' : ''}" data-cat-filter="all">All Categories</div>
          <div class="filter-pill ${currentCategoryFilter === 'Tech' ? 'active' : ''}" data-cat-filter="Tech"><i class="fas fa-code"></i> Tech</div>
          <div class="filter-pill ${currentCategoryFilter === 'Creative' ? 'active' : ''}" data-cat-filter="Creative"><i class="fas fa-palette"></i> Creative</div>
          <div class="filter-pill ${currentCategoryFilter === 'Lifestyle' ? 'active' : ''}" data-cat-filter="Lifestyle"><i class="fas fa-utensils"></i> Lifestyle</div>
          <div class="filter-pill ${currentCategoryFilter === 'Business' ? 'active' : ''}" data-cat-filter="Business"><i class="fas fa-briefcase"></i> Business</div>
        </div>

        <div id="skills-grid" class="grid-cards"></div>
      </div>
    </section>

    <section id="workshops" class="section">
      <div class="wrap">
        <div class="section-head">
          <h2 class="section-title">Workshops and events</h2>
          <p class="section-sub">Group sessions hosted by members near you.</p>
        </div>
        ${signedIn ? `
          <div id="workshops-grid" class="grid-cards"></div>
        ` : `
          <div class="panel member-lock" style="text-align:center;padding:2.5rem 1.5rem;max-width:38rem;margin:0 auto;background:var(--surface);">
            <div style="width:52px;height:52px;border-radius:50%;background:rgba(14,154,138,0.12);color:var(--teal);display:inline-flex;align-items:center;justify-content:center;font-size:1.4rem;margin-bottom:1rem;">
              <i class="fas fa-lock"></i>
            </div>
            <h3 style="font-size:1.2rem;font-weight:700;color:var(--text);margin-bottom:.5rem;">Workshops are exclusive to members</h3>
            <p style="color:var(--text-soft);font-size:.92rem;line-height:1.5;margin-bottom:1.5rem;">Log in or create a free account to join interactive community workshops, register for events, and host your own sessions.</p>
            <button class="btn btn-primary btn-sm login-trigger-btn"><i class="fas fa-arrow-right-to-bracket"></i> Log In to Access</button>
          </div>
        `}
      </div>
    </section>

    <section id="matcher" class="section section-alt">
      <div class="wrap">
        <div class="section-head" style="text-align:center;">
          <h2 class="section-title">AI Skill Matcher</h2>
          <p class="section-sub" style="margin-inline:auto;">Tell us what you can offer or want to learn, and we'll match you with compatible community members.</p>
        </div>
        ${signedIn ? `
          <div class="match-panel panel">
            <label class="label" for="user-skill-input">Enter a skill (e.g. Python, French, Acoustic Guitar, Graphic Design)</label>
            <input id="user-skill-input" type="text" class="field" placeholder="e.g. web design, guitar, Spanish...">
            <button id="find-match-btn" class="btn btn-primary btn-block" style="margin-top:1rem;"><i class="fas fa-wand-magic-sparkles"></i> Find compatible matches</button>
            <div id="ai-results" class="hidden" style="margin-top:1.5rem;"></div>
          </div>
        ` : `
          <div class="panel member-lock" style="text-align:center;padding:2.5rem 1.5rem;max-width:38rem;margin:0 auto;background:var(--surface);">
            <div style="width:52px;height:52px;border-radius:50%;background:rgba(14,154,138,0.12);color:var(--teal);display:inline-flex;align-items:center;justify-content:center;font-size:1.4rem;margin-bottom:1rem;">
              <i class="fas fa-lock"></i>
            </div>
            <h3 style="font-size:1.2rem;font-weight:700;color:var(--text);margin-bottom:.5rem;">AI Skill Matcher is a member feature</h3>
            <p style="color:var(--text-soft);font-size:.92rem;line-height:1.5;margin-bottom:1.5rem;">Sign in to find compatible barter partners, volunteer mentors, and learning opportunities matched to your exact interests.</p>
            <button class="btn btn-primary btn-sm login-trigger-btn"><i class="fas fa-wand-magic-sparkles"></i> Log In to Match</button>
          </div>
        `}
      </div>
    </section>

    <section id="community" class="section">
      <div class="wrap">
        <div class="section-head">
          <h2 class="section-title">Community Q&amp;A</h2>
          <p class="section-sub">Ask for advice, or share your knowledge.</p>
        </div>
        ${signedIn ? `
          <div id="community-container" style="max-width:52rem;"></div>
        ` : `
          <div class="panel member-lock" style="text-align:center;padding:2.5rem 1.5rem;max-width:38rem;margin:0 auto;background:var(--surface);">
            <div style="width:52px;height:52px;border-radius:50%;background:rgba(14,154,138,0.12);color:var(--teal);display:inline-flex;align-items:center;justify-content:center;font-size:1.4rem;margin-bottom:1rem;">
              <i class="fas fa-lock"></i>
            </div>
            <h3 style="font-size:1.2rem;font-weight:700;color:var(--text);margin-bottom:.5rem;">Community Q&amp;A is restricted to members</h3>
            <p style="color:var(--text-soft);font-size:.92rem;line-height:1.5;margin-bottom:1.5rem;">Log in to ask questions, read neighbor advice, and post helpful answers in our community discussion board.</p>
            <button class="btn btn-primary btn-sm login-trigger-btn"><i class="fas fa-comments"></i> Log In to Join Discussion</button>
          </div>
        `}
      </div>
    </section>

    <section id="post-skill" class="section section-alt">
      <div class="wrap" style="max-width:44rem;">
        <div class="section-head" style="text-align:center;">
          <h2 class="section-title">Post a Skill or Request</h2>
          <p class="section-sub" style="margin-inline:auto;">Choose whether to barter, volunteer to teach, or post a request to learn.</p>
        </div>
        ${signedIn ? `
          <div class="panel">
            <form id="post-skill-form"></form>
          </div>
        ` : `
          <div class="panel" style="text-align:center;padding:2.5rem 1.5rem;max-width:38rem;margin:0 auto;background:var(--surface);">
            <div style="width:52px;height:52px;border-radius:50%;background:rgba(45,212,191,0.12);color:var(--teal);display:inline-flex;align-items:center;justify-content:center;font-size:1.4rem;margin-bottom:1rem;">
              <i class="fas fa-lock"></i>
            </div>
            <h3 style="font-size:1.2rem;font-weight:700;color:var(--text);margin-bottom:.5rem;">Post your skill or learning request</h3>
            <p style="color:var(--text-soft);font-size:.92rem;line-height:1.5;margin-bottom:1.5rem;">Create a free account or log in to list skills you want to barter, volunteer to teach, or find mentors.</p>
            <button class="btn btn-primary btn-sm login-trigger-btn"><i class="fas fa-plus"></i> Log In to Post</button>
          </div>
        `}
      </div>
    </section>

    <footer class="footer">
      <div class="wrap footer-inner">
        <span class="brand" style="font-size:1rem;"><span class="brand-mark" style="width:26px;height:26px;font-size:.75rem;"><i class="fas fa-right-left"></i></span>SkillBarter</span>
        <span class="tiny">Skills are the currency. Trade &amp; learn generously.</span>
      </div>
    </footer>
  `;
}

function applySkillFilters() {
  let filtered = state.allSkills;

  if (currentIntentFilter !== 'all') {
    filtered = filtered.filter(s => (s.intent || 'barter') === currentIntentFilter);
  }

  if (currentCategoryFilter !== 'all') {
    filtered = filtered.filter(s => (s.category || '').toLowerCase() === currentCategoryFilter.toLowerCase());
  }

  if (currentSearchTerm) {
    filtered = filtered.filter(s =>
      (s.title || '').toLowerCase().includes(currentSearchTerm) ||
      (s.description || '').toLowerCase().includes(currentSearchTerm) ||
      (s.wanted || '').toLowerCase().includes(currentSearchTerm) ||
      (s.tags || []).some(t => t.toLowerCase().includes(currentSearchTerm))
    );
  }

  renderSkills(filtered);
}

function attachHomeEventListeners() {
  const signedIn = state.currentUser && !state.currentUser.isAnonymous;

  document.getElementById('search-bar')?.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.toLowerCase().trim();
    applySkillFilters();
  });

  document.getElementById('intent-filter-bar')?.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-intent-filter]');
    if (!pill) return;
    document.querySelectorAll('#intent-filter-bar .filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentIntentFilter = pill.dataset.intentFilter;
    applySkillFilters();
  });

  document.getElementById('cat-filter-bar')?.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-cat-filter]');
    if (!pill) return;
    document.querySelectorAll('#cat-filter-bar .filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentCategoryFilter = pill.dataset.catFilter;
    applySkillFilters();
  });

  document.getElementById('skills-grid')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('chat-btn')) {
      const uid = e.target.getAttribute('data-uid');
      openChatModal(uid);
      return;
    }
    if (e.target.classList.contains('email-btn')) {
      const email = e.target.getAttribute('data-email');
      if (email) window.location.href = `mailto:${email}`;
      return;
    }
    const card = e.target.closest('.skill-card');
    if (card) {
      const skill = state.allSkills.find(s => s.id === card.dataset.id);
      showSkillDetailsModal(skill);
    }
  });

  document.querySelectorAll('.login-trigger-btn').forEach(btn => {
    btn.addEventListener('click', () => showAuthModal('login'));
  });

  if (signedIn) {
    document.getElementById('workshops-grid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.workshop-card');
      if (card) {
        const w = state.allWorkshops.find(x => x.id === card.dataset.id);
        showWorkshopDetailsModal(w);
      }
    });

    document.getElementById('find-match-btn')?.addEventListener('click', handleFindMatch);
    renderPostSkillForm();
    renderCommunity();
  }
}


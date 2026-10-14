// auth.js — authentication. Registers the auth-state listener (runs on load and on
// every sign-in/out), exposes the login/signup modal, and a small requireAuth() guard
// that many features use to bounce anonymous users to the login screen.

import {
  auth, db, appId,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  doc, getDoc, setDoc, collection, onSnapshot, query, orderBy, serverTimestamp
} from './firebase.js';
import { state } from './state.js';
import { defaultAvatarFor, isValidEmail } from './utils.js';
import { renderModal, closeModal } from './modal.js';
import { attachDataListeners, detachDataListeners } from './data.js';
import { renderApp, renderNavbar } from './layout.js';

// Returns true when a real (non-anonymous) user is signed in; otherwise opens the
// login modal and returns false. Use as: `if (!requireAuth()) return;`
export function requireAuth() {
  if (!state.currentUser) { showAuthModal('login'); return false; }
  return true;
}

onAuthStateChanged(auth, async (user) => {
  detachDataListeners();
  state.allSkills = [];
  state.allWorkshops = [];
  state.notifications = [];

  if (user) {
    const userDocRef = doc(db, `/artifacts/${appId}/users/${user.uid}`);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      state.currentUser = { uid: user.uid, ...userDocSnap.data() };
      if (!state.currentUser.avatarUrl) state.currentUser.avatarUrl = user.photoURL || defaultAvatarFor();
    } else {
      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
      state.currentUser = {
        uid: user.uid, email: user.email, displayName,
        isAnonymous: user.isAnonymous, avatarUrl: user.photoURL || defaultAvatarFor()
      };
      try {
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email || '',
          displayName,
          avatarUrl: state.currentUser.avatarUrl,
          createdAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn('Could not create user doc on auth change', err);
      }
    }

    attachDataListeners();

    const notifsCollection = collection(db, `/artifacts/${appId}/users/${user.uid}/notifications`);
    state.unsubNotifications = onSnapshot(query(notifsCollection, orderBy('timestamp', 'desc')), (snap) => {
      state.notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderNavbar();
    }, (err) => console.error('notifications listener error', err));
  } else {
    state.currentUser = null;
    attachDataListeners();
  }

  renderApp();
});

export function showAuthModal(mode = 'login') {
  renderModal(`
    <div class="modal-body">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
        <h2 class="modal-title" style="margin:0;">${mode === 'signup' ? 'Join SkillBarter' : 'Welcome back'}</h2>
        <div style="font-size:.84rem;">
          <a href="#" id="switch-auth-mode" style="color:var(--teal);text-decoration:underline;">
            ${mode === 'signup' ? 'Have an account? Log in' : 'No account? Sign up'}
          </a>
        </div>
      </div>
      <div id="auth-error" class="status-err" style="font-size:.85rem;margin-bottom:.75rem;min-height:1rem;"></div>

      <form id="login-form" class="${mode === 'login' ? '' : 'hidden'}" style="display:flex;flex-direction:column;gap:.9rem;">
        <div>
          <label class="label">Email address</label>
          <input name="email" type="email" placeholder="you@domain.com" required class="field" />
        </div>
        <div>
          <label class="label">Password</label>
          <input name="password" type="password" placeholder="••••••••" required class="field" />
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:.5rem;">
          <button type="submit" class="btn btn-primary btn-block"><i class="fas fa-arrow-right-to-bracket"></i> Log In</button>
        </div>
      </form>

      <form id="signup-form" class="${mode === 'signup' ? '' : 'hidden'}" style="display:flex;flex-direction:column;gap:.9rem;">
        <div>
          <label class="label">Display name (optional)</label>
          <input name="displayName" type="text" placeholder="e.g. Maya Chen" class="field" />
        </div>
        <div>
          <label class="label">Email address</label>
          <input name="email" type="email" placeholder="you@domain.com" required class="field" />
        </div>
        <div>
          <label class="label">Password (min 6 characters)</label>
          <input name="password" type="password" placeholder="••••••••" required class="field" />
        </div>
        <div>
          <label class="label">Confirm password</label>
          <input name="passwordConfirm" type="password" placeholder="••••••••" required class="field" />
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:.5rem;">
          <button type="submit" class="btn btn-primary btn-block"><i class="fas fa-user-plus"></i> Create Account</button>
        </div>
      </form>
    </div>
  `);

  const switchLink = document.getElementById('switch-auth-mode');
  if (switchLink) {
    switchLink.addEventListener('click', (e) => {
      e.preventDefault();
      const loginForm = document.getElementById('login-form');
      const signupForm = document.getElementById('signup-form');
      const err = document.getElementById('auth-error');
      const modalTitle = document.querySelector('.modal-title');
      const showingLogin = !loginForm.classList.contains('hidden');

      if (showingLogin) {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        switchLink.textContent = 'Have an account? Log in';
        if (modalTitle) modalTitle.textContent = 'Join SkillBarter';
      } else {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        switchLink.textContent = 'No account? Sign up';
        if (modalTitle) modalTitle.textContent = 'Welcome back';
      }
      if (err) err.textContent = '';
    });
  }

  const errEl = document.getElementById('auth-error');

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      errEl.textContent = '';
      if (!isValidEmail(data.email)) {
        errEl.textContent = 'Please enter a valid email address.';
        return;
      }
      try {
        await signInWithEmailAndPassword(auth, data.email.trim(), data.password);
        closeModal();
      } catch (err) {
        console.error('login error', err);
        errEl.textContent = (err && err.message) ? err.message : 'Login failed';
      }
    });
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      errEl.textContent = '';
      if (!data.email || !data.password || !data.passwordConfirm) {
        errEl.textContent = 'Please fill required fields.';
        return;
      }
      if (!isValidEmail(data.email)) {
        errEl.textContent = 'Please enter a valid email address.';
        return;
      }
      if (data.password.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.';
        return;
      }
      if (data.password !== data.passwordConfirm) {
        errEl.textContent = 'Passwords do not match.';
        return;
      }
      try {
        const cred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
        const user = cred.user;
        const displayName = (data.displayName && data.displayName.trim()) || (user.email ? user.email.split('@')[0] : 'User');
        await setDoc(doc(db, `/artifacts/${appId}/users/${user.uid}`), {
          uid: user.uid,
          email: user.email || '',
          displayName,
          avatarUrl: defaultAvatarFor(),
          createdAt: serverTimestamp()
        }, { merge: true });
        closeModal();
      } catch (err) {
        console.error('signup error', err);
        errEl.textContent = (err && err.message) ? err.message : 'Signup failed';
      }
    });
  }
}

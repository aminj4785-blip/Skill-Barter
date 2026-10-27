// toast.js — lightweight pop-up notifications (toasts) that slide in at the
// bottom-right of the screen, auto-dismiss after a few seconds, and can be
// closed early by clicking them. Any module can call showToast(); the post-skill
// flow uses it to confirm a listing went live.

const ICONS = {
  success: 'fa-circle-check',
  error: 'fa-circle-exclamation',
  info: 'fa-circle-info'
};

let toastContainer = null;

function getToastContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Show a pop-up notification.
 * @param {string} message  Text to display (rendered as plain text — safe).
 * @param {object} options  { type: 'success'|'error'|'info', duration: ms, title }
 */
export function showToast(message, { type = 'success', duration = 4000, title = '' } = {}) {
  const container = getToastContainer();
  const icon = ICONS[type] || ICONS.info;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const iconEl = document.createElement('i');
  iconEl.className = `fas ${icon} toast-icon`;

  const body = document.createElement('div');
  body.className = 'toast-body';

  if (title) {
    const titleEl = document.createElement('strong');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;
    body.appendChild(titleEl);
  }

  const msgEl = document.createElement('span');
  msgEl.className = 'toast-message';
  msgEl.textContent = message;
  body.appendChild(msgEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.innerHTML = '&times;';

  toast.append(iconEl, body, closeBtn);
  container.appendChild(toast);

  // requestAnimationFrame so the CSS enter-transition actually plays
  requestAnimationFrame(() => toast.classList.add('show'));

  let dismissTimer = null;
  const dismiss = () => {
    if (toast.dataset.dismissed) return;
    toast.dataset.dismissed = '1';
    clearTimeout(dismissTimer);
    toast.classList.remove('show');
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400); // fallback if animationend never fires
  };

  closeBtn.addEventListener('click', dismiss);
  toast.addEventListener('click', (e) => { if (e.target !== closeBtn) dismiss(); });

  if (duration > 0) dismissTimer = setTimeout(dismiss, duration);

  return dismiss;

// modal.js — the one modal container every feature reuses.
//
// renderModal(html, { variant }) drops content into #modal-container inside a
// dark .modal-panel and shows a floating .modal-close button.
//   * Default modals: clicking the backdrop or the × closes them (wired here).
//   * variant 'chat' | 'call': these own realtime listeners / media streams, so
//     they must clean up on close. We DON'T auto-wire close for them and we
//     DON'T close on backdrop click — the feature module wires the × itself
//     (e.g. unsubscribe(), stop camera) so nothing is left running.

function getModalContainer() {
  return document.getElementById('modal-container');
}

export function renderModal(content, { variant = '' } = {}) {
  const modalContainer = getModalContainer();
  if (!modalContainer) return;

  const ownsClose = variant === 'chat' || variant === 'call';

  modalContainer.innerHTML = `
    <div id="modal-backdrop" class="modal-backdrop">
      <div class="modal-panel ${variant}">
        <button data-action="close-modal" class="modal-close" aria-label="Close">&times;</button>
        ${content}
      </div>
    </div>
  `;

  if (!ownsClose) {
    modalContainer.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });
    modalContainer.querySelector('[data-action="close-modal"]')?.addEventListener('click', closeModal);
  }
}

export function closeModal() {
  const modalContainer = getModalContainer();
  if (modalContainer) {
    modalContainer.innerHTML = '';
  }
}

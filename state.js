// state.js — shared, mutable application state.
// One object imported everywhere so any module can read/update the same values.
// (You can't reassign an imported `let` across modules, but you CAN mutate the
// properties of a shared object — which is why state lives on this single object.)

export const state = {
  currentUser: null,
  allSkills: [],
  allWorkshops: [],
  notifications: [],
  currentView: 'home',
  isMenuOpen: false,
  unsubSkills: () => {},
  unsubWorkshops: () => {},
  unsubNotifications: () => {},
  navClickHandler: null,
  activeCallCleanup: null,
  ratingCache: {}
};

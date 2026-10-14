// matcher.js — the "AI Skill Matcher": normalize text, expand synonyms, fuzzy-match
// (Levenshtein), score each skill based on intent, and render modern suggestions.

import { state } from './state.js';
import { escapeHtml, defaultAvatarFor } from './utils.js';
import { requireAuth } from './auth.js';
import { openChatModal } from './chat.js';
import { showSkillDetailsModal } from './skills.js';

// Unicode punctuation normalization
const UNICODE_PUNCT = new RegExp(
  '[' +
  String.fromCharCode(0x2000) + '-' + String.fromCharCode(0x206F) +
  String.fromCharCode(0x2E00) + '-' + String.fromCharCode(0x2E7F) +
  ']',
  'g'
);
const ASCII_PUNCT = /[\\'!"#$%&()*+,\-.\/:;<=>?@[\]^_`{|}~]/g;

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(UNICODE_PUNCT, ' ')
    .replace(ASCII_PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

const SYNONYMS = {
  gaming: ['gaming', 'game', 'games', 'gameplay', 'unity', 'unreal', 'game dev', 'game-dev'],
  design: ['design', 'ux', 'ui', 'graphic', 'graphics', 'photoshop', 'figma', 'illustrator'],
  coding: ['code', 'coding', 'programming', 'developer', 'development', 'dev', 'javascript', 'python', 'java', 'react', 'node', 'c++', 'rust'],
  web: ['web', 'website', 'react', 'vue', 'angular', 'frontend', 'backend', 'fullstack', 'wordpress', 'html', 'css'],
  ai: ['ai', 'machine learning', 'ml', 'artificial intelligence', 'tensorflow', 'pytorch', 'deep learning'],
  music: ['music', 'audio', 'mixing', 'production', 'beat', 'guitar', 'piano', 'singing', 'drums'],
  language: ['language', 'english', 'spanish', 'french', 'german', 'japanese', 'chinese', 'mandarin', 'italian']
};

function expandSynonyms(input) {
  const words = normalize(input).split(' ').filter(Boolean);
  const expanded = new Set(words);
  for (const w of words) if (SYNONYMS[w]) SYNONYMS[w].forEach(s => expanded.add(s));
  return Array.from(expanded);
}

function computeMatchScore(skill, userTerms) {
  const weights = { wanted: 4, title: 4, description: 2, category: 2, tags: 3 };
  let score = 0;
  const title = normalize(skill.title || '');
  const description = normalize(skill.description || '');
  const wanted = normalize(skill.wanted || '');
  const category = normalize(skill.category || '');
  const tags = (skill.tags || []).map(t => normalize(t));

  for (const term of userTerms) {
    if (wanted.includes(term)) score += weights.wanted;
    if (title.includes(term)) score += weights.title;
    if (description.includes(term)) score += weights.description;
    if (category.includes(term)) score += weights.category;
    if (tags.some(t => t.includes(term))) score += weights.tags;

    const fuzzyThreshold = 2;
    const skillTextTokens = (title + ' ' + description + ' ' + wanted + ' ' + category).split(' ').filter(Boolean);
    for (const token of skillTextTokens) {
      const dist = levenshtein(term, token);
      if (dist <= fuzzyThreshold && Math.abs(token.length - term.length) <= 4) {
        score += 1;
        break;
      }
    }
  }

  // Boost for complementary intents
  if (skill.intent === 'teach_only' || skill.intent === 'learn_only') {
    score += 1;
  }

  return score;
}

export function handleFindMatch() {
  if (!requireAuth()) return;
  const input = document.getElementById('user-skill-input');
  const resultsDiv = document.getElementById('ai-results');
  if (!input || !input.value.trim()) {
    alert('Please enter a skill.');
    return;
  }

  resultsDiv.classList.remove('hidden');
  resultsDiv.innerHTML = `
    <div style="text-align:center;padding:1.5rem;color:var(--muted);">
      <i class="fas fa-spinner fa-spin" style="margin-right:.5rem;color:var(--teal);"></i> Analyzing skills and community requests...
    </div>`;

  const userTerms = expandSynonyms(input.value.trim().toLowerCase());
  const scored = state.allSkills
    .filter(s => s.userId !== state.currentUser?.uid)
    .map(skill => ({ skill, score: computeMatchScore(skill, userTerms) }));

  let matching = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  if (matching.length === 0) {
    const term = normalize(input.value.trim());
    matching = state.allSkills
      .filter(s => s.userId !== state.currentUser?.uid)
      .map(skill => {
        const combined = normalize((skill.title || '') + ' ' + (skill.description || '') + ' ' + (skill.wanted || '') + ' ' + (skill.category || ''));
        return { skill, score: combined.includes(term) ? 1 : 0 };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  if (matching.length === 0) {
    matching = state.allSkills
      .filter(s => s.userId !== state.currentUser?.uid)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map(s => ({ skill: s, score: 0 }));
  }

  const top = matching.slice(0, 3).map(m => m.skill);
  if (top.length === 0) {
    resultsDiv.innerHTML = `<p style="color:var(--danger);text-align:center;padding:1rem;">No matching skills found yet in the community.</p>`;
    return;
  }

  resultsDiv.innerHTML = `
    <h3 style="font-size:1.15rem;margin-bottom:1rem;color:var(--text);display:flex;align-items:center;gap:.5rem;">
      <i class="fas fa-sparkles" style="color:var(--gold);"></i> Top Recommended Matches:
    </h3>
    <div style="display:flex;flex-direction:column;gap:.9rem;">
      ${top.map(skill => {
        const intent = skill.intent || 'barter';
        let badge = '';
        if (intent === 'teach_only') {
          badge = `<span class="swap-tag teach-only"><i class="fas fa-chalkboard-user"></i> Teaching Only</span>`;
        } else if (intent === 'learn_only') {
          badge = `<span class="swap-tag learn-only"><i class="fas fa-graduation-cap"></i> Wants to Learn</span>`;
        } else {
          badge = `<span class="swap-tag barter-tag"><i class="fas fa-right-left"></i> Barter</span>`;
        }

        return `
          <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:1rem;display:flex;flex-direction:column;gap:.6rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;">
              <span style="font-weight:700;font-size:1.05rem;color:var(--text);">${escapeHtml(skill.title)}</span>
              ${badge}
            </div>
            <p style="font-size:.88rem;color:var(--muted);margin:0;line-height:1.45;">
              ${escapeHtml(skill.description ? skill.description.substring(0, 120) : '')}${skill.description && skill.description.length > 120 ? '...' : ''}
            </p>
            ${intent === 'barter' ? `
              <div style="font-size:.82rem;color:var(--text);">
                <strong>Wants:</strong> ${escapeHtml(skill.wanted || 'Open to offers')}
              </div>
            ` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:.4rem;padding-top:.6rem;border-top:1px solid var(--line-soft);">
              <span style="font-size:.82rem;color:var(--muted);">By <strong>${escapeHtml(skill.displayName || skill.userEmail)}</strong></span>
              <div style="display:flex;gap:.5rem;">
                <button class="view-match-skill btn btn-quiet btn-sm" data-id="${skill.id}">View Details</button>
                <button class="chat-match-user btn btn-primary btn-sm" data-uid="${skill.userId}"><i class="fas fa-comment"></i> Chat</button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  resultsDiv.querySelectorAll('.chat-match-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.uid;
      if (uid) openChatModal(uid);
    });
  });

  resultsDiv.querySelectorAll('.view-match-skill').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = state.allSkills.find(item => item.id === btn.dataset.id);
      if (s) showSkillDetailsModal(s);
    });
  });
}

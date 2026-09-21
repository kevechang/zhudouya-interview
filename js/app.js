(function () {
  'use strict';

  // -------------------------------------------------------------
  // Storage & State Management
  // -------------------------------------------------------------
  const STORAGE_KEY = 'zdy.progress.v1';
  const MODE_STORAGE_KEY = 'zdy.mode.v1';
  const BANNER_STORAGE_KEY = 'zdy.banner.plain_hint.v1';

  function getProgress() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn('Failed to read progress from localStorage:', e);
      return {};
    }
  }

  function saveProgress(progress) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      console.warn('Failed to save progress to localStorage:', e);
    }
  }

  function setCardStatus(cardId, status) {
    const progress = getProgress();
    progress[cardId] = status; // 'known' | 'unknown'
    saveProgress(progress);
  }

  function clearAllProgress() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear progress:', e);
    }
  }

  function getMode() {
    try {
      const mode = localStorage.getItem(MODE_STORAGE_KEY);
      return mode === 'plain' ? 'plain' : 'pro';
    } catch (e) {
      console.warn('Failed to read mode from localStorage:', e);
      return 'pro';
    }
  }

  function setMode(mode) {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode === 'plain' ? 'plain' : 'pro');
    } catch (e) {
      console.warn('Failed to save mode to localStorage:', e);
    }
  }

  function renderModeSwitcher() {
    const currentMode = getMode();
    return `
      <div class="mode-switcher" role="radiogroup" aria-label="展示模式">
        <button type="button" class="mode-switcher-btn ${currentMode === 'pro' ? 'active' : ''}" data-mode="pro" aria-label="专业版">专业版</button>
        <button type="button" class="mode-switcher-btn ${currentMode === 'plain' ? 'active' : ''}" data-mode="plain" aria-label="通俗版">通俗版</button>
      </div>
    `;
  }

  function bindModeSwitcherEvents(onSwitch) {
    const btns = appEl.querySelectorAll('.mode-switcher-btn');
    btns.forEach(btn => {
      btn.onclick = function (e) {
        e.stopPropagation();
        const targetMode = this.getAttribute('data-mode');
        if (targetMode && targetMode !== getMode()) {
          setMode(targetMode);
          if (typeof onSwitch === 'function') {
            onSwitch(targetMode);
          } else {
            renderRoute();
          }
        }
      };
    });
  }

  function getDeckStats(cardsList) {
    if (!cardsList || cardsList.length === 0) {
      return { total: 0, known: 0, unknown: 0, percent: 0 };
    }
    const progress = getProgress();
    let known = 0;
    let unknown = 0;
    for (const card of cardsList) {
      if (progress[card.id] === 'known') known++;
      else if (progress[card.id] === 'unknown') unknown++;
    }
    const percent = Math.round((known / cardsList.length) * 100);
    return { total: cardsList.length, known, unknown, percent };
  }

  function getOverallStats() {
    const companies = window.ZDY_COMPANIES || [];
    const allCardsMap = window.ZDY_CARDS || {};
    let allCards = [];
    if (allCardsMap.common) allCards = allCards.concat(allCardsMap.common);
    for (const c of companies) {
      if (allCardsMap[c.slug]) {
        allCards = allCards.concat(allCardsMap[c.slug]);
      }
    }
    return getDeckStats(allCards);
  }

  // -------------------------------------------------------------
  // Simple Markdown Parser for Answers
  // -------------------------------------------------------------
  function parseMarkdown(md) {
    if (!md) return '';
    
    // Normalize newlines
    let text = md.replace(/\r\n/g, '\n');

    // Clean LaTeX math symbols $$...$$ and $...$ into readable text
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, function(m, p1) {
      return '<code>' + escapeHtml(p1.trim().replace(/\\text\{([^}]+)\}/g, '$1').replace(/\\times/g, '×').replace(/\\le/g, '≤').replace(/\\ge/g, '≥')) + '</code>';
    });
    text = text.replace(/\$([^\$\n]+)\$/g, function(m, p1) {
      return '<code>' + escapeHtml(p1.trim().replace(/\\text\{([^}]+)\}/g, '$1').replace(/\\times/g, '×').replace(/\\le/g, '≤').replace(/\\ge/g, '≥')) + '</code>';
    });

    // Split into paragraphs by double newlines
    const paragraphs = text.split(/\n{2,}/);
    let html = '';

    for (let para of paragraphs) {
      para = para.trim();
      if (!para) continue;

      // Check if this paragraph is an unordered list
      const lines = para.split('\n');
      const isList = lines.every(l => l.trim().startsWith('- ') || l.trim().startsWith('* '));

      if (isList) {
        html += '<ul>';
        for (const line of lines) {
          const itemText = line.trim().replace(/^[-*]\s+/, '');
          html += '<li>' + formatInline(itemText) + '</li>';
        }
        html += '</ul>';
      } else {
        // Normal paragraph (may have single newlines inside)
        const formatted = lines.map(l => formatInline(l)).join('<br>');
        html += '<p>' + formatted + '</p>';
      }
    }

    return html;
  }

  function formatInline(str) {
    let s = escapeHtml(str);
    // Bold: **text**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Code: `code`
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // -------------------------------------------------------------
  // Custom Modal (NO window.confirm)
  // -------------------------------------------------------------
  function showConfirmModal(title, msg, onConfirm) {
    const modal = document.getElementById('modal-dialog');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-msg');
    const btnCancel = document.getElementById('modal-btn-cancel');
    const btnConfirm = document.getElementById('modal-btn-confirm');

    titleEl.textContent = title;
    msgEl.textContent = msg;
    modal.classList.add('show');

    function cleanup() {
      modal.classList.remove('show');
      btnCancel.onclick = null;
      btnConfirm.onclick = null;
    }

    btnCancel.onclick = function () {
      cleanup();
    };

    btnConfirm.onclick = function () {
      cleanup();
      if (typeof onConfirm === 'function') onConfirm();
    };
  }

  // -------------------------------------------------------------
  // Router & View Rendering
  // -------------------------------------------------------------
  const appEl = document.getElementById('app');

  // Flashcards state
  let currentDeckSlug = null;
  let currentCardIndex = 0;
  let activeCategory = '全部';
  let onlyUnknown = false;
  let activeCardsList = [];
  let isFlipped = false;
  let activeTab = 'overview'; // for company page

  function initRouter() {
    window.addEventListener('hashchange', renderRoute);
    window.addEventListener('keydown', handleGlobalKeydown);
    renderRoute();
  }

  function renderRoute() {
    const hash = window.location.hash || '#/';
    document.body.classList.remove('cards-mode');

    // Route matching
    if (hash === '#/' || hash === '') {
      renderHomeView();
    } else if (hash === '#/common/cards') {
      document.body.classList.add('cards-mode');
      renderFlashcardsView('common');
    } else {
      const cardMatch = hash.match(/^#\/c\/([a-zA-Z0-9_-]+)\/cards$/);
      if (cardMatch) {
        document.body.classList.add('cards-mode');
        renderFlashcardsView(cardMatch[1]);
        return;
      }

      const companyMatch = hash.match(/^#\/c\/([a-zA-Z0-9_-]+)$/);
      if (companyMatch) {
        renderCompanyView(companyMatch[1]);
        return;
      }

      // Default fallback
      window.location.hash = '#/';
    }
  }

  // -------------------------------------------------------------
  // 1. Home View
  // -------------------------------------------------------------
  function renderHomeView() {
    const companies = window.ZDY_COMPANIES || [];
    const cardsMap = window.ZDY_CARDS || {};
    const overall = getOverallStats();
    const commonStats = getDeckStats(cardsMap.common || []);
    const mode = getMode();
    const bannerDismissed = localStorage.getItem(BANNER_STORAGE_KEY) === 'dismissed';

    const redCompanies = companies.filter(c => c.priority === 'red');
    const yellowCompanies = companies.filter(c => c.priority === 'yellow');

    function renderCompanyCard(c) {
      const stats = getDeckStats(cardsMap[c.slug] || []);
      const salaryStr = `${c.salary[0]}–${c.salary[1]}K`;
      const stars = '★'.repeat(c.match) + '☆'.repeat(5 - c.match);

      return `
        <a href="#/c/${c.slug}" class="company-card priority-${c.priority}">
          <div>
            <div class="company-card-top">
              <span class="company-short">${escapeHtml(c.short)}</span>
              <span class="company-match" title="匹配度 ${c.match}/5">${stars}</span>
            </div>
            <div class="company-role">${escapeHtml(c.role)}</div>
            ${(mode === 'plain' && c.plain && c.plain.roleInOneLine) ? `
              <div class="company-plain-role-sub">💡 人话：${escapeHtml(c.plain.roleInOneLine)}</div>
            ` : ''}
            <div class="company-meta-row">
              <span class="meta-chip">📍 ${escapeHtml(c.location)}</span>
              <span class="meta-chip">💰 ${salaryStr}</span>
              <span class="meta-chip">👥 招 ${c.headcount || 1} 人</span>
            </div>
          </div>
          <div class="company-card-footer">
            <span class="company-progress-text">刷题进度: <strong>${stats.known}</strong> / ${stats.total}</span>
            <span style="color: var(--primary); font-weight: 600;">进入 &rarr;</span>
          </div>
        </a>
      `;
    }

    appEl.innerHTML = `
      <header class="navbar home-navbar">
        <div class="navbar-brand">
          <span class="brand-icon">📦</span>
          <span class="brand-title">秋招备战</span>
        </div>
        <div class="navbar-right">
          ${renderModeSwitcher()}
        </div>
      </header>

      <div class="container">
        ${(!bannerDismissed && mode === 'pro') ? `
          <div class="mode-tip-banner" id="mode-tip-banner">
            <div class="mode-tip-banner-content">
              <span class="mode-tip-banner-icon">💡</span>
              <span class="mode-tip-banner-text">看不懂专业术语？右上角切<strong>「通俗版」</strong></span>
            </div>
            <div class="mode-tip-banner-actions">
              <button class="btn-banner-switch" id="btn-banner-switch">立即切换</button>
              <button class="mode-tip-banner-close" id="btn-close-banner" aria-label="关闭提示">✕</button>
            </div>
          </div>
        ` : ''}

        <header class="home-header">
          <h1 class="home-title">秋招面试备战 · 供应链/跨境电商</h1>
          <p class="home-subtitle">物流管理 2027 届 · 8 个目标岗位${mode === 'plain' ? ' <span class="mode-badge-plain">通俗版已开启</span>' : ''}</p>
        </header>

        <!-- Overall Progress -->
        <div class="progress-card">
          <div class="progress-header">
            <span class="progress-label">总复习掌握进度</span>
            <span class="progress-val">${overall.known} / ${overall.total} (${overall.percent}%)</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${overall.percent}%;"></div>
          </div>
          <div class="progress-footer">
            <span>已掌握 ${overall.known} 张 · 待掌握 ${overall.total - overall.known} 张</span>
            <button class="btn-reset-link" id="btn-reset-progress">重置进度</button>
          </div>
        </div>

        <!-- Common Questions Entry Card -->
        <a href="#/common/cards" class="common-card">
          <div class="common-card-left">
            <div class="common-card-icon">🎯</div>
            <div>
              <div class="common-card-title">通用必备题</div>
              <div class="common-card-desc">自我介绍、简历追问、行为面、英语、反问</div>
            </div>
          </div>
          <div class="common-card-badge">${commonStats.known}/${commonStats.total} 已掌握</div>
        </a>

        <!-- Red Group -->
        <div class="section-header">
          <span class="section-title">🔴 优先面试</span>
        </div>
        <div class="companies-grid">
          ${redCompanies.map(renderCompanyCard).join('')}
        </div>

        <!-- Yellow Group -->
        <div class="section-header">
          <span class="section-title">🟡 次优岗位</span>
        </div>
        <div class="companies-grid">
          ${yellowCompanies.map(renderCompanyCard).join('')}
        </div>

        <div class="home-footer-note">
          数据仅供个人备考参考 · 无后端 · 进度存于本机
        </div>
      </div>
    `;

    bindModeSwitcherEvents(() => {
      renderHomeView();
    });

    const resetBtn = document.getElementById('btn-reset-progress');
    if (resetBtn) {
      resetBtn.onclick = function (e) {
        e.preventDefault();
        showConfirmModal('重置所有进度？', '确定要重置所有卡片的刷题掌握记录吗？此操作不可撤销。', function () {
          clearAllProgress();
          renderHomeView();
        });
      };
    }

    const closeBannerBtn = document.getElementById('btn-close-banner');
    if (closeBannerBtn) {
      closeBannerBtn.onclick = function (e) {
        e.stopPropagation();
        try { localStorage.setItem(BANNER_STORAGE_KEY, 'dismissed'); } catch (_) {}
        const bannerEl = document.getElementById('mode-tip-banner');
        if (bannerEl) bannerEl.remove();
      };
    }

    const bannerSwitchBtn = document.getElementById('btn-banner-switch');
    if (bannerSwitchBtn) {
      bannerSwitchBtn.onclick = function (e) {
        e.stopPropagation();
        try { localStorage.setItem(BANNER_STORAGE_KEY, 'dismissed'); } catch (_) {}
        setMode('plain');
        renderHomeView();
      };
    }
  }

  // -------------------------------------------------------------
  // 2. Company Detail View (3 Tabs)
  // -------------------------------------------------------------
  function renderCompanyView(slug) {
    const companies = window.ZDY_COMPANIES || [];
    const company = companies.find(c => c.slug === slug);

    if (!company) {
      window.location.hash = '#/';
      return;
    }

    const mode = getMode();
    const isPlain = mode === 'plain' && company.plain;

    const salaryStr = `${company.salary[0]}–${company.salary[1]}K`;
    const stars = '★'.repeat(company.match) + '☆'.repeat(5 - company.match);

    const displayAbout = isPlain ? company.plain.about : company.about;
    const whyFitList = isPlain ? company.plain.whyFit : company.whyFit;
    const concernsList = isPlain ? company.plain.concerns : company.concerns;
    const dutiesList = isPlain ? company.plain.duties : company.duties;
    const requirementsList = isPlain ? company.plain.requirements : company.requirements;

    appEl.innerHTML = `
      <header class="navbar">
        <a href="#/" class="navbar-back">&larr; 返回首页</a>
        <div class="navbar-title">${escapeHtml(company.short)}</div>
        <div class="navbar-right">
          ${renderModeSwitcher()}
        </div>
      </header>

      <div class="container">
        <!-- Hero Header -->
        <div class="company-header-hero">
          <div class="company-hero-role-row">
            <h2 class="company-hero-title">${escapeHtml(company.role)}</h2>
            ${isPlain ? '<span class="badge-plain-mode">通俗模式</span>' : ''}
          </div>
          ${isPlain ? `
            <div class="company-plain-role-badge">💡 一句话岗位定位：${escapeHtml(company.plain.roleInOneLine)}</div>
          ` : ''}
          <div class="company-hero-fullname">${escapeHtml(company.name)}</div>
          <p class="company-hero-desc">${escapeHtml(displayAbout)}</p>
          <div class="company-hero-meta">
            <span class="meta-chip">📍 ${escapeHtml(company.location)}</span>
            <span class="meta-chip">💰 ${salaryStr}</span>
            <span class="meta-chip">👥 招 ${company.headcount || 1} 人</span>
            <span class="meta-chip" style="color: #d97706;">匹配度 ${stars}</span>
          </div>
        </div>

        <!-- 3-Segmented Tabs Nav -->
        <div class="tabs-nav">
          <button class="tab-btn ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
            📋 岗位速览
          </button>
          <button class="tab-btn ${activeTab === 'study' ? 'active' : ''}" data-tab="study">
            📚 补习清单
          </button>
          <button class="tab-btn" id="btn-goto-cards">
            ⚡ 面试闪卡
          </button>
        </div>

        <!-- Tab 1: Overview -->
        <div class="tab-pane ${activeTab === 'overview' ? 'active' : ''}" id="pane-overview">
          <div class="info-section">
            <div class="info-section-title">✨ 为什么匹配（优势剖析）</div>
            <ul class="bullet-list">
              ${whyFitList.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>

          <div class="info-section">
            <div class="info-section-title" style="color: var(--accent-red);">⚠️ 面试官可能质疑的点</div>
            <ul class="bullet-list concerns-list">
              ${concernsList.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>

          <div class="info-section">
            <div class="info-section-title">📌 岗位职责（${isPlain ? '通俗人话版' : 'JD 原文'}）</div>
            <ul class="bullet-list">
              ${dutiesList.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>

          <div class="info-section">
            <div class="info-section-title">🎓 任职要求（${isPlain ? '通俗人话版' : 'JD 原文'}）</div>
            <ul class="bullet-list">
              ${requirementsList.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>

          <div class="cta-box">
            <a href="#/c/${company.slug}/cards" class="btn-primary-cta">
              开始刷题 (进入面试闪卡) &rarr;
            </a>
          </div>
        </div>

        <!-- Tab 2: Study Checklist -->
        <div class="tab-pane ${activeTab === 'study' ? 'active' : ''}" id="pane-study">
          <div class="study-group-title" style="color: var(--accent-red);">
            🔴 必须掌握 (高频核心考点)
          </div>
          <div>
            ${(company.study.must || []).map(item => `
              <div class="study-item-card">
                <div class="study-item-topic">
                  ${escapeHtml(item.topic)}
                  ${(isPlain && item.plainNote) ? '<span class="badge-plain-study">通俗笔记</span>' : ''}
                </div>
                <div class="study-item-note">
                  ${(isPlain && item.plainNote) ? `<strong>💡 人话速记：</strong>${escapeHtml(item.plainNote)}` : escapeHtml(item.note)}
                </div>
                ${(isPlain && item.plainNote && item.note) ? `
                  <details class="study-item-pro-details">
                    <summary>查看专业版考点解析</summary>
                    <div class="study-pro-text">${escapeHtml(item.note)}</div>
                  </details>
                ` : ''}
                ${item.link ? `<div class="study-item-link">🔗 与简历连接: ${escapeHtml(item.link)}</div>` : ''}
              </div>
            `).join('')}
          </div>

          ${(company.study.nice && company.study.nice.length > 0) ? `
            <div class="study-group-title" style="color: var(--accent-amber);">
              🟡 建议了解 (加分拓展知识)
            </div>
            <div>
              ${company.study.nice.map(item => `
                <div class="study-item-card">
                  <div class="study-item-topic">
                    ${escapeHtml(item.topic)}
                    ${(isPlain && item.plainNote) ? '<span class="badge-plain-study">通俗笔记</span>' : ''}
                  </div>
                  <div class="study-item-note">
                    ${(isPlain && item.plainNote) ? `<strong>💡 人话速记：</strong>${escapeHtml(item.plainNote)}` : escapeHtml(item.note)}
                  </div>
                  ${(isPlain && item.plainNote && item.note) ? `
                    <details class="study-item-pro-details">
                      <summary>查看专业版考点解析</summary>
                      <div class="study-pro-text">${escapeHtml(item.note)}</div>
                    </details>
                  ` : ''}
                  ${item.link ? `<div class="study-item-link">🔗 与简历连接: ${escapeHtml(item.link)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}

          <div class="cta-box">
            <a href="#/c/${company.slug}/cards" class="btn-primary-cta">
              背熟了，去闪卡检验 &rarr;
            </a>
          </div>
        </div>
      </div>
    `;

    bindModeSwitcherEvents(() => {
      renderCompanyView(slug);
    });

    // Tab switching event
    const tabBtns = appEl.querySelectorAll('.tab-btn[data-tab]');
    tabBtns.forEach(btn => {
      btn.onclick = function () {
        activeTab = this.getAttribute('data-tab');
        renderCompanyView(slug);
      };
    });

    const gotoCardsBtn = document.getElementById('btn-goto-cards');
    if (gotoCardsBtn) {
      gotoCardsBtn.onclick = function () {
        window.location.hash = `#/c/${company.slug}/cards`;
      };
    }
  }

  // -------------------------------------------------------------
  // 3. Flashcards View & Controller
  // -------------------------------------------------------------
  function renderFlashcardsView(deckSlug) {
    const cardsMap = window.ZDY_CARDS || {};
    const companies = window.ZDY_COMPANIES || [];
    const isCommon = deckSlug === 'common';
    const company = isCommon ? null : companies.find(c => c.slug === deckSlug);
    const rawCards = cardsMap[deckSlug] || [];

    if (!rawCards || rawCards.length === 0) {
      window.location.hash = '#/';
      return;
    }

    // Initialize or preserve deck state
    if (currentDeckSlug !== deckSlug) {
      currentDeckSlug = deckSlug;
      currentCardIndex = 0;
      activeCategory = '全部';
      onlyUnknown = false;
      isFlipped = false;
      activeCardsList = [...rawCards];
    }

    // Filter cards
    const progress = getProgress();
    const categories = ['全部', ...Array.from(new Set(rawCards.map(c => c.cat)))];

    let filtered = rawCards.filter(card => {
      if (activeCategory !== '全部' && card.cat !== activeCategory) return false;
      if (onlyUnknown && progress[card.id] === 'known') return false;
      return true;
    });

    if (currentCardIndex >= filtered.length) {
      currentCardIndex = Math.max(0, filtered.length - 1);
    }

    const currentCard = filtered[currentCardIndex];
    const deckTitle = isCommon ? '通用必备题' : (company ? company.short : '面试闪卡');
    const backUrl = isCommon ? '#/' : `#/c/${deckSlug}`;
    const mode = getMode();
    const isPlain = mode === 'plain';

    appEl.innerHTML = `
      <header class="navbar">
        <a href="${backUrl}" class="navbar-back">&larr; 返回</a>
        <div class="navbar-title">${escapeHtml(deckTitle)}</div>
        <div class="navbar-right">
          ${renderModeSwitcher()}
          <button class="btn-shuffle" id="btn-shuffle" title="打乱题目顺序">🔀 打乱</button>
        </div>
      </header>

      <div class="container">
        <div class="flashcards-header">
          <div class="flashcards-meta-row">
            <span class="card-counter-badge">
              ${filtered.length > 0 ? `第 ${currentCardIndex + 1} / ${filtered.length} 张` : '暂无卡片'}
            </span>
            <button class="toggle-unknown-btn ${onlyUnknown ? 'active' : ''}" id="btn-toggle-unknown">
              ${onlyUnknown ? '✓ 只看未掌握' : '只看未掌握'}
            </button>
          </div>

          <!-- Category Filter Chips -->
          <div class="filter-bar">
            ${categories.map(cat => `
              <button class="chip-btn ${activeCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">
                ${escapeHtml(cat)}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Card Container / 3D Flip -->
        ${filtered.length > 0 ? `
          <div class="card-scene" id="card-scene">
            <div class="card-flip-container ${isFlipped ? 'is-flipped' : ''}" id="card-inner">
              <!-- Front: Question -->
              <div class="card-face card-front">
                <div class="card-face-header">
                  <div class="card-tag-group">
                    <span class="badge-cat">${escapeHtml(currentCard.cat)}</span>
                    ${isPlain ? '<span class="badge-plain-mode">通俗模式</span>' : ''}
                    ${currentCard.en ? '<span class="badge-en">EN 英语题</span>' : ''}
                  </div>
                  <div>
                    ${progress[currentCard.id] === 'known' ? '<span class="card-status-pill known">✅ 已掌握</span>' : ''}
                    ${progress[currentCard.id] === 'unknown' ? '<span class="card-status-pill unknown">❌ 还不会</span>' : ''}
                  </div>
                </div>

                <div class="card-body">
                  ${isPlain ? `
                    <div class="card-question-plain-wrapper">
                      <div class="card-question-plain">${escapeHtml(currentCard.qp || currentCard.q)}</div>
                      <div class="card-question-original">原题：${escapeHtml(currentCard.q)}</div>
                    </div>
                  ` : `
                    <div class="card-question">${escapeHtml(currentCard.q)}</div>
                  `}
                </div>

                <div class="card-face-footer">
                  <span>👆 点击翻看答案 (空格键翻面)</span>
                </div>
              </div>

              <!-- Back: Answer -->
              <div class="card-face card-back">
                <div class="card-face-header">
                  <div class="card-tag-group">
                    <span class="badge-cat">${escapeHtml(currentCard.cat)}</span>
                    ${isPlain ? '<span class="badge-plain-mode">通俗</span>' : ''}
                    ${currentCard.en ? '<span class="badge-en">EN 答案</span>' : ''}
                  </div>
                  <div>
                    ${progress[currentCard.id] === 'known' ? '<span class="card-status-pill known">✅ 会了</span>' : ''}
                    ${progress[currentCard.id] === 'unknown' ? '<span class="card-status-pill unknown">❌ 不会</span>' : ''}
                  </div>
                </div>

                <div class="card-body">
                  <div class="card-answer-scroll">
                    <div class="card-answer">
                      ${isPlain ? `
                        <div class="badge-plain-mode-banner">
                          <span>🌱 人话拆解版</span>
                        </div>
                      ` : ''}
                      ${parseMarkdown(isPlain ? (currentCard.ap || currentCard.a) : currentCard.a)}
                    </div>
                    ${isPlain ? `
                      ${(currentCard.tipp || currentCard.tip) ? `
                        <div class="card-tip-box plain-tip-box">
                          ${escapeHtml(currentCard.tipp || currentCard.tip)}
                        </div>
                      ` : ''}
                    ` : `
                      ${currentCard.tip ? `
                        <div class="card-tip-box">
                          <strong>💡 考察点与追问提示：</strong>${escapeHtml(currentCard.tip)}
                        </div>
                      ` : ''}
                    `}
                    <div class="card-mode-toggle-bar">
                      <button type="button" class="btn-toggle-card-mode" data-switch-to="${isPlain ? 'pro' : 'plain'}">
                        🔄 换看${isPlain ? '专业版' : '通俗版'}回答
                      </button>
                    </div>
                  </div>
                </div>

                <div class="card-face-footer">
                  <span>👆 点击翻回问题</span>
                </div>
              </div>
            </div>
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-state-icon">🎉</div>
            <div class="empty-state-title">太棒了！暂无符合条件的卡片</div>
            <p class="empty-state-desc">当前筛选条件下所有卡片已全部掌握，或该分类无题目。</p>
            <button class="chip-btn active" id="btn-clear-filter">查看全部题目</button>
          </div>
        `}
      </div>

      <!-- Fixed Bottom Navigation Bar -->
      <footer class="bottom-bar">
        <div class="bottom-bar-inner">
          <button class="bar-btn bar-btn-nav" id="btn-prev" ${filtered.length <= 1 ? 'disabled' : ''}>
            ◀ 上一张
          </button>
          <button class="bar-btn bar-btn-unknown" id="btn-unknown" ${filtered.length === 0 ? 'disabled' : ''}>
            ❌ 还不会
          </button>
          <button class="bar-btn bar-btn-known" id="btn-known" ${filtered.length === 0 ? 'disabled' : ''}>
            ✅ 会了
          </button>
          <button class="bar-btn bar-btn-nav" id="btn-next" ${filtered.length <= 1 ? 'disabled' : ''}>
            下一张 ▶
          </button>
        </div>
      </footer>
    `;

    // Bind Event Listeners
    attachCardEvents(filtered, deckSlug);
  }

  function attachCardEvents(filtered, deckSlug) {
    bindModeSwitcherEvents(() => {
      renderFlashcardsView(deckSlug);
    });

    const cardScene = document.getElementById('card-scene');
    const cardInner = document.getElementById('card-inner');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnKnown = document.getElementById('btn-known');
    const btnUnknown = document.getElementById('btn-unknown');
    const btnShuffle = document.getElementById('btn-shuffle');
    const btnToggleUnknown = document.getElementById('btn-toggle-unknown');
    const btnClearFilter = document.getElementById('btn-clear-filter');
    const btnToggleCardMode = appEl.querySelector('.btn-toggle-card-mode');

    // Category chips click
    const chips = appEl.querySelectorAll('.chip-btn[data-cat]');
    chips.forEach(chip => {
      chip.onclick = function () {
        activeCategory = this.getAttribute('data-cat');
        currentCardIndex = 0;
        isFlipped = false;
        renderFlashcardsView(deckSlug);
      };
    });

    if (btnClearFilter) {
      btnClearFilter.onclick = function () {
        activeCategory = '全部';
        onlyUnknown = false;
        currentCardIndex = 0;
        isFlipped = false;
        renderFlashcardsView(deckSlug);
      };
    }

    if (btnToggleUnknown) {
      btnToggleUnknown.onclick = function () {
        onlyUnknown = !onlyUnknown;
        currentCardIndex = 0;
        isFlipped = false;
        renderFlashcardsView(deckSlug);
      };
    }

    if (btnShuffle) {
      btnShuffle.onclick = function () {
        const raw = window.ZDY_CARDS[deckSlug];
        if (raw && raw.length > 1) {
          // In-place Fisher-Yates shuffle
          for (let i = raw.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [raw[i], raw[j]] = [raw[j], raw[i]];
          }
          currentCardIndex = 0;
          isFlipped = false;
          renderFlashcardsView(deckSlug);
        }
      };
    }

    if (btnToggleCardMode) {
      btnToggleCardMode.onclick = function (e) {
        e.stopPropagation();
        const targetMode = this.getAttribute('data-switch-to');
        if (targetMode) {
          setMode(targetMode);
          isFlipped = true; // In-place toggle: keep flipped!
          renderFlashcardsView(deckSlug);
        }
      };
    }

    // Flip Card Click
    if (cardScene) {
      cardScene.onclick = function (e) {
        // Don't flip if user clicked mode switcher or toggle button or selected text
        if (e.target.closest('.btn-toggle-card-mode') || e.target.closest('.mode-switcher')) {
          return;
        }
        if (window.getSelection && window.getSelection().toString().length > 0) {
          return;
        }
        isFlipped = !isFlipped;
        if (cardInner) {
          cardInner.classList.toggle('is-flipped', isFlipped);
        }
      };

      // Touch Gestures (Swipe Left / Right)
      let touchStartX = 0;
      let touchStartY = 0;

      cardScene.ontouchstart = function (e) {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      };

      cardScene.ontouchend = function (e) {
        if (e.changedTouches.length === 1) {
          const diffX = e.changedTouches[0].clientX - touchStartX;
          const diffY = e.changedTouches[0].clientY - touchStartY;

          // Horizontal swipe detection (> 50px and diffX > diffY)
          if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX < 0) {
              // Swipe left -> Next card
              navigateCard(filtered, 1, deckSlug);
            } else {
              // Swipe right -> Prev card
              navigateCard(filtered, -1, deckSlug);
            }
          }
        }
      };
    }

    // Navigation buttons
    if (btnPrev) {
      btnPrev.onclick = function (e) {
        e.stopPropagation();
        navigateCard(filtered, -1, deckSlug);
      };
    }

    if (btnNext) {
      btnNext.onclick = function (e) {
        e.stopPropagation();
        navigateCard(filtered, 1, deckSlug);
      };
    }

    if (btnKnown) {
      btnKnown.onclick = function (e) {
        e.stopPropagation();
        if (filtered[currentCardIndex]) {
          setCardStatus(filtered[currentCardIndex].id, 'known');
          navigateCard(filtered, 1, deckSlug);
        }
      };
    }

    if (btnUnknown) {
      btnUnknown.onclick = function (e) {
        e.stopPropagation();
        if (filtered[currentCardIndex]) {
          setCardStatus(filtered[currentCardIndex].id, 'unknown');
          navigateCard(filtered, 1, deckSlug);
        }
      };
    }
  }

  function navigateCard(filtered, step, deckSlug) {
    if (filtered.length <= 1) return;
    currentCardIndex = (currentCardIndex + step + filtered.length) % filtered.length;
    isFlipped = false;
    renderFlashcardsView(deckSlug);
  }

  // -------------------------------------------------------------
  // Keyboard Navigation (Desktop)
  // -------------------------------------------------------------
  function handleGlobalKeydown(e) {
    // Only active in flashcards view
    if (!document.body.classList.contains('cards-mode')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const cardsMap = window.ZDY_CARDS || {};
    const rawCards = cardsMap[currentDeckSlug] || [];
    const progress = getProgress();

    const filtered = rawCards.filter(card => {
      if (activeCategory !== '全部' && card.cat !== activeCategory) return false;
      if (onlyUnknown && progress[card.id] === 'known') return false;
      return true;
    });

    if (filtered.length === 0) return;

    if (e.code === 'Space') {
      e.preventDefault();
      const cardInner = document.getElementById('card-inner');
      isFlipped = !isFlipped;
      if (cardInner) cardInner.classList.toggle('is-flipped', isFlipped);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      navigateCard(filtered, -1, currentDeckSlug);
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      navigateCard(filtered, 1, currentDeckSlug);
    } else if (e.key === '1') {
      // Mark as unknown
      e.preventDefault();
      if (filtered[currentCardIndex]) {
        setCardStatus(filtered[currentCardIndex].id, 'unknown');
        navigateCard(filtered, 1, currentDeckSlug);
      }
    } else if (e.key === '2') {
      // Mark as known
      e.preventDefault();
      if (filtered[currentCardIndex]) {
        setCardStatus(filtered[currentCardIndex].id, 'known');
        navigateCard(filtered, 1, currentDeckSlug);
      }
    }
  }

  // -------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', initRouter);
})();

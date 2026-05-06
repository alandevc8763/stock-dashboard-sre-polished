
/**
 * Stock Dashboard - Main Entry
 * Refactored for Async Data Loading (Ralph-Loop Phase 1)
 */

const USER_KEY = "ai-industry-map-user";
const SAVED_ANALYSES_KEY = "ai-industry-map-saved-analyses";

// Global State
const state = {
  view: "",
  category: "全部",
  query: "",
  selectedTopicId: "",
  selectedCompanyTicker: "",
  analysisMode: "bullish",
  mapMode: "relation",
  activeNetworkCluster: "compute",
  user: null,
  savedAnalyses: [],
};

// DOM Elements

/**
 * Utility: JSON storage
 */
function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Core Initialization
 */
async function init() {
  try {
    // 1. Fetch the decoupled data
    const response = await fetch('./data.json');
    const data = await response.json();
    console.log('Loaded data:', data);

    // 2. Inject into window to support existing model.js logic without rewriting everything
    window.categories = data.categories;
    window.topics = data.topics;
    window.activeEtfMarketNote = data.activeEtfMarketNote;
    window.activeEtfs = data.activeEtfs;
    window.etfEdgeMeta = data.etfEdgeMeta;
    window.etfFlowEvents = data.etfFlowEvents;
    window.marketSnapshots = data.marketSnapshots;

    // 3. Initialize state from URL and storage
    const params = new URLSearchParams(window.location.search);
    const requestedTopic = params.get("topic");
    const requestedCompany = params.get("company");
    
    state.view = requestedCompany ? "companies" : requestedTopic ? "map" : "themes";
    state.selectedTopicId = (window.topics && window.topics.some((t) => t.id === requestedTopic)) ? requestedTopic : (window.topics ? window.topics[0]?.id : "");
    state.selectedCompanyTicker = requestedCompany ?? "";
    state.user = loadJson(USER_KEY, null);
    state.savedAnalyses = loadJson(SAVED_ANALYSES_KEY, []);

    // 4. Initial Render
    refreshAuthButton();
    syncNav();
    render();
    
    console.log("Dashboard initialized successfully with async data.");
  } catch (error) {
    console.error("Critical initialization error:", error);
    document.querySelector('#content').innerHTML = `<div class="empty-state"><h2>數據加載失敗</h2><p>${error.message}</p></div>`;
  }
}

/**
 * Auth Logic
 */
function refreshAuthButton() {
    const authBtn = document.getElementById('auth-button');
    if (!authBtn) return;
  document.querySelector('#auth-button').textContent = state.user ? `${state.user.name} · 登出` : "登入";
}

function openLoginModal() {
  const modal = document.createElement("div");
  modal.className = "auth-modal";
  modal.innerHTML = `
    <form class="auth-card">
      <button class="modal-close" type="button" aria-label="關閉">×</button>
      <p class="eyebrow">Local Account</p>
      <h2>本機登入</h2>
      <p>這是 GitHub Pages 可用的前端會員模式，資料只存在此瀏覽器。</p>
      <label>
        <span>顯示名稱</span>
        <input name="name" autocomplete="name" placeholder="例如：台股研究員" required />
      </label>
      <button class="mock-button" type="submit">登入並啟用我的分析</button>
    </form>
  `;
  document.body.append(modal);
  modal.querySelector("input").focus();
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest(".modal-close")) modal.remove();
  });
  modal.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // Import is needed here, but auth.js is still a module. 
    // Since we are moving away from strict ES modules for data, 
    // we need to ensure auth.js functions are available.
    // I will assume auth.js functions are loaded via script tag or converted.
    // For now, I will keep the logic but call them via window if they were attached.
    if (window.createUserProfile) {
      state.user = window.createUserProfile(formData.get("name"));
      saveJson(USER_KEY, state.user);
      refreshAuthButton();
      modal.remove();
      if (state.view === "analysis") render();
    } else {
      alert("Auth system not loaded.");
    }
  });
}

function logout() {
  if (!state.user) {
    openLoginModal();
    return;
  }
  if (!window.confirm("要登出本機會員嗎？收藏分析會保留在此瀏覽器。")) return;
  state.user = null;
  localStorage.removeItem(USER_KEY);
  refreshAuthButton();
  render();
}

/**
 * UI Rendering
 */
function syncNav() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

window.setView = function setView(view) {
    console.log('setView called with:', view);
  state.view = view;
  if (view !== "company") {
    state.selectedCompanyTicker = "";
    const url = new URL(window.location.href);
    url.searchParams.delete("company");
    if (view !== "map") url.searchParams.delete("topic");
    if (url.href !== window.location.href) window.history.replaceState({}, "", url);
  }
  syncNav();
  render();
}

function setCategory(category) {
  state.category = category;
  renderFilters();
  render();
}

function getVisibleTopics() {
  // Use the global window.topics
  return window.filterTopics(window.topics, { category: state.category, query: state.query });
}

function renderStats(visibleTopics) {
  const companies = (window.filterCompanies && window.buildCompanyIndex) ? window.filterCompanies(window.buildCompanyIndex(visibleTopics), state.query) : [];
  document.querySelector('#topic-count').textContent = String(visibleTopics.length);
  document.querySelector('#company-count').textContent = String(companies.length);
  document.querySelector('#top-score').textContent = String(Math.max(0, ...visibleTopics.map((topic) => topic.score)));
}


function renderFilters() {
  document.querySelector('#category-filters').innerHTML = '';
  
  // Row 1: Categories
  const catRow = document.createElement('div');
  catRow.className = 'filter-row';
  catRow.innerHTML = window.categories
    .map(category => `<button class="chip ${category === state.category ? "active" : ""}" data-category="${category}">${category}</button>`)
    .join("");
  document.querySelector('#category-filters').appendChild(catRow);
  
  // Row 2: Role Tags (Loop 3)
  const roleRow = document.createElement('div');
  roleRow.className = 'filter-row';
  roleRow.style.marginTop = '0.6rem';
  
  const allRoles = window.extractAllRoles(window.topics);
  roleRow.innerHTML = allRoles.map(role => `<button class="chip role-chip" data-role="${role}">${role}</button>`).join("");
  document.querySelector('#category-filters').appendChild(roleRow);
}


function renderEmpty() {
  document.querySelector('#content').innerHTML = `<div class="empty-state"><h2>沒有符合條件的資料</h2><p>請調整搜尋字詞或切換分類。</p></div>`;
}

function renderDailyFocus(visibleTopics) {
  const report = window.createDailyFocusReport(visibleTopics, window.marketSnapshots, window.activeEtfs, window.etfEdgeMeta);
  document.querySelector('#view-title').innerHTML = `<div><p class="eyebrow">Daily Focus</p><h2>每日焦點</h2><p class="section-copy">盤前焦點、ETF 早報、量價訊號與風險提示。</p></div>`;
  document.querySelector('#content').innerHTML = `
    <section class="focus-hero">
      <div><span>${report.etfBrief.asOf}</span><h3>${report.lead}</h3><p>${window.activeEtfMarketNote.body}</p></div>
      <div class="focus-source"><strong>${report.etfBrief.sourceLabel}</strong><span>${report.etfBrief.etfCount} ETFs · ${report.etfBrief.totalAum} 億 AUM</span><span>25% 上限使用率 ${report.etfBrief.tsmcLimitUsage}%</span></div>
    </section>
    <div class="focus-layout">
      <section class="focus-panel"><div class="panel-kicker">Market Movers</div><h3>量價焦點</h3>${report.marketMovers.map(row => `<div class="focus-row"><strong>${row.ticker} ${row.name}</strong><span class="${row.changePct >= 0 ? "up-text" : "down-text"}">${row.changePct >= 0 ? "+" : ""}${row.changePct}%</span><small>${row.topicTitle} · ${row.signal}</small></div>`).join("")}</section>
      <section class="focus-panel"><div class="panel-kicker">ETF Morning Brief</div><h3>主動式 ETF 早報</h3><div class="brief-grid"><div><span>今日流入</span><strong>${report.etfBrief.dailyInflow}</strong></div><div><span>今日流出</span><strong>${report.etfBrief.dailyOutflow}</strong></div><div><span>週資金流</span><strong>${report.etfBrief.weeklyFlow}</strong></div></div><p>${window.etfEdgeMeta.marketNote}</p><p>${window.activeEtfMarketNote.title}：${window.activeEtfMarketNote.body}</p></section>
      <section class="focus-panel"><div class="panel-kicker">Watch Items</div><h3>今日追蹤</h3><ul class="focus-list">${report.watchItems.map(item => `<li>${item}</li>`).join("")}</ul></section>
      <section class="focus-panel"><div class="panel-kicker">Risk Notes</div><h3>風險提示</h3><ul class="focus-list">${report.riskNotes.map(item => `<li>${item}</li>`).join("")}</ul></section>
    </div>
  `;
}

function renderThemes(visibleTopics) {
  document.querySelector('#view-title').innerHTML = `<div><p class="eyebrow">Industry Themes</p><h2>題材總覽</h2></div>`;
  if (visibleTopics.length === 0) { renderEmpty(); return; }
  document.querySelector('#content').innerHTML = `<div class="topic-grid">${visibleTopics.map(topic => `<article class="topic-card"><div class="card-topline"><span class="category">${topic.category}</span><span class="score">${topic.score}</span></div><h3>${topic.title}</h3><p>${topic.summary}</p><div class="catalyst">催化因素：${topic.catalyst}</div><div class="card-footer"><span>${topic.companies.length} 家公司</span><span>核實於 ${topic.updatedAt}</span></div></article>`).join("")}</div>`;
}


function renderMap(visibleTopics) {
  const networkTopics = window.topics.filter((topic) => topic.network);
  document.querySelector('#view-title').innerHTML = `
    <div>
      <p class="eyebrow">Supply Chain Map</p>
      <h2>產業地圖</h2>
      <p class="section-copy">選擇題材後查看傳統卡片或供應鏈關係圖。</p>
    </div>
  `;
  if (visibleTopics.length === 0) {
    renderEmpty();
    return;
  }
  const selectedTopic = window.topics.find((topic) => topic.id === state.selectedTopicId) ?? visibleTopics[0];
  state.selectedTopicId = selectedTopic.id;
  
  document.querySelector('#content').innerHTML = `
    <div class="map-toolbar">
      <div class="map-topic-tabs">
        ${networkTopics.map(topic => `<button class="topic-selector ${topic.id === selectedTopic.id ? "active" : ""}" data-topic="${topic.id}"><span>${topic.category}</span>${topic.title.replace(" (AI Server ODM)", "")}</button>`).join("")}
      </div>
      <div class="view-toggle">
        <button class="${state.mapMode === "cards" ? "active" : ""}" data-map-mode="cards">傳統卡片</button>
        <button class="${state.mapMode === "relation" ? "active" : ""}" data-map-mode="relation">關係圖</button>
      </div>
    </div>
  `;

  if (state.mapMode === "relation") {
    // Create a dedicated container for the D3 Graph
    const graphContainer = document.createElement('div');
    graphContainer.className = 'graph-container';
    graphContainer.style.width = '100%';
    graphContainer.style.height = '600px';
    document.querySelector('#content').appendChild(graphContainer);
    
    // Call the D3 render function (imported as window.renderKnowledgeGraph)
    if (window.renderKnowledgeGraph) {
      window.renderKnowledgeGraph(selectedTopic, graphContainer);
    } else {
      graphContainer.innerHTML = '<div class="empty-state">圖譜模組加載中...</div>';
    }
  } else {
    // Original card-based layout
    const groups = window.groupRelationships(selectedTopic);
    const relationHtml = `
      <div class="map-layout">
        <aside class="topic-list" aria-label="目前篩選題材">
          ${visibleTopics.map(topic => `<button class="topic-selector ${topic.id === selectedTopic.id ? "active" : ""}" data-topic="${topic.id}"><span>${topic.category}</span>${topic.title}</button>`).join("")}
        </aside>
        <div class="relationship-panel">
          <div class="panel-heading">
            <div><p class="eyebrow">${selectedTopic.category}</p><h3>${selectedTopic.title}</h3></div>
            <span class="score large">${selectedTopic.score}</span>
          </div>
          <div class="relationship-map">
            ${groups.map((group, i) => `<section class="stage" style="--stage-index:${i}"><h4>${group.group}</h4><div class="node-row">${group.nodes.map(node => `<span class="node">${node}</span>`).join("")}</div></section>`).join("")}
          </div>
        </div>
      </div>
    `;
    document.querySelector('#content').innerHTML += relationHtml;
  }
}
function renderCompanies(visibleTopics) {
  document.querySelector('#view-title').innerHTML = `<div><p class="eyebrow">Company Database</p><h2>公司資料庫</h2></div>`;
  const companyRows = (window.createCompanyDatabase && window.marketSnapshots) ? window.createCompanyDatabase(visibleTopics, window.marketSnapshots) : [];
  const companies = (window.filterCompanies && window.buildCompanyIndex) ? window.filterCompanies(window.buildCompanyIndex(visibleTopics), state.query) : [];
  const databaseRows = state.query ? companyRows.filter(company => [company.ticker, company.name, company.market, company.topicTitles.join(" "), company.categories.join(" "), company.roles.join(" ")].join(" ").toLowerCase().includes(state.query.trim().toLowerCase())) : companyRows;
  if (companies.length === 0) { renderEmpty(); return; }
  document.querySelector('#content').innerHTML = `
    <div class="company-summary-grid"><article><span>公司數</span><strong>${databaseRows.length}</strong><small>去重後 ticker</small></article><article><span>已更新</span><strong>${databaseRows.filter(c => c.snapshotStatus === "updated").length}</strong><small>twstock snapshot</small></article><article><span>待更新</span><strong>${databaseRows.filter(c => c.snapshotStatus === "pending").length}</strong><small>下次 workflow 補齊</small></article></div>
    <div class="market-tape">${window.createMarketSnapshot(visibleTopics, window.marketSnapshots).slice(0, 6).map(row => `<div class="ticker-pill ${row.changePct >= 0 ? "up" : "down"}"><strong>${row.ticker} ${row.name}</strong><span>${row.lastPrice} · ${row.changePct >= 0 ? "+" : ""}${row.changePct}%</span></div>`).join("")}</div>
    <div class="table-wrap"><table><thead><tr><th>代號</th><th>公司</th><th>角色</th><th>題材</th><th>市場</th><th>動能</th><th>twstock Snapshot</th></tr></thead><tbody>${databaseRows.map(company => `<tr class="company-row" data-company="${company.ticker}"><td>${company.ticker}</td><td><button class="company-link" data-company="${company.ticker}">${company.name}</button></td><td>${company.roles.join("、")}</td><td>${company.topicTitles.join("、")}</td><td>${company.market}</td><td class="score-cell">${company.momentumScore}</td><td>${company.snapshotStatus}</td></tr>`).join("")}</tbody></table></div>
  `;
}


function renderGlobalView() {
  document.querySelector('#view-title').innerHTML = `
    <div>
      <p class="eyebrow">Global Supply Chain</p>
      <h2>全產業供應鏈導航</h2>
      <p class="section-copy">跨越題材邊界，直接探索公司角色與關聯。</p>
    </div>
  `;
  
  document.querySelector('#content').innerHTML = `
    <div class="global-view-layout">
      <aside class="global-sidebar">
        <div class="sidebar-section">
          <h4>快速檢索角色</h4>
          <div class="role-grid">
            ${window.extractAllRoles(window.topics).map(role => `<button class="role-tag" data-role="${role}">${role}</button>`).join("")}
          </div>
        </div>
        <div class="sidebar-section">
          <h4>公司索引</h4>
          <div class="company-list">
            ${window.buildGlobalCompanyIndex(window.topics).map(c => `<button class="company-item" data-company="${c.ticker}"><span>${c.ticker}</span> ${c.name}</button>`).join("")}
          </div>
        </div>
      </aside>
      <div id="global-graph-container" class="graph-container">
        <div class="graph-placeholder">請選擇一家公司或角色以啟動圖譜</div>
      </div>
    </div>
  `;

  // Bind events for the sidebar
  document.querySelectorAll('.role-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      // Filter companies by role and highlight them in the graph or list
      alert(`正在篩選角色: ${role}\n(此處將觸發圖譜高亮)`);
    });
  });

  document.querySelectorAll('.company-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const ticker = btn.dataset.company;
      const graphData = window.getCompanyGlobalGraph(window.topics, ticker);
      window.renderKnowledgeGraph(graphData, document.getElementById('global-graph-container'));
    });
  });
}

function render() {
  const visibleTopics = getVisibleTopics();
  renderStats(visibleTopics);
  renderFilters();
  
  console.log('Rendering view:', state.view);
  
  if (state.view === "global") {
    console.log('Action: renderGlobalView');
    renderGlobalView();
  } else if (state.view === "themes") {
    console.log('Action: renderThemes');
    renderThemes(visibleTopics);
  } else if (state.view === "map") {
    console.log('Action: renderMap');
    renderMap(visibleTopics);
  } else if (state.view === "companies") {
    console.log('Action: renderCompanies');
    try {
      renderCompanies(visibleTopics);
    } catch (e) {
      console.error('renderCompanies failed:', e);
      document.querySelector('#content').innerHTML = '<div class="empty-state"><h2>公司資料庫加載失敗</h2><p>' + e.message + '</p></div>';
    }
  } else if (state.view === "daily") {
    console.log('Action: renderDailyFocus');
    renderDailyFocus(visibleTopics);
  } else if (state.view === "analysis") {
    console.log('Action: renderAnalysis');
    document.querySelector('#content').innerHTML = `<div class="empty-state"><h2>分析模組</h2><p>請先選擇一家公司進行 AI 深度分析。</p></div>`;
  } else {
    console.log('Action: unknown view, defaulting to themes');
    renderThemes(visibleTopics);
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  init();
  // Navigation
  document.querySelector(".nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-button");
    if (btn) {
      console.log("Nav click (delegated):", btn.dataset.view);
      setView(btn.dataset.view);
    }
  });
  // Search & Filter
  const sInput = document.querySelector("#search-input");
  if(sInput) sInput.addEventListener("input", (e) => {
    state.query = e.target.value;
    render();
  });
  const cFilters = document.querySelector("#category-filters");
  if(cFilters) cFilters.addEventListener("click", (e) => {
    if (e.target.dataset.category) setCategory(e.target.dataset.category);
  });
  // Map interactions
  document.addEventListener("click", (e) => {
    const topicBtn = e.target.closest(".topic-selector");
    if (topicBtn) { state.selectedTopicId = topicBtn.dataset.topic; render(); }
    const modeBtn = e.target.closest("[data-map-mode]");
    if (modeBtn) { state.mapMode = modeBtn.dataset.mapMode; render(); }
    const clusterBtn = e.target.closest("[data-network-cluster]");
    if (clusterBtn) { state.activeNetworkCluster = clusterBtn.dataset.networkCluster; render(); }
    const companyBtn = e.target.closest(".company-link");
    if (companyBtn) { state.view = "company"; state.selectedCompanyTicker = companyBtn.dataset.company; syncNav(); render(); }
    const aBtn = document.querySelector("#auth-button");
    if (e.target === aBtn) { state.user ? logout() : openLoginModal(); }
  });
});
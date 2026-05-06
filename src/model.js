
/**
 * Stock Dashboard - Logic Layer
 * Ralph-Loop Phase 4: SRE Robustness & Sanity Checks
 */

// --- SRE Utility Helpers ---
const ensureArray = (val) => Array.isArray(val) ? val : [];
const safeGet = (obj, path, fallback = "") => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj) ?? fallback;
};

function filterTopics(topics, { category = "全部", query = "" } = {}) {
  const normalizedQuery = query.trim().toLowerCase();
  const safeTopics = ensureArray(topics);

  return safeTopics.filter((topic) => {
    const categoryMatches = category === "全部" || topic.category === category;
    const companies = ensureArray(topic.companies);
    
    const searchable = [
      topic.title,
      topic.category,
      topic.summary,
      topic.catalyst,
      ...companies.flatMap((company) => [company.name, company.ticker, company.role]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return categoryMatches && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
}

function buildCompanyIndex(topics) {
  const safeTopics = ensureArray(topics);
  return safeTopics.flatMap((topic) =>
    ensureArray(topic.companies).map((company) => ({
      ...company,
      topicId: topic.id,
      topicTitle: topic.title,
      category: topic.category,
    })),
  );
}

function filterCompanies(companies, query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const safeCompanies = ensureArray(companies);
  if (!normalizedQuery) return safeCompanies;

  return safeCompanies.filter((company) => {
    if (!company) return false;
    return [company.ticker, company.name, company.role, company.topicTitle, company.category, company.market]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function buildHeatMap(topics) {
  const categoryMap = new Map();
  const safeTopics = ensureArray(topics);

  for (const topic of safeTopics) {
    if (!topic || !topic.category) continue;
    const entry = categoryMap.get(topic.category) ?? {
      category: topic.category,
      scoreTotal: 0,
      topicCount: 0,
      companyCount: 0,
    };

    entry.scoreTotal += (topic.score ?? 0);
    entry.topicCount += 1;
    entry.companyCount += ensureArray(topic.companies).length;
    categoryMap.set(topic.category, entry);
  }

  return [...categoryMap.values()]
    .map((entry) => ({
      category: entry.category,
      averageScore: entry.topicCount > 0 ? Math.round(entry.scoreTotal / entry.topicCount) : 0,
      topicCount: entry.topicCount,
      companyCount: entry.companyCount,
    }))
    .sort((a, b) => b.averageScore - a.averageScore || a.category.localeCompare(b.category, "zh-Hant"));
}

function groupRelationships(topic) {
  if (!topic) return [];
  const groups = new Map();

  for (const relationship of ensureArray(topic.relationships)) {
    if (!relationship || !relationship.group) continue;
    const nodes = groups.get(relationship.group) ?? [];
    nodes.push(relationship.label);
    groups.set(relationship.group, nodes);
  }

  return [...groups.entries()].map(([group, nodes]) => ({ group, nodes }));
}

function createTopicNetwork(topic, clusterId) {
  if (!topic) return { clusters: [], activeCluster: null, lanes: [], edgesByType: {} };
  
  const network = topic.network;
  if (!network) {
    return { clusters: [], activeCluster: null, lanes: [], edgesByType: {} };
  }

  const clusterViews = ensureArray(network.clusterViews);
  const activeCluster =
    clusterViews.find((cluster) => cluster.id === clusterId || cluster.label === clusterId) ??
    clusterViews[0] ??
    null;

  const source = activeCluster ?? network;
  if (!source) return { clusters: [], activeCluster: null, lanes: [], edgesByType: {} };

  const lanes = ensureArray(source.lanes);
  const nodes = ensureArray(source.nodes);
  const edges = ensureArray(source.edges);

  const laneMap = new Map(lanes.map((lane) => [lane.id, { ...lane, nodes: [] }]));
  const nodeLabelMap = new Map(nodes.map((node) => [node.id, node.label]));

  for (const node of nodes) {
    if (!node) continue;
    const lane = laneMap.get(node.lane);
    if (lane) lane.nodes.push(node);
  }

  const edgesByType = {};
  for (const edge of edges) {
    if (!edge || !edge.type) continue;
    edgesByType[edge.type] = (edgesByType[edge.type] ?? 0) + 1;
  }

  const formattedEdges = edges.map((edge) => ({
    from: nodeLabelMap.get(edge.from) ?? edge.from,
    to: nodeLabelMap.get(edge.to) ?? edge.to,
    type: edge.type,
  }));

  return {
    clusters: clusterViews.length > 0 ? clusterViews : ensureArray(network.clusters).map((label) => ({ id: label, label })),
    activeCluster,
    lanes: [...laneMap.values()],
    edgesByType,
    edges: formattedEdges,
  };
}

function createInsights(topics, { query = "" } = {}) {
  const safeTopics = ensureArray(topics);
  if (safeTopics.length === 0) {
    return [
      {
        title: "目前沒有符合條件的題材",
        body: "請調整分類或搜尋字詞，系統會重新整理產業摘要與公司清單。",
      },
    ];
  }

  const byScore = [...safeTopics].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const byDate = [...safeTopics].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const companyCount = filterCompanies(buildCompanyIndex(safeTopics), query).length;
  const heatMap = buildHeatMap(safeTopics);
  const topCategory = heatMap[0];

  return [
    {
      title: "最高動能題材",
      body: `${byScore[0]?.title ?? "未知"} 目前分數 ${byScore[0]?.score ?? 0}，主要催化來自「${byScore[0]?.catalyst ?? "未知"}」。`,
    },
    {
      title: "最新核實資料",
      body: `${byDate[0]?.title ?? "未知"} 於 ${byDate[0]?.updatedAt ?? "未知"} 更新，適合作為本週追蹤清單的起點。`,
    },
    {
      title: "供應鏈廣度",
      body: `目前篩選範圍涵蓋 ${safeTopics.length} 個題材與 ${companyCount} 筆公司角色，其中 ${topCategory?.category ?? "未知"} 平均分數最高。`,
    },
  ];
}

function createAnalysisReport(topics, { query = "" } = {}) {
  const safeTopics = ensureArray(topics);
  const topicCompanies = buildCompanyIndex(safeTopics);
  const groupCounts = new Map();
  const roleCounts = new Map();

  for (const topic of safeTopics) {
    for (const relationship of ensureArray(topic.relationships)) {
      if (!relationship || !relationship.group) continue;
      groupCounts.set(relationship.group, (groupCounts.get(relationship.group) ?? 0) + 1);
    }
  }

  for (const company of ensureArray(topicCompanies)) {
    if (!company || !company.role) continue;
    roleCounts.set(company.role, (roleCounts.get(company.role) ?? 0) + 1);
  }

  const momentumRanking = [...safeTopics]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .map((topic) => ({
      id: topic.id,
      title: topic.title,
      category: topic.category,
      score: topic.score,
      companyCount: ensureArray(topic.companies).length,
    }));

  const catalysts = momentumRanking.map((rankedTopic) => {
    const topic = safeTopics.find((item) => item.id === rankedTopic.id);
    return {
      title: topic?.title ?? rankedTopic.title,
      catalyst: topic?.catalyst ?? "未知",
      updatedAt: topic?.updatedAt ?? "未知",
      score: topic?.score ?? 0,
    };
  });

  const supplyChainCoverage = [...groupCounts.entries()]
    .map(([group, count], index) => ({ group, count, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map(({ group, count }) => ({ group, count }));

  const roleBreakdown = [...roleCounts.entries()]
    .map(([role, count], index) => ({ role, count, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map(({ role, count }) => ({ role, count }));

  const watchlist = momentumRanking.slice(0, 4).map((topic) => {
    const original = safeTopics.find((item) => item.id === topic.id);
    return {
      label: topic.title,
      score: topic.score,
      reason: `${original?.catalyst ?? "未知"}；可追蹤 ${topic.companyCount} 個公司角色。`,
    };
  });

  return {
    insights: createInsights(safeTopics, { query }),
    momentumRanking,
    catalysts,
    supplyChainCoverage,
    roleBreakdown,
    watchlist,
  };
}

function clampScore(score) {
  return Math.max(5, Math.min(99, Math.round(score ?? 0)));
}

function tickerSeed(ticker) {
  return String(ticker ?? "")
    .split("")
    .reduce((sum, char, index) => sum + Number(char || 0) * (index + 3), 0);
}

function scoreCompany(company, topic) {
  if (!company || !topic) return null;
  const seed = tickerSeed(company.ticker);
  const theme = clampScore(topic.score + (seed % 9) - 4);
  const fundamental = clampScore(topic.score - 8 + (seed % 17));
  const technical = clampScore(topic.score - 16 + ((seed * 3) % 31));
  const chips = clampScore(topic.score - 14 + ((seed * 5) % 29));
  const news = clampScore(topic.score - 10 + ((seed * 7) % 25));
  const totalScore = Number(
    (theme * 0.28 + fundamental * 0.2 + technical * 0.2 + chips * 0.16 + news * 0.16).toFixed(1),
  );

  return {
    ticker: company.ticker,
    name: company.name,
    role: company.role,
    topicTitle: topic.title,
    category: topic.category,
    catalyst: topic.catalyst,
    analyzedAt: topic.updatedAt,
    totalScore,
    sentiment: totalScore >= 60 ? "偏多" : "偏空",
    factors: {
      題材面: theme,
      基本面: fundamental,
      技術面: technical,
      籌碼面: chips,
      新聞面: news,
    },
    explanation: `${company.name} 主要受惠於「${topic.catalyst}」，在 ${topic.category} 題材中扮演 ${company.role} 角色。`,
    riskFlags: [
      `${topic.category} 題材分數已達 ${topic.score}，需留意估值反映程度。`,
      `${company.role} 需求若低於預期，分數可能快速下修。`,
    ],
    nextChecks: [
      `追蹤 ${company.ticker} 最新營收與法人籌碼。`,
      `比對 ${topic.title} 同題材公司的相對強弱。`,
    ],
  };
}

function buildScorecards(topics, query) {
  const normalizedQuery = query.trim().toLowerCase();
  const safeTopics = ensureArray(topics);
  const cards = safeTopics.flatMap((topic) => 
    ensureArray(topic.companies).map((company) => scoreCompany(company, topic))
  ).filter(Boolean);

  if (!normalizedQuery) return cards;

  return cards.filter((card) =>
    [card.ticker, card.name, card.role, card.topicTitle, card.category, card.catalyst]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

function createAiRankingReport(topics, { mode = "bullish", query = "" } = {}) {
  const modeSummaryByMode = {
    bullish: "看多模式偏重題材動能與基本面延續性，適合找出高分核心受惠股。",
    bearish: "看空模式會反向排序總分，適合找出題材或籌碼相對弱勢標的。",
    short: "短線動能模式提高技術面、籌碼面與新聞面的權重，偏向交易觀察。",
    swing: "波段趨勢模式預留給已產生公司 AI 分析後的中期追蹤清單。",
    deep: "深度研究模式補充解釋、風險旗標與下一步檢查項目，適合作為研究起點。",
  };
  const base = {
    updatedAtLabel: "示範資料即時整理",
    modeSummary: modeSummaryByMode[mode] ?? modeSummaryByMode.bullish,
    modes: [
      { id: "personal", label: "我的分析" },
      { id: "bullish", label: "看多 Top 10" },
      { id: "bearish", label: "看空 Top 10" },
      { id: "short", label: "短線動能 (Beta)" },
      { id: "swing", label: "波段趨勢 (Beta)" },
      { id: "deep", label: "深度研究" },
    ],
  };

  if (mode === "personal") {
    return {
      ...base,
      title: "我的分析",
      requiresLogin: true,
      items: [],
      emptyMessage: "請先登入以查看您的分析紀錄",
    };
  }

  if (mode === "swing") {
    return {
      ...base,
      title: "波段趨勢 (Beta)",
      items: [],
      emptyMessage: "排行榜尚無資料，點擊公司頁的 AI 分析後會自動出現在這裡。",
    };
  }

  const cards = buildScorecards(ensureArray(topics), query);
  const titleByMode = {
    bullish: "看多 Top 10",
    bearish: "看空 Top 10",
    short: "短線動能 (Beta)",
    deep: "深度研究",
  };

  const ranked = [...cards]
    .map((card) => {
      if (mode === "bearish") {
        return { ...card, sentiment: "偏空" };
      }

      if (mode !== "short") return card;

      const shortScore = Number(
        (card.factors.技術面 * 0.38 + card.factors.籌碼面 * 0.34 + card.factors.新聞面 * 0.28).toFixed(1),
      );
      return {
        ...card,
        totalScore: shortScore,
        sentiment: shortScore >= 60 ? "偏多" : "偏空",
        strategy: "短線動能 (Beta)",
      };
    })
    .sort((a, b) => {
      if (mode === "bearish") return (a.totalScore ?? 0) - (b.totalScore ?? 0) || (a.ticker ?? "").localeCompare(b.ticker ?? "");
      return (b.totalScore ?? 0) - (a.totalScore ?? 0) || (a.ticker ?? "").localeCompare(b.ticker ?? "");
    })
    .slice(0, 10)
    .map((card, index) => ({
      ...card,
      rank: index + 1,
      researchNote:
        mode === "deep"
          ? `${card.name} 的主要觀察點是「${card.catalyst}」，需同步檢查 ${card.role} 的訂單能見度與估值位置。`
          : "",
    }));

  return {
    ...base,
    title: titleByMode[mode] ?? titleByMode.bullish,
    items: ranked,
    emptyMessage: ranked.length === 0 ? "目前沒有符合條件的 AI 分析結果。" : "",
  };
}

function createCompanyDatabase(topics, snapshots = []) {
  const snapshotMap = new Map(ensureArray(snapshots).map((snapshot) => [snapshot.ticker, snapshot]));
  const rows = new Map();

  for (const company of buildCompanyIndex(ensureArray(topics))) {
    if (!company || !company.ticker) continue;
    const row =
      rows.get(company.ticker) ??
      {
        ticker: company.ticker,
        name: company.name,
        market: company.market,
        topicTitles: [],
        categories: [],
        roles: [],
        momentumTotal: 0,
        topicCount: 0,
      };

    if (!row.topicTitles.includes(company.topicTitle)) row.topicTitles.push(company.topicTitle);
    if (!row.categories.includes(company.category)) row.categories.push(company.category);
    if (!row.roles.includes(company.role)) row.roles.push(company.role);
    
    const topic = ensureArray(topics).find((t) => t.id === company.topicId);
    row.momentumTotal += topic?.score ?? 0;
    row.topicCount += 1;
    rows.set(company.ticker, row);
  }

  return [...rows.values()]
    .map((row) => {
      const snapshot = snapshotMap.get(row.ticker);
      return {
        ...row,
        momentumScore: row.topicCount > 0 ? Math.round(row.momentumTotal / row.topicCount) : 0,
        snapshotStatus: snapshot ? "updated" : "pending",
        lastPrice: snapshot?.lastPrice ?? null,
        changePct: snapshot?.changePct ?? null,
        volume: snapshot?.volume ?? null,
        signal: snapshot?.signal ?? "待更新",
      };
    })
    .sort((a, b) => b.momentumScore - a.momentumScore || (a.ticker ?? "").localeCompare(b.ticker ?? ""));
}

function createCompanyDetail(topics, snapshots = [], ticker) {
  if (!ticker) return null;
  const database = createCompanyDatabase(ensureArray(topics), snapshots);
  const company = database.find((row) => row.ticker === ticker);
  if (!company) return null;

  const snapshot = ensureArray(snapshots).find((item) => item.ticker === ticker) ?? null;
  const topicExposures = buildCompanyIndex(ensureArray(topics))
    .filter((item) => item.ticker === ticker)
    .map((item) => {
      const topic = ensureArray(topics).find((candidate) => candidate.id === item.topicId);
      return {
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        category: item.category,
        role: item.role,
        score: topic?.score ?? 0,
        catalyst: topic?.catalyst ?? "",
      };
    })
    .sort((a, b) => b.score - a.score || a.topicTitle.localeCompare(b.topicTitle, "zh-Hant"));

  const primaryAnalysis = buildScorecards(ensureArray(topics), "")
    .filter((card) => card && card.ticker === ticker)
    .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))[0];

  const exposureTopicIds = new Set(topicExposures.map((item) => item.topicId));
  const peerMap = new Map();
  for (const item of buildCompanyIndex(ensureArray(topics))) {
    if (!item || item.ticker === ticker || !exposureTopicIds.has(item.topicId)) continue;
    const entry = peerMap.get(item.ticker) ?? {
      ticker: item.ticker,
      name: item.name,
      roles: [],
      sharedTopics: [],
    };
    if (!entry.roles.includes(item.role)) entry.roles.push(item.role);
    if (!entry.sharedTopics.includes(item.topicTitle)) entry.sharedTopics.push(item.topicTitle);
    peerMap.set(item.ticker, entry);
  }

  return {
    ...company,
    snapshot,
    topicExposures,
    primaryAnalysis,
    peerCompanies: [...peerMap.values()].slice(0, 6),
  };
}

function createMarketSnapshot(topics, snapshots) {
  const snapshotMap = new Map(ensureArray(snapshots).map((snapshot) => [snapshot.ticker, snapshot]));

  return buildCompanyIndex(ensureArray(topics))
    .filter((company) => company && snapshotMap.has(company.ticker))
    .map((company) => {
      const snapshot = snapshotMap.get(company.ticker);
      return {
        ticker: company.ticker,
        name: company.name,
        role: company.role,
        topicTitle: company.topicTitle,
        lastPrice: snapshot?.lastPrice,
        changePct: snapshot?.changePct,
        volume: snapshot?.volume,
        signal: snapshot?.signal,
      };
    });
}

function createTrackedTickers(topics, extraTickers = []) {
  return [...new Set([...buildCompanyIndex(ensureArray(topics)).map((company) => company.ticker), ...ensureArray(extraTickers)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function createEtfDashboard(etfs, topics) {
  const safeEtfs = ensureArray(etfs);
  const companyTopics = new Map();
  for (const company of buildCompanyIndex(ensureArray(topics))) {
    const titles = companyTopics.get(company.ticker) ?? new Set();
    titles.add(company.topicTitle);
    companyTopics.set(company.ticker, titles);
  }

  const holdingMap = new Map();
  for (const etf of safeEtfs) {
    if (!etf) continue;
    for (const holding of ensureArray(etf.topHoldings)) {
      const entry = holdingMap.get(holding.ticker) ?? {
        ticker: holding.ticker,
        name: holding.name,
        etfTickers: new Set(),
        topicTitles: companyTopics.get(holding.ticker) ?? new Set(),
      };
      entry.etfTickers.add(etf.ticker);
      holdingMap.set(holding.ticker, entry);
    }
  }

  return {
    totalAum: Number(safeEtfs.reduce((sum, etf) => sum + (etf.aum ?? 0), 0).toFixed(1)),
    dailyInflow: Number(
      safeEtfs.filter((etf) => (etf.dailyFlow ?? 0) > 0).reduce((sum, etf) => sum + (etf.dailyFlow ?? 0), 0).toFixed(1),
    ),
    dailyOutflow: Number(
      safeEtfs.filter((etf) => (etf.dailyFlow ?? 0) < 0).reduce((sum, etf) => sum + (etf.dailyFlow ?? 0), 0).toFixed(1),
    ),
    weeklyFlow: Number(safeEtfs.reduce((sum, etf) => sum + (etf.weeklyFlow ?? 0), 0).toFixed(1)),
    funds: [...safeEtfs].sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)),
    tsmcLimit: [...safeEtfs]
      .map((etf) => ({
        ticker: etf.ticker,
        name: etf.name,
        tsmcWeight: etf.tsmcWeight,
        roomToLimit: Number((25 - (etf.tsmcWeight ?? 0)).toFixed(1)),
      }))
      .sort((a, b) => a.roomToLimit - b.roomToLimit),
    holdingOverlap: [...holdingMap.values()]
      .map((entry) => ({
        ticker: entry.ticker,
        name: entry.name,
        etfCount: entry.etfTickers.size,
        topicTitles: [...entry.topicTitles],
      }))
      .sort((a, b) => b.etfCount - a.etfCount || (a.ticker ?? "").localeCompare(b.ticker ?? "")),
  };
}

function createDailyFocusReport(topics, snapshots, etfs, etfMeta) {
  const safeTopics = ensureArray(topics);
  const marketRows = createMarketSnapshot(safeTopics, snapshots)
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
    .slice(0, 6);
  const etfDashboard = createEtfDashboard(ensureArray(etfs), safeTopics);
  const strongestTopic = [...safeTopics].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const biggestFlow = [...ensureArray(etfs)].sort((a, b) => (b.dailyFlow ?? 0) - (a.dailyFlow ?? 0))[0];

  return {
    headline: "每日焦點",
    lead: `${strongestTopic?.title ?? "未知"} 維持最高題材動能，${biggestFlow?.ticker ?? "未知"} ${biggestFlow?.name ?? "未知"} 今日資金流入 ${biggestFlow?.dailyFlow ?? 0} 億。`,
    marketMovers: marketRows,
    etfBrief: {
      sourceLabel: etfMeta?.sourceLabel ?? "未知",
      asOf: etfMeta?.asOf ?? "未知",
      etfCount: etfMeta?.etfCount ?? 0,
      totalAum: etfMeta?.totalAum ?? 0,
      tsmcLimitUsage: etfMeta?.tsmcLimitUsage ?? 0,
      dailyInflow: etfDashboard.dailyInflow,
      dailyOutflow: etfDashboard.dailyOutflow,
      weeklyFlow: etfDashboard.weeklyFlow,
    },
    watchItems: [
      `${strongestTopic?.category ?? "未知"}：${strongestTopic?.catalyst ?? "未知"}`,
      `${biggestFlow?.ticker ?? "未知"}：追蹤日流入 ${biggestFlow?.dailyFlow ?? 0} 億與持股集中度`,
      `公司資料庫：優先檢查 ${marketRows[0]?.ticker ?? "未知"} ${marketRows[0]?.name ?? "未知"} 的量價訊號`,
    ],
    riskNotes: [
      `台積電 25% 上限使用率 ${etfMeta?.tsmcLimitUsage ?? 0}%，高含積 ETF 需追蹤可加碼空間。`,
      "twstock snapshot 為離線更新資料，部署前應重新產生並人工檢查。",
    ],
  };
}

function createEtfFlowReport(events, etfs, date) {
  const safeEtfs = ensureArray(etfs);
  const etfNameMap = new Map(safeEtfs.map((etf) => [etf.ticker, etf.name]));
  const filteredEvents = ensureArray(events).filter((event) => event.date === date);
  const addTotal = Number(
    filteredEvents
      .filter((event) => (event.amount ?? 0) > 0)
      .reduce((sum, event) => sum + (event.amount ?? 0), 0)
      .toFixed(1),
  );
  const trimTotal = Number(
    filteredEvents
      .filter((event) => (event.amount ?? 0) < 0)
      .reduce((sum, event) => sum + (event.amount ?? 0), 0)
      .toFixed(1),
  );
  const etfMap = new Map();

  for (const event of filteredEvents) {
    if (!event || !event.etfTicker) continue;
    const entry = etfMap.get(event.etfTicker) ?? {
      etfTicker: event.etfTicker,
      etfName: etfNameMap.get(event.etfTicker) ?? event.etfTicker,
      addAmount: 0,
      trimAmount: 0,
      netAmount: 0,
    };

    if ((event.amount ?? 0) >= 0) entry.addAmount += (event.amount ?? 0);
    else entry.trimAmount += (event.amount ?? 0);
    entry.netAmount += (event.amount ?? 0);
    etfMap.set(event.etfTicker, entry);
  }

  const normalize = (entry) => ({
    ...entry,
    addAmount: Number(entry.addAmount.toFixed(1)),
    trimAmount: Number(entry.trimAmount.toFixed(1)),
    netAmount: Number(entry.netAmount.toFixed(1)),
  });

  return {
    date,
    addTotal,
    trimTotal,
    events: filteredEvents.sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0)),
    byEtf: [...etfMap.values()].map(normalize).sort((a, b) => b.netAmount - a.netAmount),
  };
}

/**
 * Loop 3: Global Retrieval Logic (Robustified)
 */

function buildGlobalCompanyIndex(topics) {
  const globalIndex = new Map();
  const safeTopics = ensureArray(topics);
  
  for (const topic of safeTopics) {
    if (!topic) continue;
    for (const company of ensureArray(topic.companies)) {
      if (!company || !company.ticker) continue;
      const existing = globalIndex.get(company.ticker) ?? {
        ticker: company.ticker,
        name: company.name,
        market: company.market,
        roles: [],
        topics: [],
      };
      
      if (!existing.roles.includes(company.role)) existing.roles.push(company.role);
      existing.topics.push({
        id: topic.id,
        title: topic.title,
        role: company.role,
        score: topic.score
      });
      
      globalIndex.set(company.ticker, existing);
    }
  }
  
  return [...globalIndex.values()];
}

function extractAllRoles(topics) {
  const roles = new Set();
  const safeTopics = ensureArray(topics);
  for (const topic of safeTopics) {
    if (!topic) continue;
    for (const company of ensureArray(topic.companies)) {
      if (company && company.role) roles.add(company.role);
    }
  }
  return [...roles].sort();
}

function getCompanyGlobalGraph(topics, ticker) {
  if (!ticker) return { nodes: [], links: [] };
  const safeTopics = ensureArray(topics);
  const nodes = [];
  const links = [];
  const nodeMap = new Map();
  
  const relatedTopics = safeTopics.filter(t => ensureArray(t.companies).some(c => c.ticker === ticker));
  
  const centerCompany = buildGlobalCompanyIndex(safeTopics).find(c => c.ticker === ticker);
  if (!centerCompany) return { nodes: [], links: [] };
  
  nodeMap.set(ticker, { id: ticker, label: centerCompany.name, kind: 'center' });
  nodes.push(nodeMap.get(ticker));
  
  for (const topic of relatedTopics) {
    if (!topic) continue;
    if (!nodeMap.has(topic.id)) {
      nodeMap.set(topic.id, { id: topic.id, label: topic.title, kind: 'topic' });
      nodes.push(nodeMap.get(topic.id));
    }
    
    links.push({ source: ticker, target: topic.id, type: 'belongs_to' });
    
    for (const company of ensureArray(topic.companies)) {
      if (!company || company.ticker === ticker) continue;
      
      if (!nodeMap.has(company.ticker)) {
        nodeMap.set(company.ticker, { id: company.ticker, label: company.name, kind: 'company' });
        nodes.push(nodeMap.get(company.ticker));
      }
      
      links.push({ source: topic.id, target: company.ticker, type: 'contains' });
    }
  }
  
  return { nodes, links };
}

// Explicitly attach to window for main.js access
window.filterTopics = filterTopics;
window.buildCompanyIndex = buildCompanyIndex;
window.filterCompanies = filterCompanies;
window.buildHeatMap = buildHeatMap;
window.groupRelationships = groupRelationships;
window.createTopicNetwork = createTopicNetwork;
window.createInsights = createInsights;
window.createAnalysisReport = createAnalysisReport;
window.createCompanyDatabase = createCompanyDatabase;
window.createCompanyDetail = createCompanyDetail;
window.createMarketSnapshot = createMarketSnapshot;
window.createTrackedTickers = createTrackedTickers;
window.createEtfDashboard = createEtfDashboard;
window.createDailyFocusReport = createDailyFocusReport;
window.createEtfFlowReport = createEtfFlowReport;
window.buildGlobalCompanyIndex = buildGlobalCompanyIndex;
window.extractAllRoles = extractAllRoles;
window.getCompanyGlobalGraph = getCompanyGlobalGraph;

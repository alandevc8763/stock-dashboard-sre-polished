const main = {
    async init() {
        await model.loadData();
        this.setupEventListeners();
        this.renderCategories();
        this.renderThemes('all');
        this.renderCompanies();
    },

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const view = e.target.dataset.view;
                this.switchView(view);
            });
        });

        // Category Filtering
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('category-pill')) {
                const category = e.target.dataset.category;
                this.filterCategory(category);
            }
        });

        // Company Search
        const searchInput = document.getElementById('companySearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.renderCompanies(e.target.value);
            });
        }

        // Modal Close
        document.getElementById('closeModal').addEventListener('click', () => {
            this.closeModal();
        });
    },

    switchView(viewId) {
        document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.view === viewId) item.classList.add('active');
        });
    },

    filterCategory(category) {
        document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
        document.querySelector(`[data-category="${category}"]`)?.classList.add('active');
        this.renderThemes(category);
    },

    renderCategories() {
        const container = document.getElementById('category-list');
        if (!container) return;
        
        model.data.categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'category-pill px-4 py-2 rounded-full text-sm border border-slate-700 hover:border-amber-400 transition-all';
            btn.dataset.category = cat;
            btn.textContent = cat;
            container.appendChild(btn);
        });
    },

    renderThemes(category = 'all') {
        const grid = document.getElementById('topic-grid');
        if (!grid) return;
        
        const topics = model.getTopics(category);
        grid.innerHTML = '';

        topics.forEach(topic => {
            const card = document.createElement('div');
            card.className = 'topic-card glass-panel p-6 relative group';
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        ${topic.category}
                    </span>
                    <span class="text-lg font-bold text-white">${topic.score} <span class="text-[10px] text-slate-500">Score</span></span>
                </div>
                <h3 class="text-xl font-bold text-white mb-2 group-hover:text-amber-400 transition-colors">${topic.title}</h3>
                <p class="text-sm text-slate-400 mb-6 line-clamp-2 leading-relaxed">${topic.desc}</p>
                <div class="flex items-center justify-between mt-auto">
                    <div class="text-[11px] text-slate-500 italic">
                        <i class="fa-solid fa-bolt text-amber-500 mr-1"></i> ${topic.catalyst}
                    </div>
                    <button class="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1">
                        探索產業地圖 <i class="fa-solid fa-arrow-right text-[10px]"></i>
                    </button>
                </div>
            `;
            card.onclick = () => this.openTopicModal(topic.id);
            grid.appendChild(card);
        });
    },

    renderCompanies(searchTerm = '') {
        const tbody = document.getElementById('company-table-body');
        if (!tbody) return;

        const companies = model.data.companies.filter(c => 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            c.role.toLowerCase().includes(searchTerm.toLowerCase())
        );

        tbody.innerHTML = '';
        companies.forEach(c => {
            const topic = model.getTopicById(c.topicId);
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-800/50 transition-colors group';
            row.innerHTML = `
                <td class="py-4 font-bold text-white">${c.name}</td>
                <td class="py-4 text-slate-400">${c.role}</td>
                <td class="py-4">
                    <span class="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700 group-hover:border-amber-500/50 transition-colors">
                        ${topic ? topic.title.split('｜')[0] : '未知題材'}
                    </span>
                </td>
                <td class="py-4 text-center">
                    <span class="font-mono text-amber-400">${c.score}</span>
                </td>
                <td class="py-4 text-center">
                    <span class="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500">${c.market}</span>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    openTopicModal(topicId) {
        const topic = model.getTopicById(topicId);
        const companies = model.getCompanies(topicId);
        const modal = document.getElementById('topic-modal');
        const content = document.getElementById('modal-content');

        content.innerHTML = `
            <div class="mb-8">
                <div class="flex items-center gap-3 mb-2">
                    <span class="text-xs font-bold uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        ${topic.category}
                    </span>
                    <span class="text-slate-500 text-xs">核實於 ${topic.updatedAt}</span>
                </div>
                <h2 class="text-3xl font-bold text-white mb-4">${topic.title}</h2>
                <p class="text-slate-300 leading-relaxed mb-6 text-lg">${topic.summary}</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <div class="p-4 rounded-lg bg-slate-900/50 border border-slate-800">
                        <div class="text-xs text-slate-500 mb-1 uppercase font-bold tracking-tighter">核心邏輯</div>
                        <div class="text-slate-300">${topic.desc}</div>
                    </div>
                    <div class="p-4 rounded-lg bg-slate-900/50 border border-slate-800">
                        <div class="text-xs text-slate-500 mb-1 uppercase font-bold tracking-tighter">關鍵催化劑</div>
                        <div class="text-amber-400 font-medium">${topic.catalyst}</div>
                    </div>
                </div>
            </div>
            <div>
                <h3 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-network-wired text-amber-500"></i> 關鍵公司佈局
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    ${companies.map(c => `
                        <div class="p-4 rounded-lg bg-slate-800/40 border border-slate-700 hover:border-amber-500/50 transition-all cursor-default group">
                            <div class="flex justify-between items-start mb-1">
                                <span class="font-bold text-white group-hover:text-amber-400 transition-colors">${c.name}</span>
                                <span class="text-xs font-mono text-amber-500">${c.score}</span>
                            </div>
                            <div class="text-xs text-slate-400 mb-2">${c.role}</div>
                            <div class="text-xs text-slate-500 leading-relaxed">${c.desc}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    },

    closeModal() {
        document.getElementById('topic-modal').classList.add('hidden');
        document.body.style.overflow = '';
    }
};

document.addEventListener('DOMContentLoaded', () => main.init());
window.main = main;

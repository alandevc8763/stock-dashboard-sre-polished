const model = {
    data: null,

    async loadData() {
        try {
            const response = await fetch('data.json');
            this.data = await response.json();
            return this.data;
        } catch (e) {
            console.error("Data loading failed:", e);
            return null;
        }
    },

    getTopics(category = 'all') {
        if (!this.data) return [];
        if (category === 'all') return this.data.topics;
        return this.data.topics.filter(t => t.category === category);
    },

    getCompanies(topicId = null) {
        if (!this.data) return [];
        if (!topicId) return this.data.companies;
        return this.data.companies.filter(c => c.topicId === topicId);
    },

    getCompanyById(id) {
        return this.data?.companies.find(c => c.id === id);
    },

    getTopicById(id) {
        return this.data?.topics.find(t => t.id === id);
    }
};

window.model = model;


/**
 * Stock Dashboard - Knowledge Graph Component
 * Ralph-Loop Phase 4: Professional Polish & Performance Optimization
 */

function renderKnowledgeGraph(topic, container) {
  container.innerHTML = '';

  const network = topic.network;
  if (!network) {
    container.innerHTML = '<div class="empty-state"><h2>此題材尚無結構化圖譜</h2><p>請切換至其他題材或查看傳統關係圖。</p></div>';
    return;
  }

  const nodes = [];
  const links = [];
  const nodeMap = new Map();

  network.nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, id: node.id });
    nodes.push({ id: node.id, label: node.label, kind: node.kind });
  });

  network.edges.forEach(edge => {
    if (nodeMap.has(edge.from) && nodeMap.has(edge.to)) {
      links.push({ source: edge.from, target: edge.to, type: edge.type });
    }
  });

  const width = container.clientWidth || 800;
  const height = 600;
  
  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('style', 'background: transparent; cursor: grab;');

  const g = svg.append('g');

  svg.call(d3.zoom().scaleExtent([0.1, 4]).on('zoom', (event) => {
    g.attr('transform', event.transform);
  }));

  // Performance Optimization: velocityDecay for smoother stability
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(120).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(60))
    .velocityDecay(0.4);

  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', d => {
      if (d.type === 'supply') return '#ffb05c'; // var(--amber)
      if (d.type === 'technology') return '#42d3ff'; // var(--cyan)
      return '#4a5568';
    })
    .attr('stroke-opacity', 0.4)
    .attr('stroke-width', 1.5)
    .attr('class', 'graph-link');

  const node = g.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'graph-node')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  node.append('circle')
    .attr('r', 22)
    .attr('fill', d => {
      if (d.kind === 'technology') return '#1a237e'; 
      if (d.kind === 'supply') return '#311b92';
      return '#2d3748';
    })
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.5)
    .attr('style', 'transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)');

  node.append('text')
    .text(d => d.label)
    .attr('text-anchor', 'middle')
    .attr('dy', 32)
    .attr('fill', '#eef4ff')
    .attr('font-size', '11px')
    .attr('font-weight', '600')
    .attr('style', 'pointer-events: none; text-shadow: 0 2px 4px rgba(0,0,0,0.8)');

  node.on('mouseover', function(event, d) {
    d3.select(this).select('circle')
      .transition().duration(200)
      .attr('r', 28)
      .attr('fill', '#ffb05c')
      .attr('stroke', '#fff');
    
    link.transition().duration(200)
      .attr('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.1)
      .attr('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? 3 : 1.5);
  });

  node.on('mouseout', function() {
    d3.select(this).select('circle')
      .transition().duration(200)
      .attr('r', 22)
      .attr('fill', d => {
        if (d.kind === 'technology') return '#1a237e';
        if (d.kind === 'supply') return '#311b92';
        return '#2d3748';
      });
    link.transition().duration(200)
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1.5);
  });

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }
}

window.renderKnowledgeGraph = renderKnowledgeGraph;

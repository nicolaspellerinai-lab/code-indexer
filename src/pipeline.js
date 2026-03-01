// Enrichir les relationships avec les données LLM
    const enrichedRelationships = relationships.map(r => {
      // Trouver la route correspondante dans les routes enrichies
      const route = this.parser.routes.find(pr => {
        const relEndpoint = (r.endpoint || '').split(' ')[1] || '';
        const fullPath = pr.fullPath || pr.path;
        const method = pr.method || '';
        
        // Comparer le path et la méthode
        const relPath = relEndpoint.startsWith('/') ? relEndpoint : '/' + relEndpoint;
        const fullPathWithoutApi = fullPath.replace(/^\/api/, '');
        
        // Si c'est une route auth, on compare sans le /api
        const isAuth = r.endpoint?.includes('/auth');
        const pathsMatch = isAuth 
          ? fullPathWithoutApi === relPath || fullPath === relPath
          : fullPath === relPath;
          
        return pathsMatch && (method.toLowerCase() === (r.endpoint?.split(' ')[0]?.toLowerCase() || ''));
      });
      
      // Si on trouve la route, ajouter les données LLM
      if (route && route.llmEnrichment) {
        return {
          ...r,
          llmEnrichment: route.llmEnrichment
        };
      }
      return r;
    });

    await fs.mkdir('data', { recursive: true });
    await fs.writeFile('data/relationships.json', JSON.stringify(enrichedRelationships, null, 2));
    await fs.writeFile('data/generated-openapi.json', JSON.stringify(openAPI, null, 2));
            req.write(body);
            req.end();
        });
    }

    buildBasicSchema(params) {
        const schema = { query: { properties: {} }, body: { properties: {} } };
        if (!params) return schema;
        
        params.forEach(p => {
            if (p.in === 'query') schema.query.properties[p.name] = { type: 'string', required: p.required };
            if (p.in === 'body' && p.properties) {
                p.properties.forEach(prop => {
                    schema.body.properties[prop] = { type: 'string', required: false };
                });
            }
        });
        return schema;
    }

    buildBasicResponses() {
        return {
            "200": { "description": "Success" },
            "400": { "description": "Bad Request" },
            "500": { "description": "Internal Server Error" }
        };
    }

    parseExamples(text) {
        // Tente d'extraire des blocs de code JSON
        const jsonBlocks = text.match(/```json\n([\s\S]*?)\n```/g);
        if (jsonBlocks) {
            return jsonBlocks.map(block => {
                try {
                    return JSON.parse(block.replace(/```json\n|\n```/g, ''));
                } catch (e) {
                    return null;
                }
            }).filter(Boolean);
        }
        return text; // Retourne le texte brut si pas de JSON
    }
}

module.exports = LlmEnricher;

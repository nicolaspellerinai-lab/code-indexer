/**
 * GitService - Infrastructure pour automatisation Git (Preparer pour PR)
 * Ce service est une BASE pour future implementation de generation automatique de PR
 * 
 * Utilisation future:
 * const gitService = require('./services/gitService');
 * await gitService.createBranch('docs/update-swagger');
 * await gitService.commitPatches(patches);
 * await gitService.createPR('Update Swagger Documentation');
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class GitService {
  constructor(options = {}) {
    this.repoPath = options.repoPath || process.cwd();
    this.branchName = options.branchName || null;
    this.commitMessage = options.commitMessage || 'Update documentation';
  }

  /**
   * Verifie si le repertoire est un depot Git
   */
  isGitRepo() {
    try {
      return fs.existsSync(path.join(this.repoPath, '.git'));
    } catch (e) {
      return false;
    }
  }

  /**
   * Execute une commande git
   */
  async exec(command, options = {}) {
    return new Promise((resolve, reject) => {
      const cwd = options.cwd || this.repoPath;
      exec(command, { cwd }, (error, stdout, stderr) => {
        if (error) {
          if (options.silent) {
            resolve({ success: false, error: error.message });
          } else {
            reject(error);
          }
        } else {
          resolve({ success: true, stdout, stderr });
        }
      });
    });
  }

  /**
   * Cree une nouvelle branche
   */
  async createBranch(branchName) {
    if (!this.isGitRepo()) {
      return { success: false, error: 'Not a git repository' };
    }

    try {
      // Verifier si la branche existe deja
      const check = await this.exec(`git rev-parse --verify ${branchName}`, { silent: true });
      if (check.success) {
        // Branch existe deja, on se positionne dessus
        await this.exec(`git checkout ${branchName}`);
      } else {
        // Creer et basculer sur la nouvelle branche
        await this.exec(`git checkout -b ${branchName}`);
      }
      
      this.branchName = branchName;
      return { success: true, branchName };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Ajoute des fichiers a l'index
   */
  async add(files) {
    const filesStr = Array.isArray(files) ? files.join(' ') : files;
    try {
      await this.exec(`git add ${filesStr}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cree un commit
   */
  async commit(message) {
    try {
      const result = await this.exec(`git commit -m "${message}"`);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Applique un patch depuis un fichier
   */
  async applyPatch(patchPath) {
    try {
      const result = await this.exec(`git apply ${patchPath}`);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtient le status Git
   */
  async status() {
    try {
      const result = await this.exec('git status --porcelain');
      return { success: true, output: result.stdout };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtient la branche courante
   */
  async currentBranch() {
    try {
      const result = await this.exec('git rev-parse --abbrev-ref HEAD');
      return { success: true, branch: result.stdout.trim() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============ METHODES POUR FUTURE IMPLEMENTATION PR ============
  
  /**
   * Cree une Pull Request (A implementer avec GitHub/GitLab API)
   * 
   * Future implementation typique:
   * - Utiliser @octokit/rest pour GitHub
   * - Utiliser @gitlab/api-client pour GitLab
   * - Authentification via token
   */
  async createPullRequest(options = {}) {
    const { title, body, baseBranch = 'main', headBranch } = options;
    
    // Placeholder - a implementer avec l'API GitHub/GitLab
    console.log("⚠️  createPullRequest: Fonctionnalite non implantee");
    console.log("   Cela necessitera:");
    console.log("   - Installation de @octokit/rest (pour GitHub)");
    console.log("   - Configuration du token authentication");
    console.log("   - Implementation des appels API");
    
    return {
      success: false,
      error: 'Not implemented - requires API client setup',
      futureImplementation: {
        provider: 'github', // or 'gitlab'
        required: ['@octokit/rest', 'GITHUB_TOKEN env var'],
        steps: [
          '1. Install @octokit/rest',
          '2. Set GITHUB_TOKEN environment variable',
          '3. Initialize Octokit with token',
          '4. Call pulls.create({ owner, repo, title, body, head, base })'
        ]
      }
    };
  }

  /**
   * Genere un rapport de patches pour PR
   */
  generatePRDescription(patches) {
    let description = '# Documentation Updates\n\n';
    description += 'This PR updates the API documentation based on automatic analysis.\n\n';
    
    // Resume des changements
    description += '## Summary\n';
    description += `- Total routes: ${patches.metadata?.totalRoutes || 0}\n`;
    description += `- New routes documented: ${patches.metadata?.newRoutes || 0}\n`;
    description += `- Improved documentation: ${patches.metadata?.improvedRoutes || 0}\n`;
    description += `- Unchanged: ${patches.metadata?.unchangedRoutes || 0}\n\n`;
    
    // Liste des changements
    if (patches.patches?.length > 0) {
      description += '## Changes\n\n';
      
      for (const patch of patches.patches) {
        const emoji = patch.type === 'improved' ? '📝' : '🆕';
        description += `${emoji} ${patch.method} ${patch.path} (${patch.type})\n`;
      }
    }
    
    return description;
  }

  /**
   * Valide les patches avant soumission
   */
  validatePatches(patches) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!patches || !patches.patches) {
      validation.valid = false;
      validation.errors.push('Invalid patches format');
      return validation;
    }

    // Verifier que les fichiers existent
    for (const patch of patches.patches) {
      if (patch.file && !fs.existsSync(patch.file)) {
        validation.warnings.push(`File not found: ${patch.file}`);
      }
    }

    return validation;
  }
}

module.exports = GitService;

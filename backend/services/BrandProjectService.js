const { Op } = require('sequelize');
const { BrandProject } = require('../models');
const ProjectFieldNormalizationService = require('./ProjectFieldNormalizationService');

class BrandProjectService {
  canonicalTerm(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  compactTerm(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
  }

  collectNameTerms(project) {
    const terms = [
      project?.name,
      ...(Array.isArray(project?.aliases) ? project.aliases : [])
    ]
      .map((item) => this.canonicalTerm(item))
      .filter(Boolean);
    return Array.from(new Set([
      ...terms,
      ...terms.map((term) => this.compactTerm(term)).filter((term) => term.length >= 3)
    ]));
  }

  findDuplicateInRows(candidate, rows, excludeId = null) {
    const candidateTerms = new Set(this.collectNameTerms(candidate));
    if (!candidateTerms.size) return null;
    const excluded = excludeId == null ? null : Number(excludeId);

    return (Array.isArray(rows) ? rows : []).find((row) => {
      if (!row) return false;
      if (excluded != null && Number(row.id) === excluded) return false;
      if (row.status === 'archived') return false;
      return this.collectNameTerms(row).some((term) => candidateTerms.has(term));
    }) || null;
  }

  findWebsiteDuplicateInRows(candidate, rows, excludeId = null) {
    const website = ProjectFieldNormalizationService.normalizeWebsite(candidate?.website);
    if (!website) return null;
    const excluded = excludeId == null ? null : Number(excludeId);

    return (Array.isArray(rows) ? rows : []).find((row) => {
      if (!row) return false;
      if (excluded != null && Number(row.id) === excluded) return false;
      if (row.status === 'archived') return false;
      return ProjectFieldNormalizationService.normalizeWebsite(row.website) === website;
    }) || null;
  }

  async findDuplicateProject(userId, candidate, excludeId = null) {
    const rows = await BrandProject.findAll({
      where: {
        user_id: userId,
        status: { [Op.ne]: 'archived' }
      },
      attributes: ['id', 'name', 'aliases', 'status'],
      raw: true
    });
    return this.findDuplicateInRows(candidate, rows, excludeId);
  }

  async findDuplicateProjectWebsite(userId, candidate, excludeId = null) {
    const rows = await BrandProject.findAll({
      where: {
        user_id: userId,
        status: { [Op.ne]: 'archived' }
      },
      attributes: ['id', 'website', 'status'],
      raw: true
    });
    return this.findWebsiteDuplicateInRows(candidate, rows, excludeId);
  }
}

module.exports = new BrandProjectService();

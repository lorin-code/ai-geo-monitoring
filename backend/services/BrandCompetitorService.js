const { BrandCompetitor } = require('../models');
const CitationAnalysisService = require('./CitationAnalysisService');

class BrandCompetitorService {
  canonicalName(value) {
    return String(value || '').trim().replace(/[\s._-]+/g, '').toLowerCase();
  }

  canonicalWebsiteDomain(value) {
    const domain = CitationAnalysisService.normalizeDomain(value).replace(/^www\./, '');
    return CitationAnalysisService.isValidDomain(domain) ? domain : '';
  }

  websitesOverlap(left, right) {
    const leftDomain = this.canonicalWebsiteDomain(left);
    const rightDomain = this.canonicalWebsiteDomain(right);
    if (!leftDomain || !rightDomain) return false;
    return CitationAnalysisService.sameOrSubdomain(leftDomain, rightDomain)
      || CitationAnalysisService.sameOrSubdomain(rightDomain, leftDomain);
  }

  buildTerms(row) {
    return [
      row?.name,
      ...(Array.isArray(row?.aliases) ? row.aliases : [])
    ]
      .map((item) => this.canonicalName(item))
      .filter(Boolean);
  }

  findDuplicateInRows(candidate, rows, excludeId = null) {
    const candidateTerms = new Set(this.buildTerms(candidate));
    if (!candidateTerms.size) return null;
    const excluded = excludeId == null ? null : Number(excludeId);
    return (Array.isArray(rows) ? rows : []).find((row) => {
      if (!row) return false;
      if (excluded != null && Number(row.id) === excluded) return false;
      return this.buildTerms(row).some((term) => candidateTerms.has(term));
    }) || null;
  }

  matchesBrand(candidate, brand) {
    const candidateTerms = new Set(this.buildTerms(candidate));
    if (!candidateTerms.size) return false;
    return this.buildTerms(brand).some((term) => candidateTerms.has(term));
  }

  matchesBrandWebsite(candidate, brand) {
    return this.websitesOverlap(candidate?.website, brand?.website);
  }

  findBrandConflictInRows(brand, competitorRows) {
    return this.findDuplicateInRows(brand, competitorRows);
  }

  findBrandWebsiteConflictInRows(brand, competitorRows, excludeId = null) {
    return this.findWebsiteConflictInRows(brand, competitorRows, excludeId);
  }

  findWebsiteConflictInRows(candidate, competitorRows, excludeId = null) {
    const excluded = excludeId == null ? null : Number(excludeId);
    return (Array.isArray(competitorRows) ? competitorRows : []).find((row) => {
      if (!row) return false;
      if (excluded != null && Number(row.id) === excluded) return false;
      return this.websitesOverlap(row?.website, candidate?.website);
    }) || null;
  }

  async findDuplicateCompetitor(projectId, candidate, excludeId = null) {
    const rows = await BrandCompetitor.findAll({
      where: { project_id: projectId },
      attributes: ['id', 'name', 'aliases'],
      raw: true
    });
    return this.findDuplicateInRows(candidate, rows, excludeId);
  }

  async findDuplicateCompetitorWebsite(projectId, candidate, excludeId = null) {
    const rows = await BrandCompetitor.findAll({
      where: { project_id: projectId },
      attributes: ['id', 'name', 'website'],
      raw: true
    });
    return this.findWebsiteConflictInRows(candidate, rows, excludeId);
  }
}

module.exports = new BrandCompetitorService();

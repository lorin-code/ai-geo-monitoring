const { Op } = require('sequelize');

class PromptAnalysisCleanupService {
  normalizeIds(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0)));
  }

  async deleteForPrompts(projectId, promptIds, models) {
    const ids = this.normalizeIds(promptIds);
    if (!ids.length) return { records: 0, metrics: 0, details: 0, schedules: 0, reports: 0 };

    const { DetectionSchedule, QuestionRecord, VisibilityMetric, ResultDetail, ReportSnapshot } = models;
    const records = await QuestionRecord.findAll({
      where: {
        project_id: projectId,
        tracked_prompt_id: { [Op.in]: ids }
      },
      attributes: ['id'],
      raw: true
    });
    const recordIds = this.normalizeIds(records.map((item) => item.id));

    const schedules = DetectionSchedule
      ? await DetectionSchedule.destroy({
        where: {
          project_id: projectId,
          tracked_prompt_id: { [Op.in]: ids }
        }
      })
      : 0;

    const metricConditions = [{ prompt_id: { [Op.in]: ids } }];
    if (recordIds.length) metricConditions.push({ question_record_id: { [Op.in]: recordIds } });
    const metrics = await VisibilityMetric.destroy({
      where: {
        project_id: projectId,
        [Op.or]: metricConditions
      }
    });

    const reports = ReportSnapshot
      ? await ReportSnapshot.destroy({
        where: {
          project_id: projectId,
          status: 'generated'
        }
      })
      : 0;

    let details = 0;
    let deletedRecords = 0;
    if (recordIds.length) {
      details = await ResultDetail.destroy({
        where: {
          question_record_id: { [Op.in]: recordIds }
        }
      });
      deletedRecords = await QuestionRecord.destroy({
        where: {
          project_id: projectId,
          id: { [Op.in]: recordIds }
        }
      });
    }

    return { records: deletedRecords, metrics, details, schedules, reports };
  }

  async deleteForProject(projectId, models) {
    const id = Number(projectId);
    if (!Number.isInteger(id) || id <= 0) return { records: 0, metrics: 0, details: 0, reports: 0 };

    const { QuestionRecord, VisibilityMetric, ResultDetail, ReportSnapshot } = models;
    const records = await QuestionRecord.findAll({
      where: { project_id: id },
      attributes: ['id'],
      raw: true
    });
    const recordIds = this.normalizeIds(records.map((item) => item.id));

    const metrics = await VisibilityMetric.destroy({ where: { project_id: id } });

    let details = 0;
    let deletedRecords = 0;
    if (recordIds.length) {
      details = await ResultDetail.destroy({
        where: {
          question_record_id: { [Op.in]: recordIds }
        }
      });
      deletedRecords = await QuestionRecord.destroy({
        where: {
          project_id: id,
          id: { [Op.in]: recordIds }
        }
      });
    }

    const reports = ReportSnapshot
      ? await ReportSnapshot.destroy({
        where: {
          project_id: id,
          status: 'generated'
        }
      })
      : 0;

    return { records: deletedRecords, metrics, details, reports };
  }
}

module.exports = new PromptAnalysisCleanupService();

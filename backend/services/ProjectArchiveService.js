const { DetectionSchedule, ReportSnapshot } = require('../models');

class ProjectArchiveService {
  async archiveProject(project, repositories = {}) {
    if (!project) {
      return { ok: false, status: 404, message: '品牌项目不存在' };
    }
    const ScheduleRepository = repositories.DetectionSchedule || DetectionSchedule;
    const ReportRepository = repositories.ReportSnapshot || ReportSnapshot;
    await project.update({
      status: 'archived',
      monitoring_enabled: false,
      monitoring_next_run_at: null
    });
    await ScheduleRepository.update(
      { enabled: false },
      { where: { project_id: project.id, enabled: true } }
    );
    await ReportRepository.destroy({
      where: { project_id: project.id, status: 'generated' }
    });
    return { ok: true, project };
  }
}

module.exports = new ProjectArchiveService();

class ProjectLifecycleService {
  toPlain(project) {
    return project && typeof project.toJSON === 'function' ? project.toJSON() : project;
  }

  isActiveProject(project) {
    const data = this.toPlain(project);
    return !!data && (data.status || 'active') === 'active';
  }

  validateActiveProject(project, message = '归档项目不能执行该操作') {
    if (!project) {
      return { ok: false, status: 404, message: '品牌项目不存在' };
    }
    if (!this.isActiveProject(project)) {
      return { ok: false, status: 400, message };
    }
    return { ok: true };
  }

  validateProjectUpdate(project, body = {}) {
    if (!project) {
      return { ok: false, status: 404, message: '品牌项目不存在' };
    }
    if (this.isActiveProject(project)) return { ok: true };

    const keys = Object.keys(body || {}).filter((key) => body[key] !== undefined);
    const restoreOnly = keys.length === 1 && keys[0] === 'status' && body.status === 'active';
    if (restoreOnly) return { ok: true };

    return {
      ok: false,
      status: 400,
      message: '归档项目请先恢复后再编辑'
    };
  }
}

module.exports = new ProjectLifecycleService();

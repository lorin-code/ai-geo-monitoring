class AccessControlService {
  canAccessUser(actor, targetUserId) {
    if (!actor) return false;
    if (actor.role === 'admin') return true;
    const actorId = Number(actor.id);
    const targetId = Number(targetUserId);
    return Number.isInteger(actorId) && Number.isInteger(targetId) && actorId === targetId;
  }
}

module.exports = new AccessControlService();

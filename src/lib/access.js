// Who may add to and manage a division's registers (used by the workspace and the assistant).
export function workspaceAccess(me, perms, d) {
  const member = me.division === d.id;
  // An open division (Проєкти) is a shared space: anyone who works with divisions may add to it.
  const canEdit = me.role === 'admin' || ((member || d.open) && me.role !== 'guest' && perms.divisions >= 1) || (me.role === 'lead' && d.lead === me.id);
  const canManage = me.role === 'admin' || (me.role === 'lead' && member);
  return { member, canEdit, canManage };
}

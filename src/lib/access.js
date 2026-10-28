// Who may add to and manage a division's registers (used by the workspace and the assistant).
// People are not tied to a division for now: everyone who works with divisions may add to any of them,
// leads and administrators manage them all. Clearance still decides what each person sees.
export function workspaceAccess(me, perms, d) {
  const canEdit = me.role === 'admin' || me.role === 'lead' || (me.role !== 'guest' && perms.divisions >= 1);
  const canManage = me.role === 'admin' || me.role === 'lead';
  return { member: false, canEdit, canManage, open: !!d?.open };
}

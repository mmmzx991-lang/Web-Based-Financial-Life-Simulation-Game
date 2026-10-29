export function switchUser(state, user) {
  const changed = (state.user?.id || null) !== (user?.id || null);
  if (changed) {
    state.session = null;
    state.games = [];
  }
  state.user = user;
  return changed;
}

// One menu of the header at a time: opening the language list closes the account menu and the other way round.
export function closeOthers(box) {
  document.querySelectorAll('.lang-pick.open').forEach((x) => {
    if (x === box) return;
    x.classList.remove('open');
    x.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
  });
}

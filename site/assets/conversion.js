/* Aprimoramento progressivo: sem JS, todos os exemplos continuam disponíveis. */
(() => {
  const controls = document.querySelector('[data-scenario-controls]');
  if (!controls) return;
  const tabs = [...controls.querySelectorAll('[data-scenario]')];
  const panels = tabs.map(tab => document.getElementById(tab.hash.slice(1)));
  if (panels.some(panel => !panel)) return;

  function select(index, focus = false) {
    tabs.forEach((tab, current) => {
      const selected = current === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[current].hidden = !selected;
    });
    if (focus) tabs[index].focus();
  }

  controls.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.id = `explore-tab-${tab.dataset.scenario}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', tab.id);
    panels[index].tabIndex = 0;
    tab.addEventListener('click', event => {
      // Preserve native links for a new tab or an explicit modified click.
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      select(index);
    });
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else if (event.key === ' ') { event.preventDefault(); select(index); return; }
      else return;
      event.preventDefault();
      select(next, true);
    });
  });
  function selectHash() {
    const index = panels.findIndex(panel => `#${panel.id}` === location.hash);
    if (index >= 0) select(index);
    return index;
  }
  if (selectHash() < 0) select(0);
  window.addEventListener('hashchange', selectHash);
})();

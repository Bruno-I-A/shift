/* AUTO-GENERATED from app.jsx — edit the .jsx then run "node build.js" */
(function () {
/* Shift Systems · app entry */

const {
  Header,
  Hero,
  Provocative,
  Solutions,
  Process,
  Positioning,
  CTA,
  Footer,
  MarqueeStrip,
  useCinematic,
  useCursor,
  useTilt,
  useScrollProgress
} = window;
function App() {
  useCinematic();
  useScrollProgress();
  useCursor();
  useTilt();
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen relative"
  }, /*#__PURE__*/React.createElement(Header, null), /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement(Hero, null), /*#__PURE__*/React.createElement(Provocative, null), /*#__PURE__*/React.createElement(Solutions, null), /*#__PURE__*/React.createElement(Process, null), /*#__PURE__*/React.createElement(Positioning, null), /*#__PURE__*/React.createElement(CTA, null)), /*#__PURE__*/React.createElement(Footer, null));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));

// tell the boot screen the site has mounted → it lifts and the site forms in.
// fire via rAF (paints first) AND a timeout fallback (rAF is paused on hidden tabs).
(function () {
  var fired = false;
  function signal() {
    if (fired) return;
    fired = true;
    window.dispatchEvent(new Event('shift:react-ready'));
  }
  requestAnimationFrame(function () {
    requestAnimationFrame(signal);
  });
  setTimeout(signal, 150);
})();
})();

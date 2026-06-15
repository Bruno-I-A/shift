/* Shift Systems · app entry */

const { Header, Hero, Provocative, Solutions, Process, Positioning, CTA, Footer, MarqueeStrip,
  useCinematic, useCursor, useTilt, useScrollProgress } = window;

function App() {
  useCinematic();
  useScrollProgress();
  useCursor();
  useTilt();
  return (
    <div className="min-h-screen relative">
      <Header />
      <main>
        <Hero />
        <Provocative />
        <Solutions />
        <Process />
        <Positioning />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

// tell the boot screen the site has mounted → it lifts and the site forms in.
// fire via rAF (paints first) AND a timeout fallback (rAF is paused on hidden tabs).
(function () {
  var fired = false;
  function signal() { if (fired) return; fired = true; window.dispatchEvent(new Event('shift:react-ready')); }
  requestAnimationFrame(function () { requestAnimationFrame(signal); });
  setTimeout(signal, 150);
})();

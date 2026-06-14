/* Shift Systems · app entry */

const { Header, Hero, Provocative, Solutions, Process, Positioning, CTA, Footer, MarqueeStrip,
  useReveal, useCursor, useTilt, useScrollProgress } = window;

function App() {
  useReveal();
  useScrollProgress();
  useCursor();
  useTilt();
  return (
    <div className="min-h-screen relative">
      <Header />
      <main>
        <Hero />
        <MarqueeStrip />
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

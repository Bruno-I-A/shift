/* Shift Systems · app entry */

const { Header, Hero, Provocative, Solutions, Process, Positioning, CTA, Footer, MarqueeStrip, useReveal } = window;

function App() {
  useReveal();
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

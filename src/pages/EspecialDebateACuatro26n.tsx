import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";

const FALLBACK_HEADER_HEIGHT = 72;

export default function EspecialDebateACuatro26n() {
  const [headerHeight, setHeaderHeight] = useState(FALLBACK_HEADER_HEIGHT);
  // Parámetro anticaché: nuevo en cada visita, para que el iframe no sirva una copia antigua.
  const CACHE_BUST = useMemo(() => Date.now(), []);

  useEffect(() => {
    document.title = "El Debate a Cuatro · Especiales RepIndex";

    const measure = () => {
      const header = document.querySelector<HTMLElement>("header.sticky");
      setHeaderHeight(header ? header.offsetHeight : FALLBACK_HEADER_HEIGHT);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <Layout>
      <Helmet>
        <link rel="canonical" href="https://repindex.ai/especiales/debates/debate-a-cuatro-26n" />
      </Helmet>
      <iframe
        src={`/especiales/debates/src/debate-a-cuatro-26n.html?v=${CACHE_BUST}${typeof window !== "undefined" ? window.location.hash : ""}`}
        title="El Debate a Cuatro · RepIndex"
        style={{
          width: "100%",
          height: `calc(100vh - ${headerHeight}px)`,
          border: "none",
          display: "block",
        }}
      />
    </Layout>
  );
}

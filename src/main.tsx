import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "./integrations/supabase/client";
import { tryDevAutoLogin } from "./lib/devAutoLogin";

(async () => {
  await tryDevAutoLogin(supabase);
  createRoot(document.getElementById("root")!).render(<App />);
})();

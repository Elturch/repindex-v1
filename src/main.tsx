import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Auto-login for Preview is initiated inside AuthProvider so React can
// render a loading state while the session is being established.
createRoot(document.getElementById("root")!).render(<App />);

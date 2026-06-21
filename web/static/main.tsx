import { createRoot } from "react-dom/client";

import DictionaryApp from "../app/dictionary-app";
import "../app/globals.css";

createRoot(document.getElementById("root") as HTMLElement).render(<DictionaryApp />);

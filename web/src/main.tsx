import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ProjectsThemeProvider } from "./theme";
import "./pydemia.css";
import "./styles.css";
import "./app.css";
import "./theme-overrides.css";
import "./task-workspace.css";

const root = document.getElementById("root");
if (!root) throw new Error("앱을 표시할 root 요소가 없습니다.");
createRoot(root).render(<StrictMode><ProjectsThemeProvider><App /></ProjectsThemeProvider></StrictMode>);

import { hydrateRoot } from "react-dom/client";
import RootLayout from "../app/layout";
import PageContent from "./routes";
import { parseBootstrap } from "./bootstrap";

const element = document.getElementById("career-bootstrap");
if (!element?.textContent) throw Error("Page data is unavailable.");
const bootstrap = parseBootstrap(element.textContent);
hydrateRoot(document, <RootLayout bootstrap={bootstrap}><PageContent page={bootstrap.page} context={bootstrap.context} /></RootLayout>);

// Test-only fixture; built outside all production output directories.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ProviderConnections from "../../../app/components/ProviderConnections";
import { listeners, snapshot, switchAccount, relink, revalidate, resolveNext } from "./api";

function App() {
  const [mounted, setMounted] = useState(true), [observed, setObserved] = useState(snapshot());
  useEffect(() => {
    const update = () => setObserved(snapshot());
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  return <><h1>Career Finder provider lifecycle test</h1><p>Local synthetic accounts only. No external requests. Real React component and account-status hook; HTTP responses are injected only in this test bundle.</p>
    <section aria-label="Test controls"><button onClick={() => setMounted(false)}>Unmount connection card</button><button onClick={() => setMounted(true)}>Mount connection card</button><button onClick={revalidate}>Revalidate current account</button><button onClick={switchAccount}>Switch browser account</button><button onClick={relink}>Reconnect as replacement identity</button><button onClick={resolveNext}>Resolve delayed request</button></section>
    <h2>Observed synthetic requests</h2><pre aria-label="Request evidence">{JSON.stringify(observed, null, 2)}</pre>
    {mounted ? <ProviderConnections accountId="synthetic-owner-a" /> : <p role="status">Connection card unmounted</p>}</>;
}
const root = document.getElementById("root");
if (!root) throw new Error("Synthetic fixture root is missing");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);

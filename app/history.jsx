import { HistoryScreen } from "../src/screens/DinkScreens";
import { RouteErrorState } from "../src/components/AppShell";

export default function HistoryRoute() {
  return <HistoryScreen />;
}

export function ErrorBoundary({ error, retry }) {
  return <RouteErrorState error={error} retry={retry} />;
}

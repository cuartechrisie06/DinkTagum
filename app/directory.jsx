import { DirectoryScreen } from "../src/screens/PlayersScreen";
import { RouteErrorState } from "../src/components/AppShell";

export default function DirectoryRoute() {
  return <DirectoryScreen />;
}

export function ErrorBoundary({ error, retry }) {
  return <RouteErrorState error={error} retry={retry} />;
}

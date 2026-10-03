import { FeedScreen } from "../src/screens/FeedScreen";
import { RouteErrorState } from "../src/components/AppShell";

export default function FeedRoute() {
  return <FeedScreen />;
}

export function ErrorBoundary({ error, retry }) {
  return <RouteErrorState error={error} retry={retry} />;
}

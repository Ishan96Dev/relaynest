/** Re-mounts on every navigation, so each page gets the entrance animation. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
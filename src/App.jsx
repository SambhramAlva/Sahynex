import { useState } from "react";
import AuthPage from "./components/auth/AuthPage";
import RepoSetup from "./components/auth/RepoSetup";
import Sidebar from "./components/layout/Sidebar";
import CommitsPage from "./components/pages/CommitsPage";
import Dashboard from "./components/pages/Dashboard";
import InboxPage from "./components/pages/InboxPage";
import IssuesPage from "./components/pages/IssuesPage";
import ProfilePage from "./components/pages/ProfilePage";
import ResolverPage from "./components/pages/ResolverPage";
import ReviewPage from "./components/pages/ReviewPage";
import { MOCK_COMMITS, MOCK_INBOX, MOCK_ISSUES } from "./data/mockData";

export default function App() {
  const [authStep, setAuthStep] = useState("auth");
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [issues] = useState(MOCK_ISSUES);
  const [commits] = useState(MOCK_COMMITS);
  const [inbox, setInbox] = useState(MOCK_INBOX);
  const [selectedIssue, setSelectedIssue] = useState(null);

  const handleAuth = (u) => {
    setUser(u);
    setAuthStep("repo");
  };

  const handleRepoSetup = (cfg) => {
    setUser((prev) => ({ ...prev, ...cfg }));
    setAuthStep("app");
  };

  const handleDisconnect = () => {
    setUser((prev) => ({ ...prev, repo: undefined, token: undefined }));
    setAuthStep("repo");
  };

  if (authStep === "auth") return <AuthPage onAuth={handleAuth} />;
  if (authStep === "repo") return <RepoSetup user={user} onSetup={handleRepoSetup} />;

  return (
    <div className="scanline-overlay min-h-screen md:flex">
      <Sidebar page={page} setPage={setPage} user={user} inbox={inbox} />
      <main className="min-h-screen flex-1 md:ml-[220px]">
        {page === "dashboard" && <Dashboard issues={issues} commits={commits} inbox={inbox} setPage={setPage} />}
        {page === "issues" && <IssuesPage issues={issues} setPage={setPage} setSelectedIssue={setSelectedIssue} />}
        {page === "commits" && <CommitsPage commits={commits} />}
        {page === "review" && <ReviewPage />}
        {page === "resolver" && <ResolverPage issue={selectedIssue} />}
        {page === "inbox" && (
          <InboxPage inbox={inbox} setInbox={setInbox} setPage={setPage} setSelectedIssue={setSelectedIssue} issues={issues} />
        )}
        {page === "profile" && <ProfilePage user={user} onDisconnect={handleDisconnect} />}
      </main>
    </div>
  );
}

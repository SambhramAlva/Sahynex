export const MOCK_ISSUES = [
    {
        id: 1,
        number: 42,
        title: "Fix memory leak in WebSocket handler",
        state: "open",
        labels: ["bug", "critical"],
        assignee: "ai-agent",
        branch: "fix/issue-42-ws-memleak",
        progress: 65,
        pr: "#89",
    },
    {
        id: 2,
        number: 38,
        title: "Add rate limiting to API endpoints",
        state: "open",
        labels: ["enhancement"],
        assignee: null,
        branch: null,
        progress: 0,
        pr: null,
    },
    {
        id: 3,
        number: 35,
        title: "Refactor authentication middleware",
        state: "solving",
        labels: ["refactor"],
        assignee: "ai-agent",
        branch: "refactor/issue-35-auth",
        progress: 30,
        pr: null,
    },
    {
        id: 4,
        number: 31,
        title: "Update dependency versions",
        state: "review",
        labels: ["maintenance"],
        assignee: "ai-agent",
        branch: "chore/issue-31-deps",
        progress: 100,
        pr: "#85",
    },
    {
        id: 5,
        number: 27,
        title: "Implement dark mode toggle",
        state: "merged",
        labels: ["feature"],
        assignee: "ai-agent",
        branch: "feat/issue-27-darkmode",
        progress: 100,
        pr: "#80",
    },
];

export const MOCK_COMMITS = [
    {
        hash: "a3f2c91",
        msg: "fix(ws): resolve memory leak in connection pool cleanup",
        branch: "fix/issue-42-ws-memleak",
        time: "2 min ago",
        author: "gitAgent[bot]",
        issue: 42,
    },
    {
        hash: "b7d4e02",
        msg: "fix(ws): add proper cleanup for zombie connections",
        branch: "fix/issue-42-ws-memleak",
        time: "8 min ago",
        author: "gitAgent[bot]",
        issue: 42,
    },
    {
        hash: "c1a8f13",
        msg: "refactor(auth): extract token validation to separate service",
        branch: "refactor/issue-35-auth",
        time: "22 min ago",
        author: "gitAgent[bot]",
        issue: 35,
    },
    {
        hash: "d5e9g24",
        msg: "chore(deps): bump express from 4.18.1 to 4.19.2",
        branch: "chore/issue-31-deps",
        time: "1 hr ago",
        author: "gitAgent[bot]",
        issue: 31,
    },
    {
        hash: "e2b6h35",
        msg: "chore(deps): update jest to 29.7.0",
        branch: "chore/issue-31-deps",
        time: "1 hr ago",
        author: "gitAgent[bot]",
        issue: 31,
    },
];

export const MOCK_INBOX = [
    {
        id: 1,
        type: "merge_request",
        title: "PR #89 ready to merge",
        body: "The fix for issue #42 (memory leak in WebSocket handler) has been reviewed and is ready to merge into main. All tests pass.",
        time: "5 min ago",
        read: false,
        issue: 42,
        pr: 89,
    },
    {
        id: 2,
        type: "review",
        title: "PR #85 review complete",
        body: "Dependency update PR has been reviewed. No breaking changes detected. Safe to merge.",
        time: "1 hr ago",
        read: false,
        issue: 31,
        pr: 85,
    },
    {
        id: 3,
        type: "info",
        title: "Issue #38 analysis started",
        body: "Started analyzing issue #38 - Rate limiting for API endpoints. Estimated completion: 12 minutes.",
        time: "3 hr ago",
        read: true,
        issue: 38,
    },
    {
        id: 4,
        type: "merge_request",
        title: "PR #80 was merged",
        body: "Dark mode toggle feature (issue #27) was successfully merged into main.",
        time: "2 days ago",
        read: true,
        issue: 27,
        pr: 80,
    },
];

const REPO_THEMES = [
    {
        issueTitles: [
            "Fix webhook retry storm in delivery worker",
            "Add audit trail for admin role changes",
            "Refactor session refresh pipeline",
            "Optimize search index warmup",
            "Ship staged rollout toggle for billing UI",
        ],
        labels: [
            ["bug", "critical"],
            ["enhancement"],
            ["refactor"],
            ["maintenance"],
            ["feature"],
        ],
        prefixes: ["fix", "feat", "refactor", "chore", "feat"],
    },
    {
        issueTitles: [
            "Patch race condition in job scheduler",
            "Introduce request signing for outbound hooks",
            "Split monolithic auth reducer",
            "Upgrade background worker dependencies",
            "Build saved filters for issue triage",
        ],
        labels: [
            ["bug"],
            ["enhancement", "security"],
            ["refactor"],
            ["maintenance"],
            ["feature"],
        ],
        prefixes: ["fix", "feat", "refactor", "chore", "feat"],
    },
    {
        issueTitles: [
            "Resolve cache invalidation bug in repo sync",
            "Add contributor insights export",
            "Modularize notification ingestion service",
            "Refresh CI image versions",
            "Deliver keyboard shortcuts for review queue",
        ],
        labels: [
            ["bug", "critical"],
            ["enhancement"],
            ["refactor"],
            ["maintenance"],
            ["feature"],
        ],
        prefixes: ["fix", "feat", "refactor", "chore", "feat"],
    },
];

function hashString(value) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash;
}

function getRepoSlug(repoUrl) {
    return repoUrl
        .replace(/^https?:\/\/github\.com\//i, "")
        .replace(/\.git$/i, "")
        .replace(/^github\.com\//i, "")
        .trim();
}

function buildBranchName(prefix, issueNumber, title) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24);

    return `${prefix}/issue-${issueNumber}-${slug}`;
}

export function createRepoWorkspace(repoUrl, repoId) {
    const slug = getRepoSlug(repoUrl) || repoId;
    const hash = hashString(repoId);
    const theme = REPO_THEMES[hash % REPO_THEMES.length];
    const numberBase = 20 + (hash % 50);
    const shortRepo = slug.split("/").pop() || "repo";
    const repoTag = shortRepo.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 4) || "repo";
    const states = ["open", "open", "solving", "review", "merged"];
    const progressValues = [55, 0, 35, 100, 100];
    const prNumbers = [numberBase + 70, null, null, numberBase + 66, numberBase + 61];
    const targetBranches = ["main", "develop", "release"];
    const testRunners = ["npm test", "pnpm test", "vitest run"];

    const issues = theme.issueTitles.map((title, index) => {
        const number = numberBase + (theme.issueTitles.length - index) * 3;

        return {
            id: index + 1,
            number,
            title: `${title}`,
            state: states[index],
            labels: theme.labels[index],
            assignee: states[index] === "open" && index === 1 ? null : "ai-agent",
            branch: states[index] === "open" && index === 1 ? null : buildBranchName(theme.prefixes[index], number, title),
            progress: progressValues[index],
            pr: prNumbers[index] ? `#${prNumbers[index]}` : null,
        };
    });

    const commits = [
        {
            id: `${repoId}-commit-1`,
            hash: `${repoTag}${(hash % 9000) + 1000}`.slice(0, 7),
            msg: `fix(${shortRepo}): stabilize ${issues[0].title.toLowerCase()}`,
            branch: issues[0].branch,
            time: "4 min ago",
            author: "gitAgent[bot]",
            issue: issues[0].number,
        },
        {
            id: `${repoId}-commit-2`,
            hash: `${repoTag}${(hash % 8000) + 2000}`.slice(0, 7),
            msg: `feat(${shortRepo}): scaffold ${issues[1].title.toLowerCase()}`,
            branch: buildBranchName("feat", issues[1].number, issues[1].title),
            time: "18 min ago",
            author: "gitAgent[bot]",
            issue: issues[1].number,
        },
        {
            id: `${repoId}-commit-3`,
            hash: `${repoTag}${(hash % 7000) + 3000}`.slice(0, 7),
            msg: `refactor(${shortRepo}): simplify ${issues[2].title.toLowerCase()}`,
            branch: issues[2].branch,
            time: "41 min ago",
            author: "gitAgent[bot]",
            issue: issues[2].number,
        },
        {
            id: `${repoId}-commit-4`,
            hash: `${repoTag}${(hash % 6000) + 4000}`.slice(0, 7),
            msg: `chore(${shortRepo}): ship ${issues[3].title.toLowerCase()}`,
            branch: issues[3].branch,
            time: "1 hr ago",
            author: "gitAgent[bot]",
            issue: issues[3].number,
        },
    ];

    const inbox = [
        {
            id: `${repoId}-message-1`,
            type: "merge_request",
            title: `${slug} PR ${issues[0].pr || "#pending"} ready for review`,
            body: `The latest fix for issue #${issues[0].number} in ${slug} passed checks and is queued for human review.`,
            time: "6 min ago",
            read: false,
            issue: issues[0].number,
            pr: prNumbers[0],
        },
        {
            id: `${repoId}-message-2`,
            type: "review",
            title: `${slug} dependency update reviewed`,
            body: `Issue #${issues[3].number} finished validation. The maintenance branch is ready for merge.`,
            time: "1 hr ago",
            read: false,
            issue: issues[3].number,
            pr: prNumbers[3],
        },
        {
            id: `${repoId}-message-3`,
            type: "info",
            title: `${slug} analysis started for issue #${issues[1].number}`,
            body: `Agent started working on ${issues[1].title.toLowerCase()} for ${slug}.`,
            time: "3 hr ago",
            read: true,
            issue: issues[1].number,
        },
    ];

    return {
        id: repoId,
        repo: repoUrl,
        token: "",
        issues,
        commits,
        inbox,
        config: {
            branchPrefix: `${theme.prefixes[0]}/, ${theme.prefixes[1]}/, ${theme.prefixes[3]}/`,
            targetBranch: targetBranches[hash % targetBranches.length],
            autoAssignIssues: hash % 2 === 0 ? "Enabled" : "Manual",
            prReviewRequired: hash % 3 === 0 ? "No" : "Yes",
            testRunner: testRunners[hash % testRunners.length],
        },
        currentPage: "dashboard",
        selectedIssueId: issues[0]?.id || null,
    };
}

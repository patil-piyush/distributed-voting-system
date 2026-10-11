import { useEffect, useState, useRef, useCallback } from 'react';
import { NODES, login, getCandidates, castVote, getStatus, getTally, getDebugState } from './api';
import { connectAllSockets } from './socket';
import SummaryStrip from './components/SummaryStrip.jsx';
import NodeStatus from './components/NodeStatus.jsx';
import NodeDetailModal from './components/NodeDetailModal.jsx';
import ReplicationTab from './components/ReplicationTab.jsx';
import EventsTab from './components/EventsTab.jsx';
import VoteTab from './components/VoteTab.jsx';
import LiveTally from './components/LiveTally.jsx';
import AuditPanel from './components/AuditPanel.jsx';
import MutexPanel from './components/MutexPanel.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'replication', label: 'Replication' },
  { id: 'events', label: 'Events' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'mutex', label: 'Mutual Exclusion' },
  { id: 'vote', label: 'Vote' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [token, setToken] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [debugStates, setDebugStates] = useState({});
  const [connected, setConnected] = useState({});
  const [tally, setTally] = useState({});
  const [message, setMessage] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [lastElectionAt, setLastElectionAt] = useState(null);

  // Response code counters for votes
  const [responseCounts, setResponseCounts] = useState({ 200: 0, 202: 0, 409: 0 });

  // Leadership history by term: { [term]: nodeId }
  const [leadershipHistory, setLeadershipHistory] = useState({});

  // Vote activity feed
  const [voteActivity, setVoteActivity] = useState(() => {
    try {
      const stored = localStorage.getItem('voteActivity');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Timeline events capped at 100
  const [clusterEvents, setClusterEvents] = useState([]);
  const [mutexEvents, setMutexEvents] = useState([]);

  const debounceTimerRef = useRef(null);

  const fetchAllDebugStates = useCallback(async () => {
    await Promise.allSettled(
      NODES.map(async (n) => {
        try {
          const ds = await getDebugState(n.url);
          setDebugStates((prev) => ({ ...prev, [n.id]: { ...ds, _fetchedAt: Date.now() } }));
          setConnected((prev) => ({ ...prev, [n.id]: true }));
          if (ds.role === 'leader' && ds.term) {
            setLeadershipHistory((prev) => ({ ...prev, [ds.term]: ds.nodeId }));
          }
        } catch (_) {
          setConnected((prev) => ({ ...prev, [n.id]: false }));
        }
      })
    );
  }, []);

  const debouncedFetchDebug = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchAllDebugStates();
    }, 150);
  }, [fetchAllDebugStates]);

  useEffect(() => {
    getCandidates().then(setCandidates).catch(() => {});

    // Initial status fetch
    NODES.forEach((n) => {
      getStatus(n.url)
        .then((s) => {
          setStatuses((prev) => ({ ...prev, [n.id]: s }));
          setConnected((prev) => ({ ...prev, [n.id]: true }));
        })
        .catch(() => setConnected((prev) => ({ ...prev, [n.id]: false })));
    });

    getTally(NODES[0].url).then(setTally).catch(() => {});

    fetchAllDebugStates();

    // Poll /debug/state every 1s
    const pollInterval = setInterval(() => {
      fetchAllDebugStates();
    }, 1000);

    const disconnectSockets = connectAllSockets({
      onConnect: (nodeId) => {
        setConnected((prev) => ({ ...prev, [nodeId]: true }));
        setClusterEvents((prev) =>
          [
            {
              at: new Date().toISOString(),
              nodeId,
              type: 'node-connected',
              detail: {},
            },
            ...prev,
          ].slice(0, 100)
        );
      },
      onStatus: (nodeId, data) => {
        setStatuses((prev) => ({ ...prev, [nodeId]: data }));
        setConnected((prev) => ({ ...prev, [nodeId]: true }));
        debouncedFetchDebug();
      },
      onTally: (data) => setTally(data),
      onDisconnect: (nodeId) => {
        setConnected((prev) => ({ ...prev, [nodeId]: false }));
        setClusterEvents((prev) =>
          [
            {
              at: new Date().toISOString(),
              nodeId,
              type: 'node-disconnected',
              detail: {},
            },
            ...prev,
          ].slice(0, 100)
        );
      },
      onVoteActivity: (data) => {
        setVoteActivity((prev) => {
          const updated = [data, ...prev].slice(0, 25);
          try {
            localStorage.setItem('voteActivity', JSON.stringify(updated));
          } catch (_) {}
          return updated;
        });
      },
      onMutex: (data) => {
        setMutexEvents((prev) => [data, ...prev].slice(0, 100));
      },
      onClusterEvent: (data) => {
        setClusterEvents((prev) => [data, ...prev].slice(0, 100));
        if (data.type === 'leader-elected') {
          setLastElectionAt(Date.now());
          if (data.term && data.nodeId) {
            setLeadershipHistory((prev) => ({ ...prev, [data.term]: data.nodeId }));
          }
        } else if (data.type === 'electionStarted') {
          setLastElectionAt(Date.now());
        }
      },
    });

    return () => {
      clearInterval(pollInterval);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      disconnectSockets();
    };
  }, [fetchAllDebugStates, debouncedFetchDebug]);

  async function handleLogin(voterId, password) {
    setMessage('');
    try {
      const t = await login(voterId, password);
      setToken(t);
    } catch (err) {
      setMessage(err.response?.data?.error || 'login failed');
    }
  }

  async function handleVote(candidateId) {
    setMessage('');
    try {
      const result = await castVote(token, candidateId);
      const code = result.status === 'committed' ? 200 : result.status === 'pending' ? 202 : 200;
      setResponseCounts((prev) => ({ ...prev, [code]: (prev[code] || 0) + 1 }));

      setMessage(`Vote cast via ${result.viaNode} — status: ${result.status || 'processed'}`);
      if (result.status === 'committed') setHasVoted(true);
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) {
        setResponseCounts((prev) => ({ ...prev, 409: (prev[409] || 0) + 1 }));
      } else if (status === 202) {
        setResponseCounts((prev) => ({ ...prev, 202: (prev[202] || 0) + 1 }));
      }
      setMessage(err.response?.data?.error || 'vote failed');
    }
  }

  function handleLogout() {
    setToken(null);
    setHasVoted(false);
    setMessage('');
  }

  // Quorum & leader calculations
  const reachableCount = Object.values(connected).filter(Boolean).length;
  const hasQuorum = reachableCount >= 3;

  const leaderEntry =
    Object.values(debugStates).find((ds) => ds?.role === 'leader' && connected[ds.nodeId]) ||
    Object.values(statuses).find((s) => s?.role === 'leader' && connected[s.nodeId]);

  const leaderId = leaderEntry?.nodeId || null;
  const currentTerm = leaderEntry?.term ?? leaderEntry?.currentTerm ?? 0;
  const leaderLastLogIndex = leaderEntry?.lastLogIndex ?? (leaderEntry?.logLength ? leaderEntry.logLength - 1 : 0);

  // Total committed votes
  const totalCommittedVotes = Object.values(tally).reduce((a, b) => a + b, 0);

  const selectedNodeData = selectedNodeId
    ? {
        nodeId: selectedNodeId,
        debugState: debugStates[selectedNodeId],
        connected: !!connected[selectedNodeId],
      }
    : null;

  return (
    <div className="app">
      <header>
        <div className="header-top">
          <h1>Distributed Voting System</h1>
          <span className="cluster-tag">Raft Consensus · 5 Nodes</span>
        </div>
        <p className="subtitle">
          Passive backend telemetry & consensus visualization dashboard
          {leaderId ? ` — current leader: ${leaderId} (Term ${currentTerm})` : ' — election in progress'}
        </p>
      </header>

      {/* Cluster Quorum Warning Banner */}
      {!hasQuorum && (
        <div className="quorum-banner">
          ⚠ No quorum ({reachableCount}/5 nodes reachable): votes will return 202 pending
        </div>
      )}

      {/* Overview Summary Strip */}
      <SummaryStrip
        leaderId={leaderId}
        term={currentTerm}
        reachableCount={reachableCount}
        totalNodes={5}
        totalVotes={totalCommittedVotes}
        lastElectionAt={lastElectionAt}
      />

      {/* Tab Navigation */}
      <nav className="tab-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className={`tab-btn ${activeTab === tab.id ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          <section className="grid">
            <div className="panel node-panel">
              <div className="panel-header-row">
                <h2>Cluster Node Status</h2>
                <span className="tab-sub">Click any node card for detailed log & telemetry</span>
              </div>
              <div className="node-grid">
                {NODES.map((n) => (
                  <NodeStatus
                    key={n.id}
                    nodeId={n.id}
                    status={statuses[n.id]}
                    debugState={debugStates[n.id]}
                    connected={connected[n.id]}
                    leaderId={leaderId}
                    leaderLastLogIndex={leaderLastLogIndex}
                    onSelectNode={(id) => setSelectedNodeId(id)}
                  />
                ))}
              </div>
            </div>

            <div className="panel tally-panel">
              <h2>Live Tally</h2>
              <LiveTally tally={tally} candidates={candidates} />
            </div>
          </section>
        </div>
      )}

      {/* Tab 2: Replication */}
      {activeTab === 'replication' && (
        <div className="tab-content">
          <ReplicationTab
            nodes={NODES}
            debugStates={debugStates}
            connected={connected}
            statuses={statuses}
          />
        </div>
      )}

      {/* Tab 3: Events */}
      {activeTab === 'events' && (
        <div className="tab-content">
          <EventsTab
            events={clusterEvents}
            onClearEvents={() => setClusterEvents([])}
            leadershipHistory={leadershipHistory}
          />
        </div>
      )}

      {/* Tab 4: Consistency */}
      {activeTab === 'consistency' && (
        <div className="tab-content">
          <section className="panel audit-panel">
            <AuditPanel />
          </section>
        </div>
      )}

      {/* Tab 5: Mutual Exclusion */}
      {activeTab === 'mutex' && (
        <div className="tab-content">
          <section className="panel mutex-container">
            <MutexPanel events={mutexEvents} />
          </section>
        </div>
      )}

      {/* Tab 6: Vote */}
      {activeTab === 'vote' && (
        <div className="tab-content">
          <VoteTab
            nodes={NODES}
            token={token}
            candidates={candidates}
            tally={tally}
            voteActivity={voteActivity}
            responseCounts={responseCounts}
            onLogin={handleLogin}
            onVote={handleVote}
            onLogout={handleLogout}
            message={message}
            hasVoted={hasVoted}
          />
        </div>
      )}

      {/* Node Detail Modal */}
      {selectedNodeData && (
        <NodeDetailModal
          node={selectedNodeData}
          onClose={() => setSelectedNodeId(null)}
        />
      )}

      <footer>
        <p>Demo voter accounts: voter1..voter30, password: pass1234</p>
      </footer>
    </div>
  );
}

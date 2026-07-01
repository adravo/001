import { Environment, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { Avatar, AvatarHandle } from './components/Avatar';
import { ChatPanel } from './components/ChatPanel';
import { ChatMessage, fetchTtsAudio, sendChatMessage } from './lib/api';
import { LipSyncEngine } from './lib/lipSyncEngine';

const DEFAULT_AVATAR_URL =
  import.meta.env.VITE_DEFAULT_AVATAR_URL ||
  'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?morphTargets=ARKit,Oculus%20Visemes&textureAtlas=1024';

type Tab = 'chat' | 'admin';

function App() {
  const [tenantId, setTenantId] = useState('demo');
  const [orgName, setOrgName] = useState('Acme Corp');
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR_URL);
  const [tab, setTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const avatarRef = useRef<AvatarHandle>(null);
  const lipSyncEngine = useMemo(() => new LipSyncEngine(), []);

  const handleSend = async (text: string) => {
    setErrorMessage(null);
    const history = messages;
    setMessages([...history, { role: 'trainee', content: text }]);
    setIsLoading(true);

    try {
      const result = await sendChatMessage(tenantId, orgName, text, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
      avatarRef.current?.triggerGesture(result.tone);

      setIsSpeaking(true);
      try {
        const audioBlob = await fetchTtsAudio(tenantId, result.reply);
        if (audioBlob) {
          await lipSyncEngine.speakWithAudio(audioBlob);
        } else {
          await lipSyncEngine.speakWithBrowserTts(result.reply);
        }
      } finally {
        setIsSpeaking(false);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>AI Training Assistant</h1>
        <div className="tenant-controls">
          <label>
            Customer account
            <input value={tenantId} onChange={(e) => setTenantId(e.target.value || 'demo')} />
          </label>
          <label>
            Org name (spoken persona)
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </label>
          <label>
            Avatar GLB URL
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
          </label>
        </div>
      </header>

      <main className="app-main">
        <div className="avatar-stage">
          <Canvas camera={{ position: [0, 1.6, 1.4], fov: 30 }} shadows>
            <ambientLight intensity={0.6} />
            <directionalLight position={[2, 4, 2]} intensity={1.2} castShadow />
            <Avatar ref={avatarRef} avatarUrl={avatarUrl} mouthLevel={lipSyncEngine.level} />
            <Environment preset="city" />
            <OrbitControls
              target={[0, 1.5, 0]}
              enablePan={false}
              minDistance={0.8}
              maxDistance={3}
              maxPolarAngle={Math.PI / 1.8}
            />
          </Canvas>
        </div>

        <div className="side-panel">
          <nav className="tabs">
            <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
              Chat
            </button>
            <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>
              Admin
            </button>
          </nav>
          {tab === 'chat' ? (
            <ChatPanel
              messages={messages}
              isLoading={isLoading}
              isSpeaking={isSpeaking}
              errorMessage={errorMessage}
              onSend={handleSend}
            />
          ) : (
            <AdminPanel tenantId={tenantId} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

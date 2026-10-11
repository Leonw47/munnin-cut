import React from 'react';
import { Clapperboard, Music, Type, Smile, Sparkles, ArrowLeftRight, Palette, Captions } from 'lucide-react';
import { useStore } from '../store.js';
import MediaPanel from '../panels/MediaPanel.jsx';
import AudioPanel from '../panels/AudioPanel.jsx';
import TextPanel from '../panels/TextPanel.jsx';
import StickersPanel from '../panels/StickersPanel.jsx';
import { EffectsPanel, FiltersPanel } from '../panels/FxPanels.jsx';
import TransitionsPanel from '../panels/TransitionsPanel.jsx';
import CaptionsPanel from '../panels/CaptionsPanel.jsx';

const TABS = [
  { id: 'media', name: 'Mídia', icon: Clapperboard, C: MediaPanel },
  { id: 'audio', name: 'Áudio', icon: Music, C: AudioPanel },
  { id: 'text', name: 'Texto', icon: Type, C: TextPanel },
  { id: 'captions', name: 'Legendas', icon: Captions, C: CaptionsPanel },
  { id: 'stickers', name: 'Stickers', icon: Smile, C: StickersPanel },
  { id: 'effects', name: 'Efeitos', icon: Sparkles, C: EffectsPanel },
  { id: 'transitions', name: 'Transições', icon: ArrowLeftRight, C: TransitionsPanel },
  { id: 'filters', name: 'Filtros', icon: Palette, C: FiltersPanel },
];

export default function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  const T = TABS.find((t) => t.id === tab) || TABS[0];
  return (
    <div className="panel">
      <div className="lp-tabs">
        {TABS.map(({ id, name, icon: Icon }) => (
          <button key={id} className={`lp-tab ${tab === id ? 'active' : ''}`} onClick={() => useStore.setState({ leftTab: id })}>
            <Icon size={18} strokeWidth={1.8} />
            {name}
          </button>
        ))}
      </div>
      <div className="lp-body"><T.C /></div>
    </div>
  );
}

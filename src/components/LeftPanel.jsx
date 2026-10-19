import React from 'react';
import { Clapperboard, Music, Type, Smile, Sparkles, ArrowLeftRight, Palette, Captions, Shapes, AudioLines } from 'lucide-react';
import ShapesPanel from '../panels/ShapesPanel.jsx';
import { useStore } from '../store.js';
import MediaPanel from '../panels/MediaPanel.jsx';
import AudioPanel from '../panels/AudioPanel.jsx';
import SfxPanel from '../panels/SfxPanel.jsx';
import TextPanel from '../panels/TextPanel.jsx';
import StickersPanel from '../panels/StickersPanel.jsx';
import { EffectsPanel, FiltersPanel } from '../panels/FxPanels.jsx';
import TransitionsPanel from '../panels/TransitionsPanel.jsx';
import CaptionsPanel from '../panels/CaptionsPanel.jsx';

const TABS = [
  { id: 'media', name: 'Mídia', icon: Clapperboard, C: MediaPanel },
  { id: 'audio', name: 'Áudio', icon: Music, C: AudioPanel },
  { id: 'sfx', name: 'Sons', icon: AudioLines, C: SfxPanel },
  { id: 'text', name: 'Texto', icon: Type, C: TextPanel },
  { id: 'captions', name: 'Legendas', icon: Captions, C: CaptionsPanel },
  { id: 'stickers', name: 'Stickers', icon: Smile, C: StickersPanel },
  { id: 'shapes', name: 'Formas', icon: Shapes, C: ShapesPanel },
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

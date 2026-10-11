import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import TopBar from './TopBar.jsx';
import LeftPanel from './LeftPanel.jsx';
import Player from './Player.jsx';
import Inspector from './Inspector.jsx';
import Timeline from './Timeline.jsx';
import ExportDialog from './ExportDialog.jsx';
import TrimDialog from './TrimDialog.jsx';
import MediaStatusBar from './MediaStatusBar.jsx';
import { Modal } from './ui.jsx';

const SHORTCUTS = [
  ['Reproduzir / pausar', 'Espaço'],
  ['Dividir clipe no cursor', 'Ctrl + B'],
  ['Excluir seleção', 'Delete'],
  ['Desfazer / refazer', 'Ctrl + Z / Ctrl + Y'],
  ['Copiar / colar / duplicar', 'Ctrl + C / V / D'],
  ['Quadro anterior / próximo', '← / →'],
  ['Voltar / avançar 1 segundo', 'Shift + ← / →'],
  ['Início / fim', 'Home / End'],
  ['Zoom da linha do tempo', '+ / −  ou  Ctrl + roda do mouse'],
  ['Importar mídia', 'Ctrl + I'],
  ['Salvar agora', 'Ctrl + S'],
  ['Exportar', 'Ctrl + E'],
  ['Ferramentas do desenvolvedor', 'F12'],
];

export default function Editor() {
  const modal = useStore((s) => s.modal);
  const [tlH, setTlH] = useState(() => Math.round(window.innerHeight * 0.38));
  const drag = useRef(null);

  useEffect(() => {
    const onResize = () => setTlH((h) => Math.min(h, window.innerHeight - 300));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startDrag = (e) => {
    drag.current = { y: e.clientY, h: tlH };
    const move = (ev) => {
      const h = drag.current.h - (ev.clientY - drag.current.y);
      setTlH(Math.max(170, Math.min(window.innerHeight - 300, h)));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      <TopBar />
      <MediaStatusBar />
      <div className="workspace">
        <LeftPanel />
        <Player />
        <Inspector />
      </div>
      <div className="hsplit" onPointerDown={startDrag} />
      <Timeline height={tlH} />
      {modal === 'export' && <ExportDialog />}
      {modal === 'trim' && <TrimDialog />}
      {modal === 'shortcuts' && (
        <Modal title="Atalhos de teclado" onClose={() => useStore.setState({ modal: null })} width={480}>
          <div className="shortcuts">
            {SHORTCUTS.map(([a, b]) => (
              <React.Fragment key={a}><span>{a}</span><span><kbd>{b}</kbd></span></React.Fragment>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

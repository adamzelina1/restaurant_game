import { useEffect } from 'preact/hooks';
import type { GameRunner } from '../game/runner';
import { HiringPanel } from './HiringPanel';
import { Hud } from './Hud';
import { useLive } from './hooks';
import { Menu } from './Menu';
import { Messages } from './Messages';
import { RecipePicker } from './RecipePicker';
import { SelectionPanel } from './SelectionPanel';
import { StaffPanel } from './StaffPanel';
import { BuildPanel } from './BuildPanel';
import { cancelBuildTool, enterBuild, exitBuild, rotateBuild } from './buildActions';
import { ui } from './store';

export function App({ runner }: { runner: GameRunner }) {
  useLive(runner);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const build = ui.state.build;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!build.active) runner.setPaused(!runner.paused);
      } else if (e.code === 'KeyR' && build.active) {
        rotateBuild();
      } else if (e.code === 'KeyB' && !ui.state.modal && !ui.state.picker) {
        if (build.active) exitBuild(runner);
        else enterBuild(runner);
      } else if (e.code === 'Escape' && build.active) {
        cancelBuildTool();
      } else if (e.code === 'Escape') {
        if (ui.state.picker || ui.state.menuOpen || ui.state.modal) ui.set({ picker: null, menuOpen: false, modal: null });
        else ui.set({ selected: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runner]);

  return (
    <>
      <Hud runner={runner} />
      <SelectionPanel runner={runner} />
      <BuildPanel runner={runner} />
      <Messages runner={runner} />
      <RecipePicker runner={runner} />
      <StaffPanel runner={runner} />
      <HiringPanel runner={runner} />
      <Menu runner={runner} />
      {runner.paused && !ui.state.build.active && <div class="paused-banner">PAUSED</div>}
    </>
  );
}

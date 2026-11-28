import {TitleEmblem} from './TitleEmblem';

export function GameBrand() {
  return <header className="game-home-brand">
    <div><img src="/ieaum-shell-mark.png" width={32} height={32} alt=""/><bdi>IEAUM</bdi></div>
    <TitleEmblem />
  </header>;
}

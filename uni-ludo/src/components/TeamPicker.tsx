import {TEAM_ORDER, TEAMS, type TeamId} from '../../../portal/uniludo/constants';
import {TeamSymbol} from './FacultyIcon';

export function TeamPicker({selected, names = {}, disabled, onSelect}: {
  selected?: TeamId | null; names?: Partial<Record<TeamId, string>>;
  disabled?: boolean; onSelect: (team: TeamId) => void;
}) {
  return <div className="team-picker-panel">
    <div className="team-picker-heading">
      <span>نقش خودت را انتخاب کن</span>
      {selected && <span>{TEAMS[selected].name}</span>}
    </div>
    <div className="team-picker" role="group" aria-label="انتخاب نقش">
      {TEAM_ORDER.map(team => {
        const faculty = TEAMS[team];
        return <button key={team} type="button" aria-pressed={selected === team} disabled={disabled || Boolean(names[team])}
          title={names[team]} onClick={() => onSelect(team)}>
          <span className="team-picker-icon" style={{borderColor: faculty.color, backgroundColor: faculty.colorDark}}>
            <TeamSymbol teamId={team} className="w-5 h-5"/>
          </span>
          <span>{faculty.shortName}</span>
        </button>;
      })}
    </div>
  </div>;
}

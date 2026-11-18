// How the board looks: 3D on or off, tilt on phones, and the skin picker (numbers, pictures, the
// player's own photo). Inline controls, no dialog. Handlers come from the hooks (use-look.ts,
// use-orientation-tilt.ts); a skin button names its skin in data-skin.
import type { ChangeEvent, MouseEvent, ReactElement } from 'react';
import type { Look } from './preferences.ts';
import { type SkinOption, skinOptions } from './view-model.ts';

export interface LookControlsProps {
  look: Look;
  photo: string | undefined;
  photoNote: string | undefined;
  /** Why the 3D board is not shown although it is on, e.g. no WebGL. */
  sceneNote: string | undefined;
  /** The "Enable tilt" control: undefined when it is not offered. */
  tilt: { on: boolean } | undefined;
  onPickSkin: (event: MouseEvent<HTMLElement>) => void;
  onToggle3d: () => void;
  onToggleTilt: () => void;
  onToggleNumbers: () => void;
  onPhotoFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
}

function Thumbnail(props: { option: SkinOption }): ReactElement {
  const { thumbnail } = props.option;
  if (thumbnail === undefined) {
    return (
      <span className="sp-thumb sp-thumb-numbers" aria-hidden="true">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
      </span>
    );
  }
  return <img className="sp-thumb" src={thumbnail} alt="" width={56} height={56} />;
}

function SkinGrid(props: LookControlsProps): ReactElement {
  return (
    <div className="sp-skin-grid" role="group" aria-label="Pictures">
      {skinOptions(props.photo).map((option) => (
        <button
          key={option.id}
          type="button"
          className="sp-skin"
          data-skin={option.id}
          data-testid={`skin-${option.id}`}
          aria-pressed={option.id === props.look.skin}
          onClick={props.onPickSkin}
        >
          <Thumbnail option={option} />
          <span className="sp-skin-name">{option.title}</span>
        </button>
      ))}
    </div>
  );
}

function PhotoChoice(props: LookControlsProps): ReactElement {
  return (
    <div className="sp-photo">
      <div className="sp-row">
        <label className="sp-button sp-file">
          Use your own photo
          <input
            type="file"
            accept="image/*"
            className="sp-file-input"
            data-testid="photo-input"
            onChange={props.onPhotoFile}
          />
        </label>
        {props.photo === undefined ? null : (
          <button
            type="button"
            className="sp-button"
            data-testid="remove-photo"
            onClick={props.onRemovePhoto}
          >
            Remove photo
          </button>
        )}
      </div>
      <p className="sp-hint">Your photo stays on this device. It is never uploaded.</p>
      <p className="sp-hint sp-note" data-testid="photo-note" role="status">
        {props.photoNote}
      </p>
    </div>
  );
}

function current(props: LookControlsProps): string {
  return (
    skinOptions(props.photo).find((option) => option.id === props.look.skin)?.title ?? 'Numbers'
  );
}

/** 3D on or off, and on phones the tilt control. */
function SceneRow(props: LookControlsProps): ReactElement {
  return (
    <div className="sp-row">
      <button
        type="button"
        className="sp-button"
        data-testid="toggle-3d"
        aria-pressed={props.look.scene3d}
        onClick={props.onToggle3d}
      >
        3D board
      </button>
      {props.tilt === undefined ? null : (
        <button type="button" className="sp-button" data-testid="tilt" onClick={props.onToggleTilt}>
          {props.tilt.on ? 'Stop tilt' : 'Enable tilt'}
        </button>
      )}
    </div>
  );
}

export function LookControls(props: LookControlsProps): ReactElement {
  return (
    <div className="sp-look">
      <SceneRow {...props} />
      {props.sceneNote === undefined ? null : <p className="sp-hint">{props.sceneNote}</p>}
      <details className="sp-skins" data-testid="skin-picker">
        <summary className="sp-summary">
          Picture: <strong>{current(props)}</strong>
        </summary>
        <SkinGrid {...props} />
        <label className="sp-check">
          <input
            type="checkbox"
            data-testid="show-numbers"
            checked={props.look.numbers}
            onChange={props.onToggleNumbers}
          />
          Show numbers on pictures
        </label>
        <PhotoChoice {...props} />
      </details>
    </div>
  );
}

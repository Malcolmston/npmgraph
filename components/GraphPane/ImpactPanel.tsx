import { useState } from 'react';

import { useGlobalState } from '../../lib/GlobalStore.ts';
import {
  getDependents,
  getShortestPath,
  storeGraph,
  type Dependent,
} from '../../lib/graphDb.ts';
import { flash } from '../Flash/flash.ts';
import * as styles from './ImpactPanel.module.scss';

const DB_HINT =
  'Is the graph database running? (docker compose --profile graph up)';

function dependentLabel(dependent: Dependent): string {
  return dependent.key ?? dependent.name ?? JSON.stringify(dependent);
}

export default function ImpactPanel() {
  const [graph] = useGlobalState('graph');

  const [saving, setSaving] = useState(false);

  const [dependentsName, setDependentsName] = useState('');
  const [dependents, setDependents] = useState<Dependent[] | undefined>(
    undefined,
  );
  const [dependentsLoading, setDependentsLoading] = useState(false);

  const [pathFrom, setPathFrom] = useState('');
  const [pathTo, setPathTo] = useState('');
  const [path, setPath] = useState<string[] | undefined>(undefined);
  const [pathLoading, setPathLoading] = useState(false);

  const handleSave = () => {
    const packages = [...graph.entryModules].map(module => module.key);
    if (packages.length === 0) {
      flash('No modules in the current graph to save.');
      return;
    }

    setSaving(true);
    void (async () => {
      try {
        const counts = await storeGraph(packages);
        flash(
          `Saved graph: ${counts.nodes} nodes, ${counts.edges} edges.`,
          '#0a0',
        );
      } catch (error) {
        flash(error, 'error');
        flash(DB_HINT);
      } finally {
        setSaving(false);
      }
    })();
  };

  const handleFindDependents = () => {
    const name = dependentsName.trim();
    if (!name) {
      flash('Enter a package name to find dependents.');
      return;
    }

    setDependentsLoading(true);
    void (async () => {
      try {
        const result = await getDependents(name);
        setDependents(result);
      } catch (error) {
        setDependents(undefined);
        flash(error, 'error');
        flash(DB_HINT);
      } finally {
        setDependentsLoading(false);
      }
    })();
  };

  const handleFindPath = () => {
    const from = pathFrom.trim();
    const to = pathTo.trim();
    if (!from || !to) {
      flash('Enter both a "from" and "to" package.');
      return;
    }

    setPathLoading(true);
    void (async () => {
      try {
        const result = await getShortestPath(from, to);
        setPath(result);
      } catch (error) {
        setPath(undefined);
        flash(error, 'error');
        flash(DB_HINT);
      } finally {
        setPathLoading(false);
      }
    })();
  };

  return (
    <div className={styles.root}>
      <div className={styles.tool}>
        <div className={styles.toolTitle}>Save current graph</div>
        <div className={styles.row}>
          <button
            className={styles.button}
            disabled={saving}
            onClick={handleSave}
            type="button"
          >
            {saving ? 'Saving…' : 'Save graph to database'}
          </button>
        </div>
      </div>

      <div className={styles.tool}>
        <div className={styles.toolTitle}>Find dependents</div>
        <div className={styles.row}>
          <input
            className={styles.input}
            onChange={event => {
              setDependentsName(event.target.value);
            }}
            placeholder="package name"
            type="text"
            value={dependentsName}
          />
          <button
            className={styles.button}
            disabled={dependentsLoading}
            onClick={handleFindDependents}
            type="button"
          >
            {dependentsLoading ? 'Finding…' : 'Find'}
          </button>
        </div>
        {dependents &&
          (dependents.length > 0 ? (
            <ul className={styles.results}>
              {dependents.map(dependent => (
                <li key={dependentLabel(dependent)}>
                  {dependentLabel(dependent)}
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>No dependents found.</div>
          ))}
      </div>

      <div className={styles.tool}>
        <div className={styles.toolTitle}>Shortest path</div>
        <div className={styles.row}>
          <input
            className={styles.input}
            onChange={event => {
              setPathFrom(event.target.value);
            }}
            placeholder="from"
            type="text"
            value={pathFrom}
          />
          <input
            className={styles.input}
            onChange={event => {
              setPathTo(event.target.value);
            }}
            placeholder="to"
            type="text"
            value={pathTo}
          />
          <button
            className={styles.button}
            disabled={pathLoading}
            onClick={handleFindPath}
            type="button"
          >
            {pathLoading ? 'Finding…' : 'Find path'}
          </button>
        </div>
        {path &&
          (path.length > 0 ? (
            <div className={styles.path}>{path.join(' → ')}</div>
          ) : (
            <div className={styles.empty}>No path.</div>
          ))}
      </div>
    </div>
  );
}

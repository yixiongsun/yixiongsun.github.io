"""Export a trusted simulation cofiring pickle as browser-readable JSON."""
import argparse
import hashlib
import json
import pickle
from pathlib import Path

import numpy as np


def export_cofiring(source: Path, output: Path, run_id: str) -> dict:
    payload = source.read_bytes()
    n, cell_pairs, x, ci, rawx = pickle.loads(payload)
    pairs = np.asarray(cell_pairs)
    scores = np.asarray(x, dtype=float)
    if pairs.shape != (1000, 2) or scores.shape != (1000, 9):
        raise ValueError('Expected 1,000 cell pairs with nine lag-bin scores each.')
    if pairs.dtype.kind not in 'iu' or np.any(pairs < 0) or np.any(pairs >= 1000):
        raise ValueError('Cell pairs must contain CA1 pyramidal population-local IDs.')
    if np.any(pairs[:, 0] == pairs[:, 1]):
        raise ValueError('Self-pairs are not supported.')
    keys = {tuple(sorted(map(int, pair))) for pair in pairs}
    if len(keys) != len(pairs) or len(np.unique(pairs)) != 50 or len(n) != 50:
        raise ValueError('Expected unique undirected pairs across 50 sampled cells.')

    edges = []
    for pair, bins in zip(pairs, scores):
        # Only positive, finite scores in the central lag bins contribute.
        central = bins[3:6]
        positive = central[np.isfinite(central) & (central > 0)]
        peak = float(np.max(positive)) if positive.size else None
        edges.append({'sourceLocalId': int(pair[0]), 'targetLocalId': int(pair[1]), 'score': peak})
    document = {
        'schemaVersion': 1,
        'runId': run_id,
        'populationId': 'ca1-py',
        'sourceFile': source.name,
        'sourceSha256': hashlib.sha256(payload).hexdigest(),
        'scoreDefinition': 'positive-peak-central-three-z-bins',
        'lagWindowMs': [-25, 25],
        'sampleLocalIds': sorted(map(int, np.unique(pairs))),
        'edges': edges,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    counts = {threshold: sum(e['score'] is not None and e['score'] > threshold for e in edges) for threshold in [2, 3, 4, 5]}
    print(json.dumps({'runId': run_id, 'pairs': len(edges), 'undefinedScores': sum(e['score'] is None for e in edges), 'connectionsAboveThreshold': counts}))
    return document


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--run-id', required=True)
    args = parser.parse_args()
    export_cofiring(args.source, args.output, args.run_id)

"""Export the seed-0 disease comparisons from Figure5-Copy1.ipynb's main analysis."""

import argparse
import json
from pathlib import Path
from urllib.parse import quote

from export_cofiring import export_cofiring
from export_network_run import _load_detector, export_run


RUNS = (
    ('ca3_ca1_rand', 'def_ca3a31ca1_min_125_max_135_sv0', 'Baseline', 'increased-glutamate-baseline'),
    ('ca3_ca1_rand', 'exp25%_150_ca3a31ca1_min_125_max_135_sv0', 'Experience strengthened', 'increased-glutamate-experience'),
    ('inhib', 'def_ca3a31_20_perc_10_sv0', 'Baseline', 'reduced-inhibition-baseline'),
    ('inhib', 'exp25%_150_ca3a31_20_perc_10_sv0', 'Experience strengthened', 'reduced-inhibition-experience'),
)


def export_disease_catalog(source_root: Path, output_root: Path, detector_module: Path) -> dict:
    detector = _load_detector(detector_module)
    entries = []
    for folder, run_id, label, category in RUNS:
        source = source_root / folder / run_id
        destination = output_root / run_id
        manifest = export_run(source, destination, run_id, label, category, 0, detector)
        export_cofiring(source / 'cofiring_25ms_100ms_window_2_3.pkl', destination / 'cofiring.json', run_id)
        entries.append({
            'id': run_id,
            'label': label,
            'conditionCategory': category,
            'seed': 0,
            'manifestUrl': f"{quote(run_id, safe='')}/manifest.json",
            'spwrEventCount': manifest['events']['count'],
        })
        print(f"Exported {run_id}: {manifest['eventCount']} spikes, {manifest['events']['count']} SPW-Rs")

    catalog = {'schemaVersion': 1, 'runs': entries}
    (output_root / 'disease-runs.json').write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')
    return catalog


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', required=True, type=Path, help='Trusted PFC-HPC directory containing ca3_ca1_rand and inhib')
    parser.add_argument('--output-root', required=True, type=Path)
    parser.add_argument('--detector-module', required=True, type=Path)
    args = parser.parse_args()
    export_disease_catalog(args.source_root.resolve(), args.output_root.resolve(), args.detector_module.resolve())

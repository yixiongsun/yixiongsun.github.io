import itertools
import tempfile
import unittest
import pickle
from pathlib import Path

import numpy as np
from export_cofiring import export_cofiring


class CofiringExportTests(unittest.TestCase):
    def test_positive_central_peak_and_undefined_scores(self):
        groups = [list(range(start, start + 10)) for start in [100, 300, 500, 700, 900]]
        pairs = [pair for a, b in itertools.combinations(groups, 2) for pair in itertools.product(a, b)]
        scores = np.zeros((1000, 9))
        scores[0] = [99, 99, 99, 2, 4, 3, 99, 99, 99]
        scores[1, 3:6] = [-5, 3, 4]
        scores[2, 3:6] = np.nan
        scores[3, 3:6] = [np.nan, 3, np.inf]
        scores[4, 3:6] = [-3, 0, -2]
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'cofiring.pkl'
            source.write_bytes(pickle.dumps(([0] * 50, pairs, scores, [], [])))
            data = export_cofiring(source, Path(folder) / 'cofiring.json', 'test')
        self.assertEqual([edge['score'] for edge in data['edges'][:5]], [4, 4, None, 3, None])
        self.assertEqual(data['edges'][0]['sourceLocalId'], 100)
        self.assertEqual(data['edges'][0]['targetLocalId'], 300)


if __name__ == '__main__':
    unittest.main()

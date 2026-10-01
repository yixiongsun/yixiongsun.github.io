export type Media =
  | { type: 'image'; src: string; alt: string }
  | { type: 'video'; src: string; poster?: string; alt: string }
  | { type: 'signal'; alt: string };

export interface Project {
  slug: string;
  year: string;
  title: string;
  summary: string;
  description: string;
  tools: string[];
  url?: string;
  media?: Media;
}

export interface Experience {
  period: string;
  organization: string;
  role: string;
  summary: string;
  tools: string[];
}

export interface ResearchItem {
  slug: string;
  year: string;
  type: 'publication' | 'poster' | 'talk';
  title: string;
  venue: string;
  authors?: string;
  status?: string;
  pdf?: string;
  image?: ImageMetadata;
  url?: string;
}

export const experience: Experience[] = [
  {
    period: '2021—',
    organization: 'Takehara Lab, University of Toronto',
    role: 'PhD Candidate, Systems Neuroscience',
    summary:
      'Lead a multi-year research program on hippocampal network dynamics and memory in Alzheimer’s disease, spanning in vivo electrophysiology, behavior, signal processing, computational modeling, and statistics.',
    tools: ['Electrophysiology', 'Python', 'MATLAB', 'PyTorch', 'Brian2', 'Statistics'],
  },
  {
    period: '2021',
    organization: 'Beagle Inc.',
    role: 'Software Developer',
    summary:
      'Improved document-parsing and NLP workflows for legal text, modernized a legacy platform, and built containerized CI/CD infrastructure on AWS.',
    tools: ['Django', 'PostgreSQL', 'Docker', 'AWS', 'Machine learning'],
  },
  {
    period: '2020—21',
    organization: 'Waldispühl Lab, McGill University',
    role: 'Undergraduate Researcher',
    summary:
      'Applied and extended the BayesPairing2 RNA secondary-structure and motif-discovery pipeline, contributing to validation and optimizing Bayesian-network construction and RNA model loading.',
    tools: ['Python', 'Bioinformatics', 'Probabilistic modeling'],
  },
  {
    period: '2018—21',
    organization: 'iVenuto.com Corporation',
    role: 'Software Developer',
    summary:
      'Shipped full-stack and iOS features for a visitor-management platform, maintained production infrastructure, led interns, and resolved escalated customer issues.',
    tools: ['Node.js', 'MongoDB', 'Objective-C', 'Swift', 'AWS', 'Redis'],
  },
  {
    period: '2016',
    organization: 'GHP Group Inc.',
    role: 'Mobile Software Developer',
    summary:
      'Built and released Bluetooth Low Energy applications for controlling connected fireplaces and smokers on iOS and Android.',
    tools: ['Objective-C', 'Java', 'iOS', 'Android', 'Bluetooth LE'],
  },
];

export const projects: Project[] = [
  {
    slug: 'evidneuro',
    year: '2026—',
    title: 'EvidNeuro',
    summary: 'Evidence-grounded neuroscience retrieval engine',
    description:
      'A scientific retrieval engine that converts research PDFs into layout-aware evidence objects, typed claims, measurements, normalized entities, and directed knowledge-graph relations, with provenance linking every result to its source. It combines hybrid BM25 and vector retrieval with reciprocal-rank fusion and optional LLM reranking, species-aware ontology normalization, evidence-strength grading, cross-paper contradiction detection, and cross-scale graph queries. The system is validated by 1,017 passing tests across 92 test files and a 60-paper neuroscience corpus containing 15,170 evidence objects, 9,047 claims, 598 measurements, and 2,990 directed relations.',
    tools: [
      'TypeScript',
      'LLM-assisted extraction',
      'MinerU',
      'BM25',
      'Vector search',
      'pgvector',
      'PostgreSQL',
      'Knowledge graphs',
    ],
  },
  {
    slug: 'neural-event-classification',
    year: '2026—',
    title: 'Neural event classification',
    summary: 'Sharp-wave ripple and interictal epileptiform discharge classification',
    description:
      'An end-to-end pipeline for detecting, curating, and classifying 7,701 neural events from 30 subjects as sharp-wave ripples, interictal epileptiform discharges (IEDs), or noise. The selected compact model combines multichannel waveforms, cross-channel attention, and coherence- and entropy-based features with calibrated rejection for uncertain events. Repeated subject-grouped internal cross-validation achieved 86.1% accuracy and 0.849 macro F1 across five folds and three seeds; no independent external cohort was evaluated.',
    tools: ['Python', 'PyTorch', 'Signal processing', 'CNNs', 'Subject-held-out evaluation'],
    url: 'https://github.com/yixiongsun/ripple_ied_classification',
    media: { type: 'signal', alt: 'Animated neural signal preview' },
  },
  {
    slug: 'hippocampal-memory',
    year: '2021—',
    title: 'Hippocampal network activity and memory impairment',
    summary: 'Electrophysiology, behavioral experiments, computational modeling',
    description:
      'A multi-year research program investigating how hippocampal network activity and neuronal population dynamics support memory, integrating experimental, computational, and statistical methods.',
    tools: ['Electrophysiology', 'Python', 'Brian2', 'Statistics'],
  },
  {
    slug: 'bayespairing',
    year: '2021',
    title: 'BayesPairing2 RNA structure prediction',
    summary: 'Research software and motif discovery',
    description:
      'Applied and helped validate the BayesPairing2 algorithm for RNA secondary-structure prediction and motif discovery.',
    tools: ['Python', 'Bioinformatics', 'Probabilistic modeling'],
  },
  {
    slug: 'rna-molecular-dynamics',
    year: '—',
    title: 'RNA molecular dynamics simulation',
    summary: 'Molecular simulation and visualization',
    description:
      'A simple molecular dynamics simulator for RNA molecules, with molecular visualization rendered in PyMOL.',
    tools: ['Python', 'PyMOL'],
    url: 'https://github.com/yixiongsun/MDSimulationRNA',
  },
  {
    slug: 'edge-detector',
    year: '2019',
    title: 'Edge Detector',
    summary: 'Deep-learning image segmentation · McGill CodeJam',
    description:
      'A web application that uses a deep-learning segmentation model to identify and extract selected components from uploaded images.',
    tools: ['Node.js', 'Python', 'OpenCV', 'DeepLab', 'TensorFlow'],
    url: 'https://github.com/yixiongsun/edge-detector',
  },
  {
    slug: 'smart-car-connect',
    year: '2019',
    title: 'Smart Car Connect',
    summary: 'Connected-vehicle mobile application · UofTHacks',
    description:
      'An Android application and Node.js backend for interacting with connected vehicles through the Smartcar API, including remote unlocking and location lookup.',
    tools: ['Java', 'Android Studio', 'Smartcar API', 'Node.js'],
    url: 'https://github.com/yixiongsun/smart-car-uofthacks',
  },
  {
    slug: 'dynamic-text-translator',
    year: '2018',
    title: 'Dynamic Text Translator',
    summary: 'Video OCR and translation · McGill CodeJam',
    description:
      'A web application that extracts text from uploaded video using OCR and translates it into a selected language.',
    tools: ['Node.js', 'Python', 'OpenCV', 'Google Cloud Vision', 'Google Translate'],
    url: 'https://github.com/yixiongsun/codejam-textrecognition',
  },
];

export const research: ResearchItem[] = [
  {
    slug: 'sharp-wave-ripple-disruption',
    year: '2026',
    type: 'publication',
    title:
      'Sharp wave-ripple disruption limits experience-dependent neuronal ensemble reorganization in amyloid-associated memory impairment',
    venue: 'Current Biology',
    authors:
      'Y. Sun, S. Chekhov, K. Zhang, S. Margarian, P. Bogle, C. J. Han, K. Ando, T. Suzuki, P. E. Fraser, J. Taxidis, and K. Takehara-Nishiuchi',
    status: 'In review',
  },
  {
    slug: 'medial-prefrontal-cortex-future',
    year: '2024',
    type: 'publication',
    title: 'The medial prefrontal cortex leaves the hippocampus when it prepares for the future',
    venue: 'Science Progress',
    authors: 'Y. Sun and K. Takehara-Nishiuchi',
    url: 'https://doi.org/10.1177/00368504241261833',
  },
  {
    slug: 'amyloidosis-ensemble-restructuring',
    year: '2026',
    type: 'poster',
    title: 'Amyloidosis disrupts experience-driven restructuring of hippocampal CA1 neuronal ensembles',
    venue: 'Data Sciences Institute Talent Showcase',
    authors:
      'Y. Sun, S. Chekhov, K. Zhang, S. Margarian, P. Bogle, C. J. Han, P. E. Fraser, J. Taxidis, and K. Takehara-Nishiuchi',
    image: dsi2026,
  },
  {
    slug: 'amyloidosis-coactivity-memory-encoding',
    year: '2025',
    type: 'poster',
    title:
      'Amyloidosis disrupts experience-driven coactivity formation among hippocampal CA1 neurons and impairs memory encoding',
    venue: 'Society for Neuroscience',
    authors:
      'Y. Sun, S. Chekhov, K. Zhang, S. Margarian, P. Bogle, C. J. Han, P. E. Fraser, J. Taxidis, and K. Takehara-Nishiuchi',
    image: sfnPosterOne2025,
  },
  {
    slug: 'ca1-spike-abnormalities',
    year: '2025',
    type: 'poster',
    title:
      'In silico modeling of amyloidosis-induced CA1 spike abnormalities: Unraveling the role of excess synaptic glutamate',
    venue: 'Society for Neuroscience',
    authors: 'Y. Sun, J. Taxidis, and K. Takehara-Nishiuchi',
    image: sfnPosterTwo2025,
  },
  {
    slug: 'rigid-functional-connectivity-tgcrnd8',
    year: '2025',
    type: 'poster',
    title:
      'Rigid functional connectivity among hippocampal CA1 neurons in TgCRND8 mice undermines the encoding of novel experience',
    venue: 'Canadian Association for Neuroscience',
    authors:
      'Y. Sun, S. Chekhov, S. Margarian, P. Bogle, C. J. Han, P. E. Fraser, J. Taxidis, and K. Takehara-Nishiuchi',
    image: can2025,
  },
  {
    slug: 'abnormal-sharp-wave-ripple-dynamics',
    year: '2024',
    type: 'poster',
    title: 'Abnormal hippocampal sharp wave ripple dynamics in TgCRND8 mice',
    venue: 'Society for Neuroscience',
    authors: 'Y. Sun, S. Chekhov, S. Margarian, P. E. Fraser, and K. Takehara-Nishiuchi',
    image: sfn2024,
  },
  {
    slug: 'sharp-wave-ripple-firing-rate-sfn',
    year: '2023',
    type: 'poster',
    title:
      "Firing rate modulation by sharp wave ripples of dorsal CA1 excitatory neurons is decoupled from environmental novelty in the TgCRND8 mouse model of Alzheimer's disease",
    venue: 'Society for Neuroscience',
    authors:
      'Y. Sun, S. Chekhov, S. Margarian, D. Zhao, P. E. Fraser, and K. Takehara-Nishiuchi',
    image: sfn2023,
  },
  {
    slug: 'sharp-wave-ripple-firing-rate-can',
    year: '2023',
    type: 'poster',
    title:
      "Firing rate modulation by sharp wave ripples of dorsal CA1 excitatory neurons is decoupled from environmental novelty in the TgCRND8 mouse model of Alzheimer's disease",
    venue: 'Canadian Association for Neuroscience',
    authors:
      'Y. Sun, S. Chekhov, S. Margarian, D. Zhao, P. E. Fraser, and K. Takehara-Nishiuchi',
    image: can2023,
  },
  {
    slug: 'listening-to-neurons-brain-bee',
    year: '2026',
    type: 'talk',
    title: "Listening to neurons: How brain activity changes in Alzheimer's disease",
    venue: 'Toronto Brain Bee',
    authors: 'Y. Sun',
  },
  {
    slug: 'artificial-ripple-spindle-coupling',
    year: '2022',
    type: 'talk',
    title: "Artificial ripple spindle coupling to rescue memory deficits in Alzheimer's disease",
    venue: 'Brain and Behaviour Seminar',
    authors: 'Y. Sun',
  },
  {
    slug: 'place-cells-seminar',
    year: '2022',
    type: 'talk',
    title: 'Place cells',
    venue: 'Brain and Behaviour Seminar',
    authors: 'Y. Sun and S. Chekhov',
  },
];
import type { ImageMetadata } from 'astro';
import can2023 from '../assets/posters/CAN_2023.png';
import can2025 from '../assets/posters/CAN_2025.png';
import dsi2026 from '../assets/posters/DSI.png';
import sfn2023 from '../assets/posters/SFN_2023.png';
import sfn2024 from '../assets/posters/SFN_2024.png';
import sfnPosterOne2025 from '../assets/posters/SFN_poster1_2025.png';
import sfnPosterTwo2025 from '../assets/posters/SFN_poster2_2025.png';

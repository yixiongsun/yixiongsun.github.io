import EvidNeuroCaseStudy from './evidneuro/CaseStudy.astro';
import NeuralEventCaseStudy from './neural-event-classification/CaseStudy.astro';
import SpwrNetworkCaseStudy from './spwr-network-simulation/CaseStudy.astro';

// Each detailed project has one entry component in its own folder.
export const caseStudies: Record<string, typeof EvidNeuroCaseStudy> = {
  evidneuro: EvidNeuroCaseStudy,
  'neural-event-classification': NeuralEventCaseStudy,
  'spwr-network-simulation': SpwrNetworkCaseStudy,
};

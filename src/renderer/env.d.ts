import type { MurmrAPI } from '../shared/types';

declare global {
  interface Window {
    murmr: MurmrAPI;
  }
}

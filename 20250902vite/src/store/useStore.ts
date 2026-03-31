// useStore.ts - Thin composer: combines all domain slices into the Zustand store.
// Business logic lives in slices/; this file only wires them together.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { FullStore } from './storeTypes';
import { createAuthSlice } from './slices/authSlice';
import { createDataSlice } from './slices/dataSlice';
import { createDeviceSlice } from './slices/deviceSlice';
import { createUiSlice, DEFAULT_SETTINGS } from './slices/uiSlice';
import { createSessionSlice } from './slices/sessionSlice';
import { createScriptSlice } from './slices/scriptSlice';
import { createTaskSlice } from './slices/taskSlice';
import { createTopologySlice } from './slices/topologySlice';

export const useStore = create<FullStore>()(
  persist(
    (set, get, api) => ({
      ...createAuthSlice(set, get, api),
      ...createDataSlice(set, get, api),
      ...createDeviceSlice(set, get, api),
      ...createUiSlice(set, get, api),
      ...createSessionSlice(set, get, api),
      ...createScriptSlice(set, get, api),
      ...createTaskSlice(set, get, api),
      ...createTopologySlice(set, get, api),
    }),
    {
      name: 'chaintrace-settings-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ settings: state.settings }),
      // Merge persisted settings back over the default so partial saves work correctly.
      merge: (persisted, current) => ({
        ...current,
        settings: { ...DEFAULT_SETTINGS, ...(persisted as Partial<FullStore>).settings },
      }),
    },
  ),
);

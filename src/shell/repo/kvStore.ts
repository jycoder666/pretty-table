import { createStore } from 'idb-keyval'

/** Single IndexedDB store for templates + draft (GC-6). */
export const kvStore = createStore('pretty-table', 'kv')
